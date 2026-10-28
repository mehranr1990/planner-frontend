import { MINUTES_PER_DAY } from "@/lib/dates/clock-time";
import type { DayBlock, MinuteSpan } from "./day-blocks";

/**
 * The hours the timeline draws. Starts an hour before work (or at the
 * earliest block, whichever is first) and ends three hours after work (or
 * half an hour past the latest block), whole hours, within the day.
 * The default day (09:00–17:00 work, blocks 08:00–18:15) is 08:00–20:00.
 */
export function visibleWindow(blocks: readonly DayBlock[], work: MinuteSpan): MinuteSpan {
  const earliest = blocks.length > 0 ? Math.min(...blocks.map((block) => block.startMinutes)) : Infinity;
  const latest = blocks.length > 0 ? Math.max(...blocks.map((block) => block.endMinutes)) : -Infinity;
  const start = Math.floor(Math.min(work.startMinutes - 60, earliest) / 60) * 60;
  const end = Math.ceil(Math.max(work.endMinutes + 180, latest + 30) / 60) * 60;
  return {
    startMinutes: Math.max(0, start),
    endMinutes: Math.min(MINUTES_PER_DAY, end),
  };
}
