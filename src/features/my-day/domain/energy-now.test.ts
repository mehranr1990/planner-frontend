import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import { sampleDays, sampleTasks } from "@/fixtures/personal";
import { createMockRepositories } from "@/data/mock";
import { exceedsEnergy, orderByEnergy } from "./energy";
import { currentBlock, nextBlocks, nowSummary } from "./now";
import { dayBlock, sampleDayBlocks } from "./test-utils";

const NOW = 14 * 60 + 35;

describe("exceedsEnergy", () => {
  it("is true only for a task above the selected level", () => {
    expect(exceedsEnergy({ energy: "high" }, "medium")).toBe(true);
    expect(exceedsEnergy({ energy: "medium" }, "medium")).toBe(false);
    expect(exceedsEnergy({ energy: "low" }, "low")).toBe(false);
    expect(exceedsEnergy({ energy: null }, "low")).toBe(false);
    expect(exceedsEnergy({ energy: "high" }, "high")).toBe(false);
  });
});

describe("orderByEnergy", () => {
  const t = (id: string, energy: Task["energy"], priority: Task["priority"]) => ({ id, energy, priority });

  it("puts tasks that fit first, the rest after, each group by priority", () => {
    const tasks = [t("hi-urgent", "high", "urgent"), t("low-low", "low", "low"), t("med-high", "medium", "high"), t("none", null, null)];
    expect(orderByEnergy(tasks, "medium").map((task) => task.id)).toEqual(["med-high", "low-low", "none", "hi-urgent"]);
    expect(orderByEnergy(tasks, "low").map((task) => task.id)).toEqual(["low-low", "none", "hi-urgent", "med-high"]);
    expect(orderByEnergy(tasks, "high").map((task) => task.id)).toEqual(["hi-urgent", "med-high", "low-low", "none"]);
  });

  it("is stable on ties and does not mutate its input", () => {
    const tasks = [t("a", "medium", "medium"), t("b", "low", "medium"), t("c", "medium", "medium")];
    const copy = [...tasks];
    expect(orderByEnergy(tasks, "medium").map((task) => task.id)).toEqual(["a", "b", "c"]);
    expect(tasks).toEqual(copy);
  });

  it("keeps the board's Unscheduled order at medium energy", async () => {
    const { tasks } = createMockRepositories();
    const today = await tasks.listUnscheduled({ day: sampleDays.today, range: "today" });
    expect(orderByEnergy(today, "medium").map((task) => task.id)).toEqual(today.map((task) => task.id));
  });
});

describe("currentBlock / nextBlocks", () => {
  const blocks = sampleDayBlocks();

  it("at 14:35 the live block is UI design and the next two are the client call and the gym", () => {
    expect(currentBlock(blocks, NOW)?.id).toBe("ui-design");
    expect(nextBlocks(blocks, NOW, 2).map((block) => [block.id, block.startMinutes])).toEqual([
      ["client-call", 990],
      ["gym", 1035],
    ]);
  });

  it("is null between blocks and for done blocks; a block ends exclusively", () => {
    expect(currentBlock(blocks, 1030)).toBeNull();
    expect(currentBlock(blocks, 600)).toBeNull(); // deep work is done
    expect(currentBlock(blocks, 960)).toBeNull(); // UI design ended at 16:00
    expect(currentBlock(blocks, 840)?.id).toBe("ui-design"); // starts inclusively
  });

  it("a break can be the live block", () => {
    expect(currentBlock(blocks, 800)?.id).toBe("lunch");
  });

  it("prefers a task block, then the earlier start, when blocks overlap", () => {
    const overlap = [dayBlock("event", "10:00", "11:00"), dayBlock("task", "10:30", "11:30", { kind: "task", taskId: "t" })];
    expect(currentBlock(overlap, 10 * 60 + 45)?.id).toBe("task");
    const two = [dayBlock("late", "10:30", "11:30"), dayBlock("early", "10:00", "11:00")];
    expect(currentBlock(two, 10 * 60 + 45)?.id).toBe("early");
  });

  it("nextBlocks skips done blocks and limits the count", () => {
    expect(nextBlocks(blocks, 0, 3).map((block) => block.id)).toEqual(["lunch", "ui-design", "client-call"]);
    expect(nextBlocks(blocks, 1100, 2)).toEqual([]);
  });
});

describe("nowSummary", () => {
  const blocks = sampleDayBlocks();
  const ui = blocks.find((block) => block.id === "ui-design")!;
  const uiTask = sampleTasks.find((task) => task.id === "t-ui-design")!;

  it("a task with logged effort reports effort: 35m left, 71%", () => {
    expect(nowSummary(ui, uiTask, NOW)).toEqual({ kind: "effort", leftMinutes: 35, progressPercent: 71 });
  });

  it("without logged effort it reports time to the block's end and the share elapsed", () => {
    const call = blocks.find((block) => block.id === "client-call")!;
    expect(nowSummary(call, null, 16 * 60 + 40)).toEqual({ kind: "time", leftMinutes: 20, progressPercent: 33 });
    expect(nowSummary(ui, { durationMinutes: 120 }, NOW)).toEqual({ kind: "time", leftMinutes: 85, progressPercent: 29 });
  });

  it("clamps: overspent effort leaves 0 and 100%, a block not yet started reads 0%", () => {
    expect(nowSummary(ui, { durationMinutes: 120, spentMinutes: 150 }, NOW)).toEqual({ kind: "effort", leftMinutes: 0, progressPercent: 100 });
    expect(nowSummary(ui, null, 800)).toMatchObject({ progressPercent: 0, leftMinutes: 160 });
  });

  it("falls back to the block length when the task has no duration", () => {
    expect(nowSummary(ui, { durationMinutes: null, spentMinutes: 60 }, NOW)).toEqual({ kind: "effort", leftMinutes: 60, progressPercent: 50 });
  });
});
