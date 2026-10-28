"use client";

import { Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { useSetPriorities, useTasks, useUnscheduledTasks } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { cn } from "@/lib/cn";
import { workWindow } from "../domain/capacity";
import { suggestTopThree } from "../domain/priorities";
import { useDayPlan } from "../header/use-day-plan";
import { useMyDay } from "../my-day-context";
import { useMyDayFormat } from "../ui/use-my-day-format";

/*
 * The empty-day box inside the timeline card (P02 "Empty day"): the numbers
 * are the day's own (free time from capacity, tasks waiting in Unscheduled),
 * "Pick top 3" ranks the best candidates through the same repository call as
 * the Priorities card, "Add block" opens Quick add. The screen shows it when
 * the day has no blocks.
 */

/** How many priorities a day holds. */
const TOP_COUNT = 3;

export function EmptyDayState({ className }: { className?: string }) {
  const t = useTranslations("MyDay.states.empty");
  const format = useMyDayFormat();
  const { day, isToday, energy } = useMyDay();
  const { workHours, week } = usePlannerSettings();
  const openSheet = useOpenSheet();

  const plan = useDayPlan(day);
  const waiting = useUnscheduledTasks(day, "today", week);
  const tasks = useTasks({ view: "all" });
  const setPriorities = useSetPriorities();

  const freeMinutes =
    plan.status === "ready" ? plan.capacity.freeMinutes : workWindow(workHours).totalMinutes;
  const n = format.number(TOP_COUNT);

  const pickTop = async () => {
    const refs = suggestTopThree(tasks.data ?? [], plan.status === "ready" ? plan.blocks : [], {
      day,
      selectedEnergy: energy,
    });
    if (refs.length === 0) {
      toast({ tone: "info", title: t("nothingToPick") });
      return;
    }
    try {
      await setPriorities.mutateAsync({ day, refs });
      toast({ tone: "success", title: t("picked", { n }) });
    } catch {
      toast({ tone: "danger", title: t("pickFailed", { n }) });
    }
  };

  const count = waiting.data?.length;

  return (
    <UtilityCard
      as="section"
      aria-labelledby="my-day-empty-title"
      className={cn("items-center gap-3 px-6 py-8 text-center", className)}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-full bg-surface text-fg-secondary"
      >
        <Icon icon={Sun} size={26} />
      </span>
      <h3 id="my-day-empty-title" className="text-[1.0625rem] font-semibold leading-snug text-fg">
        {t("title")}
      </h3>
      {count === undefined ? (
        <span aria-hidden="true" className="flex w-full max-w-75 flex-col items-center gap-2">
          <Skeleton shape="text" className="w-full" />
          <Skeleton shape="text" className="w-2/3" />
        </span>
      ) : (
        <p className="max-w-75 text-[0.8125rem] leading-normal text-fg-secondary">
          {t(isToday ? "description" : "descriptionOtherDay", {
            free: format.duration(freeMinutes),
            count,
            countText: format.number(count),
            n,
          })}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button loading={setPriorities.isPending} onClick={pickTop}>
          {t("pickTop", { n })}
        </Button>
        <Button variant="secondary" onClick={() => openSheet("quick-add")}>
          {t("addBlock")}
        </Button>
      </div>
    </UtilityCard>
  );
}
