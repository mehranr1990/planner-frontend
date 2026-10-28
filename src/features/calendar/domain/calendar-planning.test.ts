import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import { toDayBlocks } from "@/features/my-day/domain/day-blocks";
import { protectedSpan } from "@/features/my-day/domain/placement";
import { rescheduleRows, resolveTarget } from "@/features/reschedule/plan-reschedule";
import { IRAN_WEEK } from "@/lib/dates/week";

/*
 * Calendar's slot suggestions come from the shared planning helpers: its
 * Reschedule host (Week / Day / Month / selected event) goes through
 * resolveTarget + rescheduleRows, the tray through My Day's auto-fit. Both
 * use suggestFreeSlot (protected window) and planningDurationMinutes.
 */

const TODAY = "2026-10-13";
const TOMORROW = "2026-10-14";
const task = {
  id: "t-brief",
  title: "Brief",
  scope: "personal",
  priority: null,
  energy: null,
  durationMinutes: 60,
  date: null,
  time: null,
  status: "open",
  labels: ["طراحی"],
} as Task;

function tomorrowSuggestion(options: { buffers?: Record<string, number>; guarded?: boolean }) {
  const blocksByDay = {
    [TODAY]: [],
    [TOMORROW]: toDayBlocks(
      [{ id: "b-lunch", title: "Lunch", scope: "personal", kind: "event", start: "2026-10-14T13:00:00+03:30", end: "2026-10-14T14:00:00+03:30" }],
      TOMORROW,
    ),
  };
  const resolved = resolveTarget(
    { kind: "task", id: task.id },
    { day: TODAY, blocksByDay, tasks: [task], defaultDurationMinutes: 30, estimateBuffers: options.buffers },
  )!;
  const rows = rescheduleRows({
    now: "2026-10-13T16:00:00+03:30",
    resolved,
    blocksByDay,
    week: IRAN_WEEK,
    workHours: { start: "08:00", end: "17:00" },
    protectedFocus: protectedSpan(options.guarded ? { start: "09:00", end: "12:00" } : null),
  });
  const row = rows.options.find((option) => option.id === "tomorrow");
  return { resolved, start: row && "startMinutes" in row ? row.startMinutes : null };
}

describe("Calendar suggestions · shared planning", () => {
  it("avoid the protected 09–12 window and hold the buffered length", () => {
    const { resolved, start } = tomorrowSuggestion({ buffers: { design: 50 }, guarded: true });
    // 60m raw × 1.5 = 90m: 12:00 has only an hour before lunch, so 14:00.
    expect(resolved.planMinutes).toBe(90);
    expect(resolved.totalMinutes).toBe(60);
    expect(start).toBe(14 * 60);
    // Raw length fits at 12:00; without the window it starts at 08:30.
    expect(tomorrowSuggestion({ guarded: true }).start).toBe(12 * 60);
    expect(tomorrowSuggestion({ buffers: { design: 50 } }).start).toBe(8 * 60 + 30);
  });
});
