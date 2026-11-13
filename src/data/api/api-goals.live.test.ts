import { describe, expect, it } from "vitest";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { createDayPlans } from "./api-day-plans";
import { createApiGoalsRepository, withGoalLinks } from "./api-goals-repository";
import { createApiTasksRepository } from "./api-tasks-repository";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Phase 06 live check (skipped unless configured, see live-support.ts): create with a measure and
 * milestones → read → edit → milestones → linked task → lifecycle. Goals have no DELETE: the test
 * goal is left archived (ABANDONED); its task is deleted.
 */

describe.skipIf(!liveConfigured)("live goals", () => {
  it("create, read, edit, milestones, linked task, lifecycle", { timeout: 120_000 }, async () => {
    const { client, today, end } = await liveSession();
    const build = () => {
      const tasks = createApiTasksRepository(client, { today: () => today, fallback: { listAreas: async () => [] }, dayPlans: createDayPlans(client) });
      const goals = createApiGoalsRepository(client, { today: () => today, tasks });
      return { goals, tasks: withGoalLinks(tasks, goals) };
    };
    const madeGoals: string[] = [];
    const madeTasks: string[] = [];
    try {
      const title = `P06 goal ${Date.now()}`;
      const due = addDaysToDay(today, 30);
      const goal = await build().goals.create({
        title,
        dueDay: due,
        measure: { current: 2, target: 10, unit: "km" },
        milestones: [{ title: "First", dueDay: addDaysToDay(today, 7) }, { title: "Second", dueDay: null }],
        notes: "why",
      });
      madeGoals.push(goal.id);
      expect(goal).toMatchObject({ title, dueDay: due, measure: { current: 2, target: 10, unit: "km" }, notes: "why" });
      expect(goal.milestones?.map((m) => m.title)).toEqual(["First", "Second"]);

      const read = await build().goals.get(goal.id);
      expect(read).toMatchObject({ title, dueDay: due, lifecycle: "active" });
      expect(read?.milestones).toHaveLength(2);
      expect((await build().goals.list()).some((item) => item.id === goal.id)).toBe(true);

      // Edit from an adapter that never loaded the goal, then from a stale one.
      const stale = build().goals;
      await stale.get(goal.id);
      await build().goals.update(goal.id, { title: `${title} b`, measure: { current: 5, target: 10, unit: "km" } });
      const edited = await stale.update(goal.id, { notes: "because" });
      expect(edited).toMatchObject({ title: `${title} b`, notes: "because", measure: { current: 5 } });

      // Milestones: reach the first, insert one in the middle, reopen.
      const first = read!.milestones![0]!;
      const reached = await build().goals.setMilestoneDone(goal.id, first.id, true);
      expect(reached.milestones?.find((m) => m.id === first.id)?.doneDay).toBe(today);
      const inserted = await build().goals.addMilestone(goal.id, { title: "Middle", dueDay: null }, 1);
      expect(inserted.milestones?.map((m) => m.title)).toEqual(["First", "Middle", "Second"]);
      expect((await build().goals.get(goal.id))?.milestones?.map((m) => m.title)).toEqual(["First", "Middle", "Second"]);
      expect((await build().goals.setMilestoneDone(goal.id, first.id, false)).milestones?.find((m) => m.id === first.id)?.doneDay).toBeNull();

      // A task created with the goal is listed under it and carries the link.
      const task = await build().tasks.create({ title: `P06 task ${Date.now()}`, date: today, goalId: goal.id });
      madeTasks.push(task.id);
      expect((await build().goals.tasks(goal.id)).map((item) => item.id)).toContain(task.id);

      // Lifecycle: complete → back to active → archive.
      expect((await build().goals.setLifecycle(goal.id, "completed")).lifecycle).toBe("completed");
      expect((await build().goals.list("completed")).some((item) => item.id === goal.id)).toBe(true);
      expect((await build().goals.setLifecycle(goal.id, "active")).lifecycle).toBe("active");
    } finally {
      if (madeTasks.length) await build().tasks.remove(madeTasks).catch(() => undefined);
      for (const id of madeGoals) await build().goals.setLifecycle(id, "archived").catch(() => undefined);
      end();
    }
  });
});
