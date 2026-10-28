import { cn } from "@/lib/cn";
import type { Placement } from "../domain/placement";
import { DRAG_GHOST_STYLE } from "../ui/scope-style";
import { blockHeight, minuteToY } from "./geometry";

/*
 * Where the dragged item would land: a hatched block with a 1.5px deep
 * outline at the 15-minute snap target, rose when it would overlap another
 * block (the overlap is also spoken and toasted on drop). Decorative: the
 * announcements carry the same information.
 */
export function DragGhost({
  placement,
  overlapping,
  windowStartMinutes,
  pxPerMinute,
}: {
  placement: Pick<Placement, "startMinutes" | "durationMinutes">;
  overlapping: boolean;
  windowStartMinutes: number;
  pxPerMinute: number;
}) {
  return (
    <div
      aria-hidden
      data-slot="drag-ghost"
      data-overlapping={overlapping || undefined}
      className={cn(
        "pointer-events-none absolute inset-x-0 z-1 rounded-[16px]",
        overlapping ? "bg-danger-soft ring-[1.5px] ring-inset ring-danger" : DRAG_GHOST_STYLE,
      )}
      style={{
        top: minuteToY(placement.startMinutes, windowStartMinutes, pxPerMinute),
        height: blockHeight(placement.durationMinutes, pxPerMinute),
      }}
    />
  );
}
