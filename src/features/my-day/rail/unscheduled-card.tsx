"use client";

import { useTranslations } from "next-intl";
import { useCallback, useId, useRef } from "react";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { cn } from "@/lib/cn";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { UnscheduledBody, UnscheduledFilters } from "./unscheduled-list";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import { useUnscheduledDrop } from "./use-unscheduled-drop";
import { useUnscheduledModel } from "./use-unscheduled";

/*
 * Unscheduled (P02, desktop): the always-open card that tasks are dragged
 * out of, and the zone a task block is dropped on to take it off the
 * timeline. A product card, never notched. Below lg the tray replaces it:
 * only the copy that is on screen takes part in drag and drop, so the two
 * never fight over the same draggable ids.
 */
export function UnscheduledCard({ className }: { className?: string }) {
  const t = useTranslations("MyDay.unscheduled");
  const format = useMyDayFormat();
  const model = useUnscheduledModel();
  const active = useIsDesktop(false);
  const drop = useUnscheduledDrop(active);
  const { setNodeRef } = drop;
  const headingId = useId();

  // The droppable ref and the shortcut's container are the same element.
  const container = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      container.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );

  const summary =
    model.status === "ready"
      ? t("summary", {
          count: model.summary.count,
          formatted: format.number(model.summary.count),
          duration: format.duration(model.summary.totalMinutes),
        })
      : null;

  return (
    <div
      ref={setRef}
      data-slot="unscheduled-zone"
      data-drop-ready={drop.ready || undefined}
      data-drop-over={drop.over || undefined}
      className={cn(
        "rounded-product transition-shadow",
        drop.ready && "outline-[1.5px] outline-offset-2 outline-dashed outline-scope-deep/50",
        drop.over && "outline-2 outline-solid outline-scope-deep",
        className,
      )}
    >
      <ProductCard as="section" aria-labelledby={headingId} className="h-full gap-2">
        <div className="flex items-center justify-between gap-2.5">
          <h2 id={headingId} className="text-[1.1875rem] font-semibold [&:lang(fa)]:font-bold">
            {t("title")}
          </h2>
          {summary ? <span className="text-sm font-semibold text-fg-muted">{summary}</span> : null}
        </div>
        <UnscheduledFilters overdueCount={model.overdueCount} />
        <UnscheduledBody model={model} dragEnabled={active} containerRef={container} />
        {drop.ready ? (
          <p role="status" className="pt-1.5 text-sm font-semibold text-scope-deep">
            {t("dropToUnschedule")}
          </p>
        ) : (
          <p className="pt-1.5 text-sm font-semibold text-fg-muted">
            {t.rich("tip", {
              kbd: (chunks) => (
                <kbd className="rounded-md bg-canvas px-1.5 py-0.5 font-sans text-xs font-bold text-fg">{chunks}</kbd>
              ),
            })}
          </p>
        )}
      </ProductCard>
    </div>
  );
}
