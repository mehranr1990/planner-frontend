import { spansOverlap, type DayBlock, type MinuteSpan } from "../domain/day-blocks";

/*
 * Pure geometry of the timeline grid: minutes to pixels, a block's box, the
 * hour marks and how overlapping blocks share the width. Desktop draws 64px
 * per hour, below lg 56px (PM01); everything else follows from that scale.
 */

export const DESKTOP_PX_PER_HOUR = 64;
export const MOBILE_PX_PER_HOUR = 56;

/** Pixels per minute at the desktop (>= lg) or mobile scale. */
export const pxPerMinuteFor = (desktop: boolean): number =>
  (desktop ? DESKTOP_PX_PER_HOUR : MOBILE_PX_PER_HOUR) / 60;

/** The visual gap between two stacked blocks. */
export const BLOCK_GAP_PX = 4;
/** Blocks shorter than this use the single centred row. */
export const SHORT_BLOCK_PX = 40;
/** A 15-minute block stays tappable. */
export const MIN_BLOCK_PX = 24;
/** The hour-label column at inline-start. */
export const LABEL_COLUMN_PX = 60;
/** The now line starts here (it runs under the label column's end). */
export const NOW_LINE_INSET_PX = 50;
/** Room under the last hour line so its label is not clipped. */
export const GRID_BOTTOM_PAD_PX = 10;
/** Height of the next-free-slot placeholder. */
export const SLOT_PLACEHOLDER_PX = 44;

/** Distance from the top of the window to a minute-of-day. */
export const minuteToY = (minutes: number, windowStartMinutes: number, pxPerMinute: number): number =>
  (minutes - windowStartMinutes) * pxPerMinute;

export const blockTop = minuteToY;

export function blockHeight(durationMinutes: number, pxPerMinute: number): number {
  return Math.max(MIN_BLOCK_PX, durationMinutes * pxPerMinute - BLOCK_GAP_PX);
}

export const isShortBlock = (heightPx: number): boolean => heightPx < SHORT_BLOCK_PX;

/** Blocks at least this tall have room for a two-line title and a two-line meta: they wrap instead of truncating. */
export const ROOMY_BLOCK_PX = 64;
export const isRoomyBlock = (heightPx: number): boolean => heightPx >= ROOMY_BLOCK_PX;

export function gridHeight(window: MinuteSpan, pxPerMinute: number): number {
  return (window.endMinutes - window.startMinutes) * pxPerMinute + GRID_BOTTOM_PAD_PX;
}

/** Every whole hour from the window's start to its end, as minutes-of-day. */
export function hourMarks(window: MinuteSpan): number[] {
  const marks: number[] = [];
  for (let minutes = Math.ceil(window.startMinutes / 60) * 60; minutes <= window.endMinutes; minutes += 60) {
    marks.push(minutes);
  }
  return marks;
}

export interface Lane {
  /** 0-based lane of the block within its overlap cluster. */
  index: number;
  /** Lanes in the cluster (1 for a block that overlaps nothing). */
  count: number;
}

/**
 * Greedy lanes per cluster of transitively overlapping blocks. Desktop draws
 * overlaps stacked at full width (the board's "Overloaded day"); below lg the
 * lanes split the width so each block stays readable (mobile spec 1.3).
 */
export function assignLanes(blocks: readonly DayBlock[]): Map<string, Lane> {
  const sorted = [...blocks].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const lanes = new Map<string, Lane>();
  let cluster: { block: DayBlock; index: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const { block, index } of cluster) lanes.set(block.id, { index, count: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const block of sorted) {
    if (cluster.length > 0 && !spansOverlap(block, { startMinutes: -Infinity, endMinutes: clusterEnd })) flush();
    let index = laneEnds.findIndex((end) => end <= block.startMinutes);
    if (index === -1) {
      index = laneEnds.length;
      laneEnds.push(block.endMinutes);
    } else {
      laneEnds[index] = block.endMinutes;
    }
    cluster.push({ block, index });
    clusterEnd = cluster.length === 1 ? block.endMinutes : Math.max(clusterEnd, block.endMinutes);
  }
  flush();
  return lanes;
}
