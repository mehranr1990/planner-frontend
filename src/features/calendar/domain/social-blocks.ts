import type { CalendarProjection } from "@/data/social-domain";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { MINUTES_PER_DAY } from "@/lib/dates/clock-time";

/*
 * Social activities (SO-05 projections: Going / Maybe) as read-only calendar
 * blocks on their start day, in the Social layer. The API gives a start time
 * but no end, so a timed activity takes a nominal hour in the grid; one
 * without a time has no place in a minutes grid and stays in the list below.
 */

const PREFIX = "social:";
const NOMINAL_MINUTES = 60;

export const socialBlockId = (activityId: string) => `${PREFIX}${activityId}`;

/** The activity id of a Social block, or null for any other block. */
export function socialActivityIdOf(blockId: string): string | null {
  return blockId.startsWith(PREFIX) ? blockId.slice(PREFIX.length) : null;
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < MINUTES_PER_DAY ? minutes : null;
}

/** The timed projections starting on `day`, as Social day blocks. */
export function socialBlocksForDay(projections: readonly CalendarProjection[], day: string): DayBlock[] {
  const blocks: DayBlock[] = [];
  for (const projection of projections) {
    if (projection.startDay !== day || !projection.startTime) continue;
    const startMinutes = minutesOf(projection.startTime);
    if (startMinutes === null) continue;
    const endMinutes = Math.min(MINUTES_PER_DAY, startMinutes + NOMINAL_MINUTES);
    blocks.push({
      id: socialBlockId(projection.activityId),
      title: projection.title,
      scope: "social",
      kind: "event",
      done: false,
      energy: null,
      priority: null,
      startMinutes,
      endMinutes,
      durationMinutes: endMinutes - startMinutes,
    });
  }
  return blocks;
}
