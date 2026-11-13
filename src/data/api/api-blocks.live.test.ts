import { describe, expect, it } from "vitest";
import { createApiClient } from "@/api/client";
import { addDaysToDay, dayOfInstant, instantAtTime } from "@/lib/dates/clock-time";
import { APP_TIME_ZONE, setPlannerTimeZone } from "@/lib/dates/zone";
import { createApiBlocksRepository } from "./api-blocks-repository";
import { createDayPlans } from "./api-day-plans";
import { withBlockFollow } from "./api-task-block-follow";
import { createApiTasksRepository } from "./api-tasks-repository";

/*
 * Phase 04 live check (skipped unless configured), same env as the Phase 01 live test:
 *   API_LIVE_ORIGIN API_LIVE_TRUSTED_ORIGIN API_LIVE_EMAIL API_LIVE_PASSWORD
 * Real day in the account zone: schedule → view → move → stale-revision
 * recovery → Task ⇄ block follow (D5) → unschedule, then cleanup.
 */
const origin = process.env.API_LIVE_ORIGIN;
const trusted = process.env.API_LIVE_TRUSTED_ORIGIN;
const email = process.env.API_LIVE_EMAIL;
const password = process.env.API_LIVE_PASSWORD;

function liveClient() {
  const cookies = new Map<string, string>();
  const jarFetch: typeof fetch = async (input, init = {}) => {
    const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers));
    headers.Origin = trusted!;
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
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

describe.skipIf(!origin || !trusted || !email || !password)("live calendar blocks", () => {
  it("schedule, view, move, 409 recovery, task follow, unschedule", { timeout: 120_000 }, async () => {
    const client = liveClient();
    await client.request("post", "/api/v1/auth/sign-in/email", { body: { email: email!, password: password! } });
    setPlannerTimeZone((await client.request("get", "/api/v1/me/settings")).data.timezone);
    const today = dayOfInstant(new Date().toISOString());
    const day = addDaysToDay(today, 2);
    const next = addDaysToDay(today, 3);
    const build = () => {
      const tasks = createApiTasksRepository(client, { today: () => today, fallback: { listAreas: async () => [] }, dayPlans: createDayPlans(client) });
      const blocks = createApiBlocksRepository(client, { tasks });
      return { tasks: withBlockFollow(tasks, blocks.followTask), blocks };
    };
    const made: string[] = [];
    const first = build();
    try {
      const task = await first.tasks.create({ title: `P04 block ${Date.now()}`, date: day, durationMinutes: 30 });
      made.push(task.id);
      const mine = async (repo: ReturnType<typeof build>, on: string) => (await repo.blocks.listForDay(on)).filter((b) => b.taskId === task.id);

      // Schedule: one linked block, and the Task carries the same day/time.
      const block = await first.blocks.schedule(task.id, { day, start: "09:00" });
      expect(block).toMatchObject({ taskId: task.id, start: instantAtTime(day, "09:00") });
      expect(await mine(build(), day)).toHaveLength(1);
      expect(await build().tasks.get(task.id)).toMatchObject({ date: day, time: "09:00" });

      // A second session moves it; the first one still holds the old revision and recovers from the 409.
      const second = build();
      const [seen] = await mine(second, day);
      await second.blocks.move(seen!.id, { day, start: "10:00", durationMinutes: 45 });
      const moved = await first.blocks.move(block.id, { day, start: "11:00" });
      expect(moved.start).toBe(instantAtTime(day, "11:00"));
      expect(await mine(build(), day)).toHaveLength(1);

      // D5: a Task write outside the timeline takes its block along (no duplicate, nothing left behind).
      const third = build();
      await third.tasks.update(task.id, { date: next, time: "14:30" });
      expect(await mine(build(), day)).toHaveLength(0);
      const followed = await mine(build(), next);
      expect(followed).toHaveLength(1);
      // Read back in the server’s spelling of the same instant.
      expect(Date.parse(followed[0]!.start)).toBe(Date.parse(instantAtTime(next, "14:30")));

      // Unschedule: the block goes, the Task keeps its day and loses its time.
      const last = build();
      await last.blocks.unschedule((await mine(last, next))[0]!.id);
      expect(await mine(build(), next)).toHaveLength(0);
      const after = await build().tasks.get(task.id);
      expect(after?.date).toBe(next);
      expect(after?.time ?? null).toBeNull();
    } finally {
      if (made.length) await build().tasks.remove(made).catch(() => undefined);
      setPlannerTimeZone(APP_TIME_ZONE);
    }
  });
});
