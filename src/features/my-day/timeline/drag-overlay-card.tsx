"use client";

import { useTranslations } from "next-intl";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { cn } from "@/lib/cn";
import { SNAP_MINUTES } from "@/lib/dates/clock-time";
import { EnergyBars } from "../ui/energy-bars";
import { blockStyle } from "../ui/scope-style";
import { useMyDayFormat } from "../ui/use-my-day-format";
import type { ActiveDrag } from "./drag-state";

/*
 * The card that follows the pointer: lifted (shadow, -1° tilt, outlined) with
 * the meta line "Dragging · 20m → snaps 15m". It mirrors its tilt in rtl so
 * the lift still reads from the inline-start side. It never takes pointer
 * events, so the column underneath stays the drop target.
 */

export function DragOverlayCard({ active }: { active: ActiveDrag }) {
  const t = useTranslations("MyDay.drag");
  const format = useMyDayFormat();
  const { planning } = usePlannerSettings();
  const { item, plan } = active;

  const duration =
    item.type === "task" ? (item.durationMinutes ?? planning.defaultDurationMinutes) : item.endMinutes - item.startMinutes;
  // "Not over a day" is just a drag in progress; a refused placement says so.
  const refused = plan.kind === "reject" && plan.reason !== "no-target";
  const tone = item.type === "block" ? blockStyle({ scope: item.scope, kind: item.kind }) : null;

  return (
    <div
      data-slot="drag-overlay-card"
      className={cn(
        "pointer-events-none flex size-full min-h-11 cursor-grabbing items-center gap-2.5 overflow-hidden rounded-[14px] px-3",
        "ring-1 ring-outline shadow-[0_18px_40px_color-mix(in_oklab,var(--text-primary)_18%,transparent)]",
        "-rotate-1 rtl:rotate-1",
        tone ? tone.root : "bg-surface text-fg",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[13px] leading-tight font-bold">
          <bdi dir="auto">{item.title}</bdi>
        </span>
        <span className={cn("truncate text-[11px] font-semibold", refused ? "text-danger-text" : "text-fg-muted")}>
          {refused
            ? t("cannotDrop")
            : t("label", { duration: format.duration(duration), step: format.duration(SNAP_MINUTES) })}
        </span>
      </span>
      <EnergyBars level={item.energy} decorative />
    </div>
  );
}
