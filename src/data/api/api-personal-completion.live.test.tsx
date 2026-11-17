import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createApiClient, newIdempotencyKey, typedAs } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths as PersonalPaths } from "@/api/generated/openapi-p6-personal";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { deletionStatus } from "@/features/auth/account-lifecycle-api";
import { signOut } from "@/features/auth/auth-api";
import { skip, startSession } from "@/features/focus/domain/timer";
import { useFocusRecovery } from "@/features/focus/focus-recovery";
import { focusStore } from "@/features/focus/focus-store";
import { weekToIntervals } from "@/features/personal-services/working-hours-sync";
import { addDaysToDay, weekdayOfDay } from "@/lib/dates/clock-time";
import { IRAN_WEEK } from "@/lib/dates/week";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { RepositoryError } from "../repositories";
import { createApiFocus } from "./api-focus";
import { createApiHabitsRepository } from "./api-habits-repository";
import { createApiNotificationsRepository } from "./api-notifications-repository";
import { createApiRoutinesRepository } from "./api-routines-repository";
import { revisionTag } from "./api-shared";
import { createApiWorkingHoursRepository } from "./api-working-hours-repository";
import { liveConfigured, liveSession } from "./live-support";

/*
 * P1-FRONTEND-LIVE acceptance for the Personal gap closure, against the real
 * backend (skipped unless configured, see live-support.ts). Real adapters and
 * the real Focus mirror over real HTTP; test records are titled "LIVE-ACC".
 * Working hours are restored; routine / habit archived; TRACKED focus entries
 * cannot be deleted by contract and are left (reported).
 */

