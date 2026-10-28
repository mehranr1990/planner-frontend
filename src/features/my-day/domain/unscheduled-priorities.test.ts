import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import type { Task } from "@/data/domain";
import { sampleDays } from "@/fixtures/personal";
import { suggestTopThree } from "./priorities";
import { dayBlock, sampleDayBlocks } from "./test-utils";
import { summarize } from "./unscheduled";

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: id,
  scope: "personal",
  priority: null,
  energy: null,
  durationMinutes: null,
  date: "2026-10-13",
  time: null,
  status: "open",
  ...patch,
});

describe("summarize", () => {
  it("the board's Unscheduled header: 4 tasks · 2h 05m", async () => {
    const { tasks } = createMockRepositories();
    const today = await tasks.listUnscheduled({ day: sampleDays.today, range: "today" });
    expect(summarize(today)).toEqual({ count: 4, totalMinutes: 125 });
  });

  it("counts a task without a duration as zero minutes", () => {
    expect(summarize([{ durationMinutes: 30 }, { durationMinutes: null }])).toEqual({ count: 2, totalMinutes: 30 });
    expect(summarize([])).toEqual({ count: 0, totalMinutes: 0 });
  });
});

describe("suggestTopThree", () => {
  const options = { day: "2026-10-13", selectedEnergy: "medium" as const };

  it("orders by priority, then the nearer deadline", () => {
    const tasks = [
      task("medium", { priority: "medium" }),
      task("high-late", { priority: "high", deadline: "2026-10-20" }),
      task("urgent", { priority: "urgent" }),
      task("high-soon", { priority: "high", deadline: "2026-10-14" }),
    ];
    expect(suggestTopThree(tasks, [], options).map((ref) => ref.id)).toEqual(["urgent", "high-soon", "high-late"]);
  });

  it("returns task refs, at most three, ready for setPriorities", () => {
    const tasks = Array.from({ length: 5 }, (_, index) => task(`t${index}`, { priority: "high" }));
    const refs = suggestTopThree(tasks, [], options);
    expect(refs).toHaveLength(3);
    expect(refs.every((ref) => ref.kind === "task")).toBe(true);
  });

  it("prefers work that fits the energy, then work already on the timeline, on equal priority", () => {
    const tasks = [
      task("b-hard", { priority: "high", energy: "high" }),
      task("a-fits", { priority: "high", energy: "low" }),
      task("c-scheduled", { priority: "high", energy: "medium" }),
    ];
    const blocks = [dayBlock("blk", "10:00", "11:00", { kind: "task", taskId: "c-scheduled" })];
    expect(suggestTopThree(tasks, blocks, options).map((ref) => ref.id)).toEqual(["c-scheduled", "a-fits", "b-hard"]);
  });

  it("skips done tasks and tasks dated after the day, but keeps overdue ones", () => {
    const tasks = [
      task("done", { status: "done", priority: "urgent" }),
      task("future", { date: "2026-10-14", priority: "urgent" }),
      task("undated", { date: null, priority: "urgent" }),
      task("overdue", { date: "2026-10-10", priority: "low" }),
    ];
    expect(suggestTopThree(tasks, [], options).map((ref) => ref.id)).toEqual(["overdue"]);
  });

  it("works on the sample data", async () => {
    const { tasks } = createMockRepositories();
    const all = await tasks.list({ view: "today" });
    const refs = suggestTopThree(all, sampleDayBlocks(), options);
    expect(refs).toHaveLength(3);
    expect(refs[0]).toEqual({ kind: "task", id: "t-pay-electricity-bill" });
  });
});
