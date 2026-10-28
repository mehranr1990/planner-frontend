"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { blockKeys, useUnscheduledTasks } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useDayPlan } from "@/features/my-day/header/use-day-plan";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { cn } from "@/lib/cn";
import { CardError, CardHead, CardLoading } from "../ui/card-parts";

/*
 * Up next (P01 → My Day): the running block and the next three, as a short
 * agenda, and how many unscheduled tasks would fit in today's free time.
 */

const MAX_ROWS = 4;

/** How many of the tasks fit in `free` minutes, shortest first. */
export function countFitting(durations: readonly (number | null)[], free: number): number {
  let used = 0;
  let count = 0;
  for (const minutes of durations.filter((value): value is number => value !== null).sort((a, b) => a - b)) {
    if (used + minutes > free) break;
    used += minutes;
    count += 1;
  }
  return count;
}

export function UpNextCard({ today, nowMinutes, className }: { today: string; nowMinutes: number; className?: string }) {
  const t = useTranslations("Overview.upNext");
  const tc = useTranslations("Navigation.contexts");
  const format = useMyDayFormat();
  const plan = useDayPlan(today);
  const unscheduled = useUnscheduledTasks(today, "today");
  const client = useQueryClient();

  const rows =
    plan.status === "ready"
      ? plan.blocks
          .filter((block) => !block.done && block.kind !== "break" && block.endMinutes > nowMinutes)
          .sort((a, b) => a.startMinutes - b.startMinutes)
          .slice(0, MAX_ROWS)
      : [];
  const fitting =
    plan.status === "ready" && unscheduled.data
      ? countFitting(
          unscheduled.data.map((task) => task.durationMinutes),
          plan.capacity.freeMinutes,
        )
      : 0;

  return (
    <ProductCard as="section" aria-labelledby="overview-upnext-title" className={cn("flex flex-col gap-3", className)}>
      <CardHead id="overview-upnext-title" title={t("title")} href="/personal/my-day" linkLabel={t("open")} />
      {plan.status === "loading" ? (
        <CardLoading rows={4} />
      ) : plan.status === "error" ? (
        <CardError onRetry={() => void client.invalidateQueries({ queryKey: blockKeys.all })} />
      ) : rows.length === 0 ? (
        <p role="status" className="rounded-field bg-subtle p-4 text-sm text-fg-secondary">
          {t("empty")}
        </p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((block) => {
            const live = block.startMinutes <= nowMinutes;
            return (
              <li key={block.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 py-2">
                <span className={cn("text-xs font-semibold", live ? "text-scope-deep" : "text-fg-secondary")}>
                  {live ? (
                    t("now")
                  ) : (
                    <span dir="ltr" className="tabular">
                      {format.clock(block.startMinutes)}
                    </span>
                  )}
                </span>
                <span className={cn("flex min-w-0 flex-col border-s-2 ps-3", live ? "border-scope-deep" : "border-line")}>
                  <span className="truncate text-sm font-semibold">
                    <bdi dir="auto">{block.title}</bdi>
                  </span>
                  <span className="text-[0.6875rem] text-fg-muted">
                    {live ? (
                      t.rich("until", {
                        time: () => (
                          <span dir="ltr" className="tabular">
                            {format.clock(block.endMinutes)}
                          </span>
                        ),
                      })
                    ) : (
                      <Fragment>
                        {format.duration(block.durationMinutes)} · {tc(`${block.scope}.label`)}
                      </Fragment>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {plan.status === "ready" && fitting > 0 ? (
        <p className="mt-auto border-t border-line pt-3 text-xs text-fg-secondary">
          {t("fits", { count: fitting, countText: format.number(fitting), free: format.duration(plan.capacity.freeMinutes) })}
        </p>
      ) : null}
    </ProductCard>
  );
}