const TAG = `LIVE-ACC ${new Date().toISOString().slice(0, 16)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const status = async (work: Promise<unknown>) => {
  try {
    await work;
    return 200;
  } catch (error) {
    if (error instanceof ApiHttpError) return error.status;
    if (error instanceof RepositoryError) return error.code;
    throw error;
  }
};

describe.skipIf(!liveConfigured)("live Personal gap closure", () => {
  it("unread count, deletion readiness, unauthenticated + not-found", { timeout: 60_000 }, async () => {
    const { client, end } = await liveSession();
    try {
      const notifications = createApiNotificationsRepository(client);
      const count = await notifications.unreadCount();
      const unread = await notifications.list("unread");
      console.info("[live] unread-count", count, "unread rows (≤50)", unread.length);
      expect(count).toBeGreaterThanOrEqual(0);
      if (count <= 50) expect(unread.length).toBe(count);

      const deletion = await deletionStatus(client);
      console.info("[live] deletion policy configured:", deletion.policyVersion !== null, "current job:", deletion.job?.state ?? null);

      const anonymous = createApiClient({ origin: process.env.API_LIVE_ORIGIN!, fetch: (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Origin: process.env.API_LIVE_TRUSTED_ORIGIN! } }) });
      expect(await status(anonymous.request("get", "/api/v1/me/settings"))).toBe(401);
      expect(await status(createApiRoutinesRepository(client).schedule("00000000-0000-4000-8000-000000000000"))).toBe("not-found");
    } finally {
      end();
    }
  });

  it("working hours: write, exceptions kept, day / week / zero / unknown capacity, restore", { timeout: 60_000 }, async () => {
    const { client, today, end } = await liveSession();
    const hours = createApiWorkingHoursRepository(client);
    const original = await hours.get();
    try {
      const exception = { date: addDaysToDay(today, 30), intervals: [] };
      await hours.update((current) => ({ intervalsByWeekday: current?.intervalsByWeekday ?? Array.from({ length: 7 }, () => []), exceptions: [...(current?.exceptions ?? []).filter((item) => item.date !== exception.date), exception] }));
      // The Settings write-through: weekly intervals replaced, exceptions untouched.
      const saved = await hours.update((current) => ({ intervalsByWeekday: weekToIntervals({ workHours: { start: "09:00", end: "17:00" }, week: IRAN_WEEK }), exceptions: current?.exceptions ?? [] }));
      expect(saved.workingHours?.exceptions).toContainEqual(exception);
      expect((await hours.get()).workingHours?.intervalsByWeekday[6]).toEqual([{ start: "09:00", end: "17:00" }]);

      // Stale If-Match is refused (409).
      const raw = typedAs<PersonalPaths>(client);
      expect(await status(raw.request("put", "/api/v1/planning/working-hours", { header: { "If-Match": revisionTag(original.revision) }, body: { workingHours: null } }))).toBe(409);

      const nextFriday = addDaysToDay(today, (5 - weekdayOfDay(today) + 7) % 7 || 7);
      const friday = await hours.capacity({ date: nextFriday });
      expect(friday?.days[0]).toMatchObject({ state: "CONFIGURED", availableMinutes: 0 });
      const day = await hours.capacity({ date: today });
      console.info("[live] today capacity", JSON.stringify(day?.days[0]));
      expect(day?.days[0]?.state).toMatch(/CONFIGURED|DST_GAP/);
      const weekStart = addDaysToDay(today, -((weekdayOfDay(today) - saved.firstDayOfWeek + 7) % 7));
      const week = await hours.capacity({ weekStartDate: weekStart });
      expect(week?.days).toHaveLength(7);
      expect(week?.days.map((d) => d.availableMinutes)).toContain(480);
      // A week start that is not the account's is refused.
      expect(await status(hours.capacity({ weekStartDate: addDaysToDay(weekStart, 1) }))).not.toBe(200);

      await hours.update(() => null);
      expect((await hours.capacity({ date: today }))?.days[0]).toMatchObject({ state: "UNKNOWN", availableMinutes: null });
    } finally {
      await hours.update(() => original.workingHours).catch((error) => console.error("[live] restore working hours FAILED", error));
      end();
    }
  });

  it("routine schedule, occurrences, START / COMPLETE, refused repeats, history, idempotent replay", { timeout: 90_000 }, async () => {
    const { client, today, end } = await liveSession();
    const habits = createApiHabitsRepository(client, { today: () => today });
    const routines = createApiRoutinesRepository(client);
    const habit = await habits.create({ title: `${TAG} habit` });
    let routine = await routines.create({ title: `${TAG} routine`, habitIds: [habit.id] });
    try {
      const schedule = { kind: "DAILY" as const, startDate: addDaysToDay(today, -2), endDate: null, weekdays: [], startTime: "00:00", expectedMinutes: 15, reminder: false, timezone: getPlannerTimeZone() };
      routine = await routines.setSchedule(routine, schedule);
      expect(await routines.schedule(routine.id)).toEqual(schedule);
      // Stale routine revision is refused.
      const raw = typedAs<PersonalPaths>(client);
      expect(await status(raw.request("patch", "/api/v1/routines/{id}/schedule", { path: { id: routine.id }, header: { "If-Match": revisionTag(1) }, body: { schedule: null } }))).toBe(409);

      const days = await routines.occurrences(routine.id, addDaysToDay(today, -2), addDaysToDay(today, 2));
      expect(days.map((d) => d.date)).toEqual([addDaysToDay(today, -2), addDaysToDay(today, -1), today, addDaysToDay(today, 1)]);
      const todayItem = days.find((d) => d.date === today)!;
      expect(todayItem).toMatchObject({ state: "PENDING", linkedHabits: 1, completedHabits: 0 });

      // Habit check-in is reflected in routine progress (server count from real records).
      await habits.setDone(habit.id, today, true);
      const started = await routines.execute((await routines.occurrences(routine.id, today, addDaysToDay(today, 1)))[0]!, "START");
      expect(started).toMatchObject({ state: "RUNNING", completedHabits: 1 });
      expect(await status(routines.execute(todayItem, "START"))).toBe(409);

      // Idempotent replay: same key + same body returns the same result, no second transition.
      const key = newIdempotencyKey();
      const send = () => raw.request("post", "/api/v1/routines/{id}/occurrences/{date}/execute", { path: { id: routine.id, date: today }, header: { "If-Match": revisionTag(started.revision), "Idempotency-Key": key }, body: { action: "COMPLETE" } });
      const first = (await send()).data;
      const replay = (await send()).data;
      expect(first.state).toBe("COMPLETED");
      expect(replay.revision).toBe(first.revision);
      expect(await status(routines.execute({ ...started, revision: first.revision, state: "COMPLETED" }, "SKIP"))).toBe(409);

      // Future day: not executable yet.
      const tomorrow = days.find((d) => d.date === addDaysToDay(today, 1))!;
      expect(await status(routines.execute(tomorrow, "SKIP"))).not.toBe(200);

      const history = await routines.occurrences(routine.id, addDaysToDay(today, -2), addDaysToDay(today, 1));
      console.info("[live] routine history", history.map((d) => `${d.date}:${d.state}:${d.completedHabits}/${d.linkedHabits}`).join(" "));
      expect(history.find((d) => d.date === today)?.state).toBe("COMPLETED");
    } finally {
      await routines.remove(routine).catch(() => undefined);
      await habits.setArchived(habit.id, true).catch(() => undefined);
      end();
    }
  });

  it("recoverable focus: mirror START → FINISH records one TRACKED entry and no manual one", { timeout: 60_000 }, async () => {
    const { client, today, end } = await liveSession();
    const focus = createApiFocus(client);
    const entries = async () => (await client.request("get", "/api/v1/time-entries", { query: { limit: "100", state: "RECORDED" } })).data.items;
    const before = new Set((await entries()).map((entry) => entry.id));
    const repositories = createMockRepositories();
    repositories.plan = { ...repositories.plan, focusRecovery: focus.focusRecovery };
    const wrapper = ({ children }: { children: ReactNode }) => <DataProvider repositories={repositories}>{children}</DataProvider>;
    window.localStorage.clear();
    focusStore.reset();
    const view = renderHook(() => useFocusRecovery(), { wrapper });
    try {
      const config = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4, autoStartNext: false };
      act(() => focusStore.update(() => startSession(config, null, Date.now())));
      await waitFor(() => expect(JSON.parse(window.localStorage.getItem("mp-focus-server") ?? "null")?.session.state).toBe("RUNNING"), { timeout: 10_000 });
      const id = JSON.parse(window.localStorage.getItem("mp-focus-server")!).session.id as string;
      await wait(4000);
      act(() => focusStore.update((s) => skip(s!, Date.now())));
      const span = focusStore.get()!.spans!.at(-1)!;
      await waitFor(() => expect(window.localStorage.getItem("mp-focus-server")).toBeNull(), { timeout: 10_000 });
      // What useFocusSync does next: the claimed span must not become a manual entry.
      await focus.recordFocusSessions(today, { count: 1, cycle: 2, spans: [span] });
      const created = (await entries()).filter((entry) => !before.has(entry.id));
      console.info("[live] focus entries", created.map((e) => `${e.kind}:${e.sessionId === id}:${Date.parse(e.endAt) - Date.parse(e.startAt)}ms`).join(" "));
      expect(created.filter((e) => e.kind === "MANUAL")).toHaveLength(0);
      expect(created.filter((e) => e.kind === "TRACKED" && e.sessionId === id)).toHaveLength(1);
      const session = await focus.focusRecovery!.get(id);
      expect(session.state).toBe("FINISHED");
    } finally {
      view.unmount();
      focusStore.clear();
      end();
    }
  });

  it("recoverable focus: a >60 s gap needs RECOVER, the gap is not counted, RESUME + FINISH", { timeout: 150_000 }, async () => {
    const { client, end } = await liveSession();
    const recovery = createApiFocus(client).focusRecovery!;
    let session = await recovery.create(`${TAG} focus`);
    try {
      session = await recovery.command(session, "START", newIdempotencyKey());
      await wait(3000);
      session = await recovery.command(session, "HEARTBEAT", newIdempotencyKey());
      expect(session.recoveryState).toBe("HEALTHY");
      await wait(65_000);
      expect(await status(recovery.command(session, "HEARTBEAT", newIdempotencyKey()))).toBe(409);
      expect((await recovery.get(session.id)).recoveryState).toBe("INTERRUPTED");
      session = await recovery.command(await recovery.get(session.id), "RECOVER", newIdempotencyKey());
      expect(session.state).toBe("PAUSED");
      console.info("[live] workMs after RECOVER (gap excluded):", session.workMs);
      expect(session.workMs).toBeLessThan(10_000);
      session = await recovery.command(session, "RESUME", newIdempotencyKey());
      await wait(2000);
      session = await recovery.command(session, "FINISH", newIdempotencyKey());
      expect(session.state).toBe("FINISHED");
      expect(session.workMs).toBeLessThan(15_000);
      expect(await status(recovery.command(session, "FINISH", newIdempotencyKey()))).toBe(409);
    } finally {
      if (session.state !== "FINISHED" && session.state !== "ABANDONED") await recovery.command(await recovery.get(session.id), "DISCARD", newIdempotencyKey()).catch(() => undefined);
      end();
    }
  });

  it("session: restored per request, sign-out ends it (401 afterwards)", { timeout: 30_000 }, async () => {
    const { client, end } = await liveSession();
    try {
      expect(await status(client.request("get", "/api/v1/me/settings"))).toBe(200);
      await signOut(client);
      expect(await status(client.request("get", "/api/v1/me/settings"))).toBe(401);
    } finally {
      end();
    }
  });
});
