import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { IRAN_WEEK } from "@/lib/dates/week";
import {
  autoArrange,
  initialDraft,
  isRepeatOffender,
  outcome,
  overloadSuggestion,
  routeDays,
  routePatch,
  tomorrowLoad,
  type PendingTask,
} from "./shutdown";

// 2026-10-13 is a Tuesday; 2026-10-15 a Thursday.
const TUESDAY = "2026-10-13";
const THURSDAY = "2026-10-15";

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  scope: "personal",
  priority: null,
  energy: null,
  durationMinutes: 30,
  date: TUESDAY,
  time: null,
  status: "open",
  ...extra,
});

const block = (startMinutes: number, endMinutes: number): DayBlock => ({
  id: `b-${startMinutes}`,
  title: "Block",
  scope: "personal",
  kind: "task",
  done: false,
  energy: null,
  priority: null,
  startMinutes,
  endMinutes,
  durationMinutes: endMinutes - startMinutes,
});

const pending = (id: string, durationMinutes: number, extra: Partial<PendingTask> = {}): PendingTask => ({
  id,
  title: id,
  durationMinutes,
  energy: null,
  priority: null,
  routed: true,
  ...extra,
});

describe("shutdown routing", () => {
  it("resolves the Iranian week: Thursday evening skips Friday to Saturday", () => {
    expect(routeDays(TUESDAY, IRAN_WEEK)).toMatchObject({ tomorrow: "2026-10-14", nextWorkingDay: "2026-10-14", thisWeek: THURSDAY, tomorrowIsWorkDay: true });
    expect(routeDays(THURSDAY, IRAN_WEEK)).toMatchObject({ tomorrow: "2026-10-16", nextWorkingDay: "2026-10-17", tomorrowIsWorkDay: false });
  });

  it("pre-fills Tomorrow unless rollover keeps tasks where they are, and maps routes to patches", () => {
    const tasks = [task("a"), task("b")];
    expect(initialDraft(tasks, "ask")).toEqual({ a: { to: "tomorrow" }, b: { to: "tomorrow" } });
    expect(initialDraft(tasks, "keep")).toEqual({});
    const days = routeDays(TUESDAY, IRAN_WEEK);
    expect(routePatch({ to: "next-working-day" }, days)).toEqual({ date: "2026-10-14", time: null });
    expect(routePatch({ to: "pick", day: "2026-10-20" }, days)).toEqual({ date: "2026-10-20", time: null });
    expect(routePatch({ to: "keep" }, days)).toEqual({ date: null, time: null });
    expect(routePatch({ to: "inbox" }, days)).toBeNull();
    expect(isRepeatOffender({ movedCount: 3 })).toBe(true);
  });

  it("counts the outcome live from the draft", () => {
    const tasks = [task("a"), task("b"), task("c"), task("d")];
    expect(outcome(12, tasks, { a: { to: "tomorrow" }, b: { to: "inbox" }, c: { to: "drop" } })).toEqual({
      planned: 16,
      completed: 12,
      tomorrow: 1,
      overdue: 1,
      inbox: 1,
      later: 0,
      dropped: 1,
    });
  });
});

describe("shutdown tomorrow", () => {
  const work = { startMinutes: 540, endMinutes: 960 };

  it("auto-arranges high energy first into free gaps and leaves what does not fit", () => {
    const blocks = [block(540, 630), block(660, 720)];
    const tasks = [pending("low", 30, { energy: "low" }), pending("high", 30, { energy: "high" }), pending("huge", 600)];
    const placed = autoArrange(blocks, tasks, {}, work);
    expect(placed.high).toBe(630);
    expect(placed.low).toBe(720);
    expect(placed.huge).toBeUndefined();
  });

  it("suggests moving routed low-priority work when tomorrow is over capacity", () => {
    const tasks = [pending("keep", 60, { priority: "high" }), pending("trip", 60, { priority: "low" }), pending("dated", 120, { routed: false })];
    const load = tomorrowLoad([block(540, 900)], tasks, 420);
    expect(load).toEqual({ plannedMinutes: 600, totalMinutes: 420, overMinutes: 180 });
    expect(overloadSuggestion(load, tasks).map((item) => item.id)).toEqual(["trip", "keep"]);
    expect(overloadSuggestion(tomorrowLoad([], tasks, 600), tasks)).toEqual([]);
  });
});
