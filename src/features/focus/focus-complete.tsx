"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Task } from "@/data/domain";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type { FocusSession } from "./domain/timer";
import { useFocusFormat } from "./use-focus-format";

/* Session complete (P09): the timer collapses into this summary card. */
export function FocusComplete({
  session,
  task,
  onMarkDone,
  marking,
  onAnotherRound,
  onBack,
}: {
  session: FocusSession;
  task: Task | undefined;
  onMarkDone: () => void;
  marking: boolean;
  onAnotherRound: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("Focus.complete");
  const format = useFocusFormat();
  const n = format.digits;
  const done = task?.status === "done";

  return (
    <ProductCard
      as="section"
      aria-labelledby="focus-complete-title"
      className="mx-auto flex w-full max-w-xl flex-col gap-4 motion-safe:animate-[mp-pop-in_320ms_ease-out]"
    >
      <h2 id="focus-complete-title" className="type-title" tabIndex={-1}>
        {t("title")}
      </h2>
      <ul className="flex flex-wrap gap-2 text-xs font-bold">
        <li className="rounded-pill bg-success-soft px-3 py-1.5 text-success-text">
          {t("cycles", {
            cycles: session.completedCycles,
            n: n(session.completedCycles),
            total: format.duration(session.focusedMs),
          })}
        </li>
        <li className="rounded-pill bg-subtle px-3 py-1.5">
          {t("parked", { count: session.parkedCount, n: n(session.parkedCount) })}
        </li>
      </ul>
      {task ? (
        <p className="text-sm text-fg-secondary">
          {done
            ? t("taskDone", { task: task.title })
            : task.subtasks
              ? t("taskOpenSubtasks", { task: task.title, done: n(task.subtasks.done), total: n(task.subtasks.total) })
              : t("taskOpen", { task: task.title })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {task && !done ? (
          <Button onClick={onMarkDone} aria-busy={marking}>
            {t("markDone")}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onAnotherRound}>
          {t("another")}
        </Button>
        <Link href="/personal/my-day" onClick={onBack} className={buttonVariants({ variant: "outline" })}>
          {t("back")}
        </Link>
      </div>
    </ProductCard>
  );
}
