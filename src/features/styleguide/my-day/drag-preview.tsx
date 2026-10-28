"use client";

import { DragGhost } from "@/features/my-day/timeline/drag-ghost";
import { DragOverlayCard } from "@/features/my-day/timeline/drag-overlay-card";
import type { ActiveDrag } from "@/features/my-day/timeline/drag-state";
import { blockHeight, minuteToY, pxPerMinuteFor } from "@/features/my-day/timeline/geometry";
import { resolvePlacement } from "@/features/my-day/domain/placement";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { SAMPLE_DAY } from "@/fixtures/personal/sample-day";

/*
 * The "Drag" state tile of the board, static: the lifted card (tilted,
 * shadowed, "Dragging · 45m → snaps 15m") over the hatched ghost at its
 * snap target, on a few hour lines. It reuses the real overlay and ghost, so
 * it cannot drift from the screen; nothing here is interactive.
 */

const WINDOW_START = 16 * 60;
const HOURS = [16, 17, 18];
const PX_PER_MINUTE = pxPerMinuteFor(true);
const LABEL_COLUMN = 60;

const placed = resolvePlacement({ day: SAMPLE_DAY, startMinutes: 17 * 60 + 15, durationMinutes: 45 });
if (!placed.ok) throw new Error("The drag preview placement must be valid.");
const { placement } = placed;

const ACTIVE: ActiveDrag = {
  keyboard: false,
  item: {
    type: "block",
    blockId: "preview-client-call",
    taskId: undefined,
    durationMinutes: 45,
    day: SAMPLE_DAY,
    title: "Client call",
    scope: "project",
    kind: "event",
    energy: "medium",
    startMinutes: 16 * 60 + 30,
    endMinutes: 17 * 60 + 15,
  },
  plan: {
    kind: "move",
    blockId: "preview-client-call",
    title: "Client call",
    placement,
    previous: { day: SAMPLE_DAY, start: "16:30", durationMinutes: 45 },
    overlaps: [],
    resized: false,
  },
};

export function DragPreview() {
  const format = useMyDayFormat();
  return (
    <div className="relative h-52 select-none" aria-hidden="true">
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute inset-x-0 flex items-center"
          style={{ top: minuteToY(hour * 60, WINDOW_START, PX_PER_MINUTE) + 8 }}
        >
          <span dir="ltr" className="tabular w-15 shrink-0 text-[11px] font-semibold text-fg-muted">
            {format.clock(hour * 60)}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
      ))}
      <div className="absolute inset-y-0 end-0" style={{ insetInlineStart: LABEL_COLUMN, top: 8 }}>
        <DragGhost
          placement={placement}
          overlapping={false}
          windowStartMinutes={WINDOW_START}
          pxPerMinute={PX_PER_MINUTE}
        />
        {/* The lifted card hovers a little off its snap target, as in the board. */}
        <div
          className="absolute inset-x-3 z-2"
          style={{
            top: minuteToY(placement.startMinutes, WINDOW_START, PX_PER_MINUTE) - 14,
            height: blockHeight(45, PX_PER_MINUTE),
          }}
        >
          <DragOverlayCard active={ACTIVE} />
        </div>
      </div>
    </div>
  );
}
