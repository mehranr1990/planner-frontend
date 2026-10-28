"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { ErrorState } from "@/components/feedback/state-views";
import { Skeleton } from "@/components/ui/skeleton";
import type { DayPriority } from "@/data/domain";
import { usePriorities } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { taskDetailHref } from "@/features/personal/routes";
import { cn } from "@/lib/cn";
import { useMyDay } from "../my-day-context";
import { EnergyBars } from "../ui/energy-bars";
import { useMyDayFormat } from "../ui/use-my-day-format";

/*
 * Priorities (P02): the day's top three, ranked. A product card, never
 * notched. Task priorities open the task; a block priority (Gym) is a plain
 * row, because a block has no detail page.
 */

const ROW = "flex min-h-13 items-center gap-3 rounded-field";

function PriorityRow({ priority }: { priority: DayPriority }) {
  const t = useTranslations("MyDay.priorities");
  const format = useMyDayFormat();

  const meta =
    priority.time !== null
      ? t("scheduled", { time: format.clock(priority.time) })
      : priority.durationMinutes !== null
        ? t("unscheduled", { duration: format.duration(priority.durationMinutes) })
        : t("unscheduledNoDuration");

  const content: ReactNode = (
    <>
      <span
        role="img"
        aria-label={t("rank", { rank: format.number(priority.rank) })}
        className={cn(
          "inline-flex size-7.5 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold tabular",
          priority.rank === 1 ? "bg-primary text-on-accent" : "bg-canvas text-fg",
        )}
      >
        <span aria-hidden>{format.number(priority.rank)}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">
          <bdi dir="auto" className="inline-block max-w-full truncate align-bottom">{priority.title}</bdi>
        </span>
        <span className="text-[0.6875rem] font-semibold text-fg-muted">{meta}</span>
      </span>
      <EnergyBars level={priority.energy} />
    </>
  );

  return (
    <li>
      {priority.kind === "task" ? (
        <Link href={taskDetailHref(priority.id)} className={cn(ROW, "-mx-2 px-2 hover:bg-subtle")}>
          {content}
        </Link>
      ) : (
        <div className={ROW}>{content}</div>
      )}
    </li>
  );
}

export function PrioritiesCard({ className }: { className?: string }) {
  const t = useTranslations("MyDay.priorities");
  const format = useMyDayFormat();
  const { day } = useMyDay();
  const query = usePriorities(day);
  const headingId = useId();
  const priorities = query.data ?? [];

  return (
    <ProductCard as="section" aria-labelledby={headingId} className={cn("gap-2", className)}>
      <div className="flex items-center justify-between gap-2.5">
        <h2 id={headingId} className="text-[1.1875rem] font-semibold [&:lang(fa)]:font-bold">
          {t("title")}
        </h2>
        {priorities.length > 0 ? (
          <span className="text-sm font-semibold text-fg-muted">{t("count", { formatted: format.number(priorities.length) })}</span>
        ) : null}
      </div>

      {query.isPending ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">{t("loading")}</span>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} shape="row" className="h-13 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState title={t("error")} description={null} onRetry={() => void query.refetch()} />
      ) : priorities.length === 0 ? (
        <div role="status" className="rounded-field bg-subtle p-4">
          <p className="text-sm font-bold">{t("emptyTitle")}</p>
          <p className="text-[0.8125rem] text-fg-secondary">{t("emptyDescription")}</p>
        </div>
      ) : (
        <ol aria-labelledby={headingId} className="flex flex-col">
          {priorities.map((priority) => (
            <PriorityRow key={`${priority.kind}:${priority.id}`} priority={priority} />
          ))}
        </ol>
      )}
    </ProductCard>
  );
}
