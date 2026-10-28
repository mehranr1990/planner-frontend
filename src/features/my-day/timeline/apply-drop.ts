import type { TimeBlock } from "@/data/domain";
import type { ToastOptions } from "@/components/ui/toast";
import type { MoveBlockInput, ScheduleTaskInput } from "@/data/queries";
import type { MyDayFormat } from "../ui/use-my-day-format";
import type { DropPlan, OverlapHit, RejectReason } from "./drop-plan";

/*
 * Carries a DropPlan out: calls the repository mutations, tells the person
 * (a toast with Undo built from the previous placement, plus a screen-reader
 * announcement) and never touches a component. Dependencies are injected so
 * it runs against the mock repositories in tests and the hooks in the app.
 */

/** The MyDay.drag messages this module speaks. */
export type DropMessageKey =
  | "scheduled"
  | "movedTo"
  | "resizedTo"
  | "unscheduled"
  | "rejectedNoTarget"
  | "rejectedOutOfRange"
  | "rejectedTooShort"
  | "rejectedNotUnschedulable"
  | "failed"
  | "toastScheduled"
  | "toastMoved"
  | "toastResized"
  | "toastUnscheduled"
  | "toastOverlap"
  | "toastOverlapMore"
  | "toastUndo"
  | "toastUndoAlt"
  | "toastUndone"
  | "toastFailed"
  | "toastFailedDetail";

export type DropTranslate = (key: DropMessageKey, values?: Record<string, string | number>) => string;

export interface DropDeps {
  schedule(input: ScheduleTaskInput): Promise<TimeBlock>;
  move(input: MoveBlockInput): Promise<TimeBlock>;
  unschedule(input: { blockId: string }): Promise<void>;
  notify(options: ToastOptions): string;
  dismissToast(id: string): void;
  /** Polite screen-reader announcement. */
  announce(message: string): void;
  t: DropTranslate;
  format: MyDayFormat;
  /** "Tuesday 21 Mehr", for announcements. */
  dayLabel(day: string): string;
}

export type DropOutcome = "applied" | "rejected" | "noop" | "failed";

const REJECT_KEYS: Record<RejectReason, DropMessageKey> = {
  "no-target": "rejectedNoTarget",
  "out-of-range": "rejectedOutOfRange",
  "too-short": "rejectedTooShort",
  "not-unschedulable": "rejectedNotUnschedulable",
};

/** "Overlaps Design review by 30m" for the largest overlap, "… and 1 more" for several. */
function overlapTitle(overlaps: readonly OverlapHit[], { t, format }: Pick<DropDeps, "t" | "format">): string {
  const [first, ...rest] = [...overlaps].sort((a, b) => b.minutes - a.minutes);
  if (!first) return "";
  return rest.length === 0
    ? t("toastOverlap", { other: first.title, duration: format.duration(first.minutes) })
    : t("toastOverlapMore", { other: first.title, count: rest.length });
}

export async function applyPlan(plan: DropPlan, deps: DropDeps): Promise<DropOutcome> {
  const { t, format } = deps;
  if (plan.kind === "noop") return "noop";
  if (plan.kind === "reject") {
    deps.announce(t(REJECT_KEYS[plan.reason], { title: plan.title }));
    return "rejected";
  }

  const fail = (title: string): DropOutcome => {
    deps.notify({ tone: "danger", title: t("toastFailed", { title }), description: t("toastFailedDetail") });
    deps.announce(t("failed", { title }));
    return "failed";
  };

  const succeed = (input: {
    title: string;
    toast: string;
    announcement: string;
    overlaps: readonly OverlapHit[];
    undo: () => Promise<unknown>;
    undoLabel: string;
  }): DropOutcome => {
    const flagged = input.overlaps.length > 0;
    const toastRef: { id?: string } = {};
    toastRef.id = deps.notify({
      tone: flagged ? "warning" : "success",
      title: flagged ? overlapTitle(input.overlaps, deps) : input.toast,
      description: flagged ? input.toast : undefined,
      action: {
        label: t("toastUndo"),
        altText: input.undoLabel,
        onClick: () => {
          if (toastRef.id) deps.dismissToast(toastRef.id);
          input
            .undo()
            .then(() => {
              deps.announce(t("toastUndone"));
              deps.notify({ tone: "neutral", title: t("toastUndone"), duration: 2500 });
            })
            .catch(() => {
              fail(input.title);
            });
        },
      },
    });
    deps.announce(
      flagged ? `${input.announcement} ${overlapTitle(input.overlaps, deps)}` : input.announcement,
    );
    return "applied";
  };

  try {
    if (plan.kind === "schedule") {
      const { placement } = plan;
      const block = await deps.schedule({
        taskId: plan.taskId,
        day: placement.day,
        start: placement.start,
        durationMinutes: placement.durationMinutes,
      });
      const time = format.clock(placement.startMinutes);
      return succeed({
        title: plan.title,
        toast: t("toastScheduled", { title: plan.title, time }),
        announcement: t("scheduled", { title: plan.title, time, day: deps.dayLabel(placement.day) }),
        overlaps: plan.overlaps,
        undo: () => deps.unschedule({ blockId: block.id }),
        undoLabel: t("toastUndoAlt", { title: plan.title }),
      });
    }

    if (plan.kind === "move") {
      const { placement, previous } = plan;
      await deps.move({
        blockId: plan.blockId,
        day: placement.day,
        start: placement.start,
        // A move keeps the block's length; a resize sets it.
        ...(plan.resized ? { durationMinutes: placement.durationMinutes } : {}),
      });
      const time = format.clock(placement.startMinutes);
      return succeed({
        title: plan.title,
        toast: plan.resized
          ? t("toastResized", { title: plan.title, duration: format.duration(placement.durationMinutes) })
          : t("toastMoved", { title: plan.title, time }),
        announcement: plan.resized
          ? t("resizedTo", {
              title: plan.title,
              range: format.clockRange(placement.startMinutes, placement.endMinutes),
              duration: format.duration(placement.durationMinutes),
            })
          : t("movedTo", { title: plan.title, time, day: deps.dayLabel(placement.day) }),
        overlaps: plan.overlaps,
        undo: () =>
          deps.move({
            blockId: plan.blockId,
            day: previous.day,
            start: previous.start,
            durationMinutes: previous.durationMinutes,
          }),
        undoLabel: t("toastUndoAlt", { title: plan.title }),
      });
    }

    // unschedule
    const { previous } = plan;
    await deps.unschedule({ blockId: plan.blockId });
    return succeed({
      title: plan.title,
      toast: t("toastUnscheduled", { title: plan.title }),
      announcement: t("unscheduled", { title: plan.title }),
      overlaps: [],
      undo: () =>
        deps.schedule({
          taskId: plan.taskId,
          day: previous.day,
          start: previous.start,
          durationMinutes: previous.durationMinutes,
        }),
      undoLabel: t("toastUndoAlt", { title: plan.title }),
    });
  } catch {
    return fail(plan.title);
  }
}
