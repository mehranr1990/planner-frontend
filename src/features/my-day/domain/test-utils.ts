import { sampleBlocks, sampleDays, sampleTasks } from "@/fixtures/personal";
import { parseClockTime } from "@/lib/dates/clock-time";
import type { DayBlock } from "./day-blocks";
import { toDayBlocks } from "./day-blocks";

/* Test helpers for the My Day domain modules. Not used by product code. */

/** A block from "HH:mm" times; defaults to a medium-energy personal event. */
export function dayBlock(id: string, start: string, end: string, patch: Partial<DayBlock> = {}): DayBlock {
  const startMinutes = parseClockTime(start)!;
  const endMinutes = parseClockTime(end)!;
  return {
    id,
    title: id,
    scope: "personal",
    kind: "event",
    done: false,
    energy: "medium",
    priority: null,
    startMinutes,
    endMinutes,
    durationMinutes: endMinutes - startMinutes,
    ...patch,
  };
}

/** The sample day's seven blocks, as the board shows them (375m planned of 480m). */
export function sampleDayBlocks(): DayBlock[] {
  return toDayBlocks(sampleBlocks, sampleDays.today, sampleTasks);
}
