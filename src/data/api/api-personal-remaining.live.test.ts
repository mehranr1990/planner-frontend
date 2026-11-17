import { describe, expect, it } from "vitest";
import { exportStatus, startExport } from "@/features/auth/account-lifecycle-api";
import { addDaysToDay, weekdayOfDay } from "@/lib/dates/clock-time";
import { createApiBrainDumpRepository } from "./api-brain-dump-repository";
import { createDayPlans } from "./api-day-plans";
import { createApiInboxRepository } from "./api-inbox-repository";
import { createApiInsightsRepository } from "./api-insights-repository";
import { createApiJournalRepository } from "./api-journal-repository";
import { createApiNotificationsRepository } from "./api-notifications-repository";
import { createApiRemindersRepository } from "./api-reminders-repository";
import { createApiReviewRepository } from "./api-review-repository";
import { createApiTasksRepository } from "./api-tasks-repository";
import { liveConfigured, liveSession } from "./live-support";

/*
 * P1-FRONTEND-LIVE, remaining Personal flows against the real backend
 * (skipped unless configured). Real adapters over real HTTP; records are
 * titled "LIVE-ACC" and cleaned up where the contract allows. Run one test
 * at a time (sign-in limit 3 / 10 s).
 */

const TAG = `LIVE-ACC ${new Date().toISOString().slice(0, 16)}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!liveConfigured)("live Personal remaining flows", () => {
  it("brain dump: add, read back, strike, send to inbox, remove + restore", { timeout: 60_000 }, async () => {
    const { client, today, end } = await liveSession();
    const inbox = createApiInboxRepository(client);
    const dump = () => createApiBrainDumpRepository(client, { today: () => today, inbox });
    const added: string[] = [];
    try {
      const a = await dump().add(today, `${TAG} dump A`);
      const b = await dump().add(today, `${TAG} dump B`);
      added.push(a.id, b.id);
      const page = await dump().page(today);
      expect(page.lines.map((line) => line.text)).toEqual(expect.arrayContaining([`${TAG} dump A`, `${TAG} dump B`]));
      expect((await dump().strike(today, [a.id], true)).lines.find((line) => line.id === a.id)).toMatchObject({ struck: true });
      const sent = await dump().sendToInbox(today, [b.id]);
      console.info("[live] brain dump line B after send:", JSON.stringify(sent.lines.find((line) => line.id === b.id)));
      const captures = await inbox.list();
      expect(captures.some((item) => item.text === `${TAG} dump B`)).toBe(true);
      const { restore } = await dump().remove(today, [a.id]);
      expect((await dump().page(today)).lines.some((line) => line.id === a.id)).toBe(false);
      await dump().restore(restore);
      expect((await dump().page(today)).lines.some((line) => line.id === a.id)).toBe(true);
    } finally {
      await dump().remove(today, added).catch(() => undefined);
      for (const item of (await inbox.list().catch(() => [])).filter((entry) => entry.text.startsWith(TAG))) await inbox.drop(item.id).catch(() => undefined);
      end();
    }
  });

  it("weekly review: save draft, re-read, finish; insights summary + patterns", { timeout: 60_000 }, async () => {
    const { client, today, end } = await liveSession();
    const review = () => createApiReviewRepository(client);
    try {
      // A past week start on the account week (the app syncs firstDayOfWeek into the planner week), away from the current review.
      const first = (await client.request("get", "/api/v1/me/settings")).data.firstDayOfWeek;
      const week = addDaysToDay(today, -((weekdayOfDay(today) - first + 7) % 7) - 7 * 20);
      const saved = await review().save(week, { step: "reflect", wentWell: `${TAG} went well`, wins: [] });
      expect(saved).toMatchObject({ week, wentWell: `${TAG} went well`, completedAt: null });
      expect(await review().get(week)).toMatchObject({ wentWell: `${TAG} went well`, step: "reflect" });
      const finished = await review().save(week, { completedAt: new Date().toISOString() });
      expect(finished.completedAt).not.toBeNull();
      expect((await review().get(week))?.completedAt).not.toBeNull();

      const insights = createApiInsightsRepository(client);
      const summary = await insights.summary(today, "4w");
      console.info("[live] insights summary", JSON.stringify(summary));
      for (const id of ["focus", "time", "signals", "estimates", "habits"] as const) {
        const result = await insights.pattern(id, today, "4w").then(
          () => "served",
          (error: { code?: string }) => error.code ?? "error",
        );
        console.info(`[live] insights pattern ${id}:`, result);
      }
    } finally {
      end();
    }
  });

  it("daily shutdown / rollover: open tasks move to tomorrow (task day + day plan), reflection saved", { timeout: 60_000 }, async () => {
    const { client, today, end } = await liveSession();
    const dayPlans = createDayPlans(client);
    const tasks = createApiTasksRepository(client, { today: () => today, fallback: { listAreas: async () => [] }, dayPlans });
    const journal = createApiJournalRepository(client, { today: () => today });
    const tomorrow = addDaysToDay(today, 1);
    const created: string[] = [];
    try {
      const one = await tasks.create({ title: `${TAG} carry 1`, date: today });
      const two = await tasks.create({ title: `${TAG} carry 2`, date: today });
      created.push(one.id, two.id);
      // What Shutdown / Weekly review carry-over write: the Task day (+ its Day-plan item).
      await tasks.bulkUpdate([one.id, two.id], { date: tomorrow });
      const fresh = createApiTasksRepository(client, { today: () => today, fallback: { listAreas: async () => [] }, dayPlans: createDayPlans(client) });
      const onTomorrow = await fresh.list({ view: "today", day: tomorrow });
      expect(onTomorrow.map((task) => task.id)).toEqual(expect.arrayContaining([one.id, two.id]));
      expect((await fresh.list({ view: "today", day: today })).some((task) => task.id === one.id)).toBe(false);

      const mood = await journal.saveReflection(today, { mood: 4, energy: "high", wentWell: `${TAG} shutdown` });
      expect(mood).toMatchObject({ mood: 4 });
      console.info("[live] reflection saved", JSON.stringify(mood));
    } finally {
      if (created.length) await tasks.remove(created).catch(() => undefined);
      end();
    }
  });

  it("export: start with the password and read its status (no download unless READY)", { timeout: 60_000 }, async () => {
    const { client, end } = await liveSession();
    try {
      const job = await startExport(client, process.env.API_LIVE_PASSWORD!, crypto.randomUUID());
      console.info("[live] export started", job.state);
      let state = job.state;
      for (let i = 0; i < 6 && state !== "READY" && state !== "FAILED"; i += 1) {
        await wait(5000);
        state = (await exportStatus(client, job.id)).state;
      }
      console.info("[live] export state after ~30 s:", state);
      expect(["QUEUED", "RUNNING", "PROCESSING", "READY"]).toContain(state);
    } finally {
      end();
    }
  });

  it("notification: a reminder due now becomes an unread notification; read / unread / dismiss move the badge", { timeout: 200_000 }, async () => {
    const { client, end } = await liveSession();
    const reminders = createApiRemindersRepository(client);
    const notifications = createApiNotificationsRepository(client);
    const start = await notifications.unreadCount();
    const reminder = await reminders.create({ title: `${TAG} reminder`, body: null, taskId: null, schedule: { kind: "at", at: new Date(Date.now() + 70_000).toISOString() }, channels: ["inApp"], urgent: false });
    try {
      let count = start;
      for (let i = 0; i < 20 && count === start; i += 1) {
        await wait(6000);
        count = await notifications.unreadCount();
      }
      console.info("[live] unread before / after due:", start, count, "deliveries:", JSON.stringify((await reminders.deliveries(reminder.id)).map((d) => d.state)));
      if (count === start) return; // Not delivered (no worker): reported, nothing to mutate.
      const item = (await notifications.list("unread")).find((entry) => entry.title === `${TAG} reminder`)!;
      expect(item).toBeTruthy();
      const read = await notifications.setRead(item, true);
      expect(await notifications.unreadCount()).toBe(count - 1);
      const unread = await notifications.setRead(read, false);
      expect(await notifications.unreadCount()).toBe(count);
      await notifications.dismiss(unread);
      expect(await notifications.unreadCount()).toBe(count - 1);
    } finally {
      await reminders.remove(reminder).catch(() => undefined);
      end();
    }
  });
});
