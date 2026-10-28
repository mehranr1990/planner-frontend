import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { blocksToMoveToTomorrow, computeCapacity, workWindow } from "@/features/my-day/domain/capacity";
import { toDayBlocks, type DayBlock } from "@/features/my-day/domain/day-blocks";
import { freeGaps, gapHints } from "@/features/my-day/domain/gaps";
import { currentBlock, nextBlocks } from "@/features/my-day/domain/now";
import { overlapMinutesByBlock } from "@/features/my-day/domain/overlap";
import { createMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { minutesOfInstant } from "@/lib/dates/clock-time";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { MY_DAY_STATES, myDayStateFixtures, myDayStateNow, type MyDayState } from "./my-day-states";
import { SAMPLE_DAY } from "./sample-day";

const english = createMyDayFormat({ locale: "en", digits: "latn", calendar: "jalali" });
const work = workWindow(DEFAULT_PLANNER_SETTINGS.workHours);

/** What the screen sees of a state: the day's blocks and tasks through the repositories. */
async function load(state: MyDayState) {
  const repositories = createMockRepositories({ fixtures: myDayStateFixtures(state) });
  const [blocks, tasks, unscheduled] = await Promise.all([
    repositories.blocks.listForDay(SAMPLE_DAY),
    repositories.tasks.list({ view: "all" }),
    repositories.tasks.listUnscheduled({ day: SAMPLE_DAY, range: "today" }),
  ]);
  const dayBlocks: DayBlock[] = toDayBlocks(blocks, SAMPLE_DAY, tasks);
  return { repositories, blocks, tasks, unscheduled, dayBlocks, capacity: computeCapacity(dayBlocks, work.totalMinutes) };
}

describe("my day demo states", () => {
  it("are all built, deterministic and independent", () => {
    for (const state of MY_DAY_STATES) {
      expect(myDayStateFixtures(state), state).toEqual(myDayStateFixtures(state));
    }
    // Building a state never hands out the shared fixture arrays.
    const first = myDayStateFixtures("overloaded");
    const second = myDayStateFixtures("overloaded");
    expect(first.blocks).not.toBe(second.blocks);
  });

  it("only link blocks to tasks that exist, with unique ids", async () => {
    for (const state of MY_DAY_STATES) {
      const { blocks, tasks } = await load(state);
      const taskIds = new Set(tasks.map((task) => task.id));
      expect(taskIds.size, state).toBe(tasks.length);
      expect(new Set(blocks.map((block) => block.id)).size, state).toBe(blocks.length);
      for (const block of blocks) if (block.taskId) expect(taskIds.has(block.taskId), `${state}/${block.id}`).toBe(true);
    }
  });

  it("normal is the default sample day: 6h 15m of 8h planned, 1h 45m free", async () => {
    const { capacity, dayBlocks, unscheduled } = await load("normal");
    expect(myDayStateFixtures("normal")).toEqual({});
    expect(capacity).toMatchObject({ plannedMinutes: 375, totalMinutes: 480, freeMinutes: 105, state: "normal" });
    expect(english.duration(capacity.plannedMinutes)).toBe("6h 15m");
    expect(english.duration(capacity.freeMinutes)).toBe("1h 45m");
    expect(currentBlock(dayBlocks, 14 * 60 + 35)?.id).toBe("ui-design");
    expect(unscheduled).toHaveLength(4);
  });

  it("empty has no blocks, nothing running and five open tasks waiting", async () => {
    const { capacity, dayBlocks, unscheduled, repositories } = await load("empty");
    expect(dayBlocks).toEqual([]);
    expect(capacity).toMatchObject({ state: "empty", plannedMinutes: 0, freeMinutes: 480 });
    expect(unscheduled).toHaveLength(5);
    expect(unscheduled.every((task) => task.status === "open" && task.time === null)).toBe(true);
    expect(currentBlock(dayBlocks, 14 * 60 + 35)).toBeNull();
    await expect(repositories.plan.priorities(SAMPLE_DAY)).resolves.toEqual([]);
    expect(english.duration(capacity.freeMinutes)).toBe("8h");
  });

  it("partial is Deep work 09:00–10:30 and Lunch 12:00–12:45, with three tasks that fit the free time", async () => {
    const { capacity, dayBlocks, unscheduled } = await load("partial");
    expect(dayBlocks.map((block) => [block.title, block.startMinutes, block.endMinutes, block.kind])).toEqual([
      ["Deep work", 540, 630, "task"],
      ["Lunch", 720, 765, "break"],
    ]);
    // Lunch is a break: only Deep work counts, 90 of 480 minutes.
    expect(capacity).toMatchObject({ state: "partial", plannedMinutes: 90 });

    const gaps = freeGaps(dayBlocks, { startMinutes: work.startMinutes, endMinutes: work.endMinutes }, 60);
    expect(gaps.map((gap) => [gap.startMinutes, gap.endMinutes])).toEqual([
      [630, 720],
      [765, 1020],
    ]);
    // Four tasks wait, the 5h one fits nowhere: "… · 3 tasks fit" on every long gap.
    expect(unscheduled).toHaveLength(4);
    const hints = gapHints(dayBlocks, work, unscheduled, "medium");
    expect(hints.map((hint) => hint.fit)).toEqual([3, 3]);
  });

  it("overloaded reads 9h 40m of 8h with one 30m overlap and two blocks to move", async () => {
    const { capacity, dayBlocks } = await load("overloaded");
    expect(capacity.state).toBe("over");
    expect(capacity.plannedMinutes).toBe(580);
    expect(
      `${english.duration(capacity.plannedMinutes)} of ${english.duration(capacity.totalMinutes)}`,
    ).toBe("9h 40m of 8h");
    expect(capacity).toMatchObject({ overlapCount: 1, overlapMinutes: 30 });

    const overlaps = overlapMinutesByBlock(dayBlocks);
    expect(overlaps.get("od-design-review")).toBe(30);
    expect(dayBlocks.find((block) => block.id === "od-design-review")?.title).toBe("Design review");

    const movers = blocksToMoveToTomorrow(dayBlocks, work.totalMinutes);
    expect(movers).toHaveLength(2);
    expect(movers.every((block) => block.kind === "task" && !block.done)).toBe(true);
    // Lowest priority first, latest first on ties.
    expect(movers.map((block) => block.title)).toEqual(["Inbox zero", "Wrap-up and handover"]);
  });

  it("no-current puts the planner's 14:35 between blocks: nothing runs, the next one is 15:00", async () => {
    const now = minutesOfInstant(myDayStateNow("no-current"));
    expect(now).toBe(14 * 60 + 35);
    const { dayBlocks, tasks } = await load("no-current");
    expect(currentBlock(dayBlocks, now)).toBeNull();
    expect(nextBlocks(dayBlocks, now, 2).map((block) => [block.id, block.startMinutes])).toEqual([
      ["ui-design", 900],
      ["client-call", 990],
    ]);
    // The block and its task agree about the move.
    expect(tasks.find((task) => task.id === "t-ui-design")).toMatchObject({ time: "15:00", durationMinutes: 90 });
  });

  it("after-hours is 19:30 with every block over", async () => {
    const now = minutesOfInstant(myDayStateNow("after-hours"));
    expect(now).toBe(19 * 60 + 30);
    const { dayBlocks } = await load("after-hours");
    expect(dayBlocks.length).toBeGreaterThan(0);
    expect(currentBlock(dayBlocks, now)).toBeNull();
    expect(nextBlocks(dayBlocks, now, 3)).toEqual([]);
    expect(myDayStateFixtures("after-hours").now).toBe(myDayStateNow("after-hours"));
  });
});
