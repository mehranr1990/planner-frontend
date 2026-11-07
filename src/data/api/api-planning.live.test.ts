import { describe, expect, it } from "vitest";
import { createApiClient } from "@/api/client";
import { addDaysToDay, dayOfInstant } from "@/lib/dates/clock-time";
import { APP_TIME_ZONE, setPlannerTimeZone } from "@/lib/dates/zone";
import { createDayPlans } from "./api-day-plans";
import { createApiPlanRepository } from "./api-plan-repository";
import { createApiTasksRepository } from "./api-tasks-repository";

/*
 * Phase 03 live check (skipped unless configured), same env as the Phase 01 live test:
 *   API_LIVE_ORIGIN API_LIVE_TRUSTED_ORIGIN API_LIVE_EMAIL API_LIVE_PASSWORD
 * Real date in the account zone, Day plan order/priorities/move, and catch-up
 * writes across repeated and concurrent loads.
 */
const origin = process.env.API_LIVE_ORIGIN;
const trusted = process.env.API_LIVE_TRUSTED_ORIGIN;
const email = process.env.API_LIVE_EMAIL;
const password = process.env.API_LIVE_PASSWORD;

function liveClient(counter?: { catchUps: number }) {
  const cookies = new Map<string, string>();
  const jarFetch: typeof fetch = async (input, init = {}) => {
    const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers));
    headers.Origin = trusted!;
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (counter && String(input).endsWith("/catch-up")) counter.catchUps += 1;
    const response = await fetch(input, { ...init, headers });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const index = pair!.indexOf("=");
      cookies.set(pair!.slice(0, index).trim(), pair!.slice(index + 1));
    }
    return response;
  };
  return createApiClient({ origin: origin!, fetch: jarFetch });
}

describe.skipIf(!origin || !trusted || !email || !password)("live planning", () => {
  it("real today: plan order, priorities, move on reschedule; catch-up without duplicates", { timeout: 120_000 }, async () => {
    const counter = { catchUps: 0 };
    const client = liveClient(counter);
    await client.request("post", "/api/v1/auth/sign-in/email", { body: { email: email!, password: password! } });
    const zone = (await client.request("get", "/api/v1/me/settings")).data.timezone;
    setPlannerTimeZone(zone);
    const today = dayOfInstant(new Date().toISOString());
    const tomorrow = addDaysToDay(today, 1);
    const build = () => {
      const dayPlans = createDayPlans(client);
      const tasks = createApiTasksRepository(client, { today: () => today, fallback: { listAreas: async () => [] }, dayPlans });
      return { tasks, plan: createApiPlanRepository(dayPlans, tasks, { focusToday: async () => ({}) as never, recordFocusSessions: async () => ({}) as never }) };
    };
    try {
      // Recurrence window = real today: the first load may catch up; repeated and concurrent loads add no occurrences.
      await build().tasks.list({ view: "all" });
      counter.catchUps = 0;
      await Promise.all([build().tasks.list({ view: "all" }), build().tasks.list({ view: "all" })]);
      await build().tasks.list({ view: "all" });
      expect(counter.catchUps).toBe(0);
      const series = (await client.request("get", "/api/v1/task-recurrences", { query: { limit: "100" } })).data.items;
      for (const item of series) {
        const horizon = item.definition.endDate && item.definition.endDate < addDaysToDay(today, 7) ? item.definition.endDate : addDaysToDay(today, 7);
        expect(item.retiredAt || (item.scannedThrough ?? "") >= horizon).toBeTruthy();
        const occurrences = (await client.request("get", "/api/v1/task-recurrences/{id}/occurrences", { path: { id: item.id }, query: { limit: "100" } })).data.items;
        expect(new Set(occurrences.map((o) => o.localDate)).size).toBe(occurrences.length);
      }

      const { tasks } = build();
      const stamp = Date.now();
      const made = [];
      for (const name of ["A", "B", "C"]) made.push(await tasks.create({ title: `P03 ${name} ${stamp}`, date: today, durationMinutes: 30 }));
      const [ta, tb, tc] = made as [typeof made[0], typeof made[0], typeof made[0]];

      // Manual order (Day plan): creates today's plan on demand.
      await tasks.reorder({ ids: [tc.id, ta.id] });
      const reloaded = build();
      const listed = (await reloaded.tasks.list({ view: "today", sort: "manual" })).filter((t) => t.title.endsWith(String(stamp)));
      expect(listed.slice(0, 2).map((t) => t.id)).toEqual([tc.id, ta.id]);

      // Priorities = first plan items; setting them puts the chosen ones first.
      const top = await reloaded.plan.setPriorities(today, [{ kind: "task", id: tb.id }, { kind: "task", id: tc.id }]);
      expect(top.slice(0, 3).map((p) => p.id)).toEqual([tb.id, tc.id, ta.id]);
      expect(top[0]).toMatchObject({ rank: 1, title: tb.title, durationMinutes: 30 });

      // Reschedule A to tomorrow: Task day changes and its plan item moves (no duplicate Task).
      await reloaded.tasks.update(ta.id, { date: tomorrow });
      const todayPlan = (await client.request("get", "/api/v1/planning/days/{date}", { path: { date: today } })).data;
      const tomorrowPlan = (await client.request("get", "/api/v1/planning/days/{date}", { path: { date: tomorrow } })).data;
      expect(todayPlan.items.some((i) => i.taskId === ta.id)).toBe(false);
      expect(tomorrowPlan.items.some((i) => i.taskId === ta.id)).toBe(true);
      expect((await build().tasks.get(ta.id))?.date).toBe(tomorrow);
      const all = (await build().tasks.list({ view: "all" })).filter((t) => t.title.endsWith(String(stamp)));
      expect(all).toHaveLength(3);

      // Completion keeps the item (status from the Task).
      await reloaded.tasks.setDone(tb.id, true);
      expect((await reloaded.plan.priorities(today))[0]?.id).toBe(tb.id);

      await reloaded.tasks.remove(made.map((t) => t.id));
    } finally {
      setPlannerTimeZone(APP_TIME_ZONE);
    }
  });
});
