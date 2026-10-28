"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactNode, type RefObject } from "react";
import { IconButton } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyDay, usePlannerNow, type RescheduleRequest } from "../my-day-context";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { ReschedulePanel } from "@/features/reschedule/reschedule-panel";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import {
  useRescheduleActions,
  type RescheduleChoice,
  type RescheduleSessionData,
} from "@/features/reschedule/use-reschedule-actions";
import { useRescheduleSession } from "@/features/reschedule/use-reschedule-session";
import type { RescheduleOptionId } from "../domain/reschedule";

/*
 * Reschedule for the whole My Day screen (render it once). It reads the open
 * request from the My Day context: from lg up a non-modal popover anchored to
 * the control that opened it (or to the pointer for a right-click), below lg a
 * bottom sheet. Choosing a row applies it, closes the surface and shows a toast
 * with Undo; Esc closes and focus returns to where it came from.
 * RescheduleSurface is that popover / sheet without the My Day context, for
 * other screens that keep their own request (Tasks).
 */

export function RescheduleHost() {
  const { reschedule, day, closeReschedule } = useMyDay();
  const { apply } = useRescheduleActions();
  if (!reschedule) return null;
  // Keyed by target: a second request (another block's ⋯) starts a fresh session.
  return (
    <RescheduleSurface
      key={JSON.stringify(reschedule.target)}
      request={reschedule}
      day={day}
      apply={apply}
      onClose={closeReschedule}
    />
  );
}

export interface RescheduleSurfaceProps {
  request: RescheduleRequest;
  /** The day the caller shows: suggestions are computed around it and today. */
  day: string;
  /** From useRescheduleActions in an always-mounted parent, so Undo outlives the surface. */
  apply: (data: RescheduleSessionData, choice: RescheduleChoice) => Promise<boolean>;
  onClose(): void;
  /** After a choice was applied (before onClose). */
  onApplied?(): void;
  /** The rows this consumer offers; default My Day / Calendar's (P02 · P04) set. */
  options?: readonly RescheduleOptionId[];
}

/** A zero-size box at a point, for anchoring the popover to a right-click. */
function pointAnchor(x: number, y: number): RefObject<{ getBoundingClientRect(): DOMRect }> {
  const rect = { x, y, width: 0, height: 0, top: y, left: x, right: x, bottom: y, toJSON: () => ({}) };
  return { current: { getBoundingClientRect: () => rect as DOMRect } };
}

/** Render it keyed by the request's target, so a new target starts a fresh session. */
export function RescheduleSurface({
  request,
  day,
  apply,
  onClose: closeReschedule,
  onApplied,
  options,
}: RescheduleSurfaceProps) {
  const t = useTranslations("MyDay.reschedule");
  const tCommon = useTranslations("Common");
  const format = useMyDayFormat();
  const now = usePlannerNow();
  const desktop = useIsDesktop();
  const session = useRescheduleSession(request, day, options);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  // The control that opened it, or whatever had focus (the keyboard shortcut on a block).
  // A request that exists at first render (the demo harness) is also rendered on the server, where there is no document.
  const [returnTo] = useState<Element | null>(() =>
    request.anchor ?? (typeof document === "undefined" ? null : document.activeElement),
  );

  const anchor = useMemo(() => {
    if (typeof window === "undefined") return pointAnchor(0, 0);
    if (request.anchor) return { current: request.anchor };
    if (request.point) return pointAnchor(request.point.x, request.point.y);
    if (returnTo instanceof HTMLElement && returnTo !== document.body) return { current: returnTo };
    return pointAnchor(window.innerWidth / 2, window.innerHeight / 3);
  }, [request.anchor, request.point, returnTo]);

  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (returnTo instanceof HTMLElement && returnTo.isConnected && returnTo !== document.body) returnTo.focus();
    else document.getElementById("main-content")?.focus();
  };

  const choose = async (choice: RescheduleChoice) => {
    if (session.status !== "ready") return;
    setBusy(true);
    const ok = await apply({ resolved: session.resolved, blocksByDay: session.blocksByDay }, choice);
    if (ok) {
      onApplied?.();
      closeReschedule();
    } else setBusy(false);
  };

  const taskTarget = request.target.kind === "task" || request.target.kind === "tasks";
  let title: ReactNode = taskTarget ? t("titleTask") : t("titleFallback");
  if (session.status === "ready") {
    const count = session.resolved.items.length;
    title =
      count > 1
        ? t(session.resolved.noun === "task" ? "titleManyTasks" : "titleMany", { count, countText: format.number(count) })
        : t.rich("title", {
            title: session.resolved.title,
            bdi: (chunks) => <bdi dir="auto">{chunks}</bdi>,
          });
  }

  let body: ReactNode;
  if (session.status === "ready") {
    body = (
      <ReschedulePanel
        rows={session.rows}
        pickDefault={session.pickDefault}
        today={now.day}
        busy={busy}
        onChoose={choose}
      />
    );
  } else if (session.status === "loading") {
    body = (
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-1.5">
        <Skeleton shape="row" />
        <Skeleton shape="row" />
        <Skeleton shape="row" />
      </div>
    );
  } else {
    body = (
      <p role="alert" className="text-sm text-fg-secondary">
        {t("unavailable")}
      </p>
    );
  }

  const onOpenChange = (open: boolean) => {
    if (!open) closeReschedule();
  };

  if (!desktop) {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="bottom" title={title} onCloseAutoFocus={restoreFocus}>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        align="end"
        aria-labelledby={titleId}
        onCloseAutoFocus={restoreFocus}
        className="w-88 p-4"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id={titleId} className="min-w-0 pt-1.5 text-[0.9375rem] font-bold leading-snug text-fg">
            {title}
          </h2>
          <IconButton
            icon={X}
            size="sm"
            variant="secondary"
            label={tCommon("close")}
            onClick={closeReschedule}
            className="size-9 shrink-0"
          />
        </div>
        {body}
      </PopoverContent>
    </Popover>
  );
}
