"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { cn } from "@/lib/cn";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { UnscheduledBody, UnscheduledFilters } from "./unscheduled-list";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import { useUnscheduledDrop } from "./use-unscheduled-drop";
import { useUnscheduledModel } from "./use-unscheduled";

/*
 * Unscheduled (P02, mobile): PM01's collapsed bottom tray, "Unscheduled · 4 ·
 * long-press & drag up". The tray sits below the timeline, so a task is
 * long-pressed (the provider's TouchSensor) and dragged UP onto a slot; a
 * task block dragged down onto the tray takes it off the timeline. Expanding
 * shows the same pills and rows as the desktop card in a scroller that keeps
 * the timeline reachable (the page, not the tray, makes room).
 *
 * Rows swipe-to-reschedule is not built here: the Reschedule sheet is opened
 * from the timeline block's actions.
 */
export function UnscheduledTray({
  className,
  onExpandedChange,
}: {
  className?: string;
  /** Lets the page give the room back to the tray (the timeline shrinks while it is open). */
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const t = useTranslations("MyDay.unscheduled");
  const format = useMyDayFormat();
  const model = useUnscheduledModel();
  const onScreen = !useIsDesktop(false);
  const drop = useUnscheduledDrop(onScreen);
  const { setNodeRef } = drop;
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();

  const container = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      container.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );

  const label =
    model.todayCount === null ? t("title") : t("tray.title", { formatted: format.number(model.todayCount) });

  return (
    <div
      ref={setRef}
      data-slot="unscheduled-zone"
      data-drop-ready={drop.ready || undefined}
      data-drop-over={drop.over || undefined}
      className={cn(
        "rounded-utility transition-shadow",
        drop.ready && "outline-[1.5px] outline-offset-2 outline-dashed outline-scope-deep/50",
        drop.over && "outline-2 outline-solid outline-scope-deep",
        className,
      )}
    >
      <UtilityCard as="section" tone="surface" padding="none" aria-label={t("title")} className="gap-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={regionId}
          onClick={() => {
            setExpanded(!expanded);
            onExpandedChange?.(!expanded);
          }}
          className="flex min-h-12 w-full items-center gap-2 rounded-utility px-3 py-2.5 text-start"
        >
          <span className="text-sm font-bold">{label}</span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg-muted">
            {drop.ready ? t("dropToUnschedule") : t("tray.hint")}
          </span>
          {/* Vertical disclosure: it does not mirror, it turns over. */}
          <Icon icon={ChevronDown} size={16} className={cn("shrink-0 transition-transform", expanded && "rotate-180")} />
        </button>
        <div id={regionId} hidden={!expanded}>
          {expanded ? (
            <div className="flex flex-col gap-2.5 px-3 pb-3">
              <UnscheduledFilters overdueCount={model.overdueCount} />
              <div className="max-h-[40dvh] overflow-y-auto overscroll-contain">
                <UnscheduledBody model={model} dragEnabled={onScreen} containerRef={container} />
              </div>
            </div>
          ) : null}
        </div>
      </UtilityCard>
    </div>
  );
}
