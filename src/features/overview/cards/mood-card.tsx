"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EnergyBars } from "@/components/ui/energy-bars";
import { Icon } from "@/components/ui/icon";
import { useMoods } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useMyDayFormat } from "@/features/my-day/ui/use-my-day-format";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { addDaysToDay, instantToClockTime } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { CardError, CardHead, CardLoading } from "../ui/card-parts";
import { moodKey } from "../ui/mood";

/*
 * Mood (P01 → Journal): today's mood and energy, and the last seven days as
 * plain bars (height = mood level; no Mood Terrain here). No reflection CTA
 * besides "Add a note". Not checked in yet: one "Check in" opening the mood
 * sheet. Bars run in time order, so they mirror in RTL with the flex row.
 */

const DAYS = 7;

export function MoodCard({ today, className }: { today: string; className?: string }) {
  const t = useTranslations("Overview.mood");
  const tm = useTranslations("Overview");
  const format = useMyDayFormat();
  const openSheet = useOpenSheet();
  const from = addDaysToDay(today, -(DAYS - 1));
  const query = useMoods(from, today);
  // Settings › Privacy: a locked Journal shows nothing of its content here.
  const locked = usePlannerSettings().privacy.journalLock;

  const entries = query.data ?? [];
  const todayEntry = entries.find((entry) => entry.day === today);
  const days = Array.from({ length: DAYS }, (_, index) => addDaysToDay(from, index));

  return (
    <ProductCard as="section" tone="scope-soft" aria-labelledby="overview-mood-title" className={cn("flex flex-col gap-3", className)}>
      <CardHead id="overview-mood-title" title={t("title")} href="/personal/journal" linkLabel={t("open")} />
      {locked ? (
        <p role="status" data-journal-locked className="flex items-center gap-2 rounded-field bg-surface p-4 text-sm font-semibold text-fg-secondary">
          <Icon icon={Lock} size={14} />
          {t("locked")}
        </p>
      ) : query.isPending ? (
        <CardLoading rows={2} />
      ) : query.isError ? (
        <CardError onRetry={() => void query.refetch()} />
      ) : (
        <>
          {todayEntry ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[1.75rem] font-semibold leading-tight">{tm("moodLevel", { level: moodKey(todayEntry.mood) })}</p>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 text-[0.6875rem] font-semibold">
                <EnergyBars level={todayEntry.energy} decorative />
                {tm("energy", { level: todayEntry.energy })}
              </span>
            </div>
          ) : (
            <p className="text-sm text-fg-secondary">{t("notYet")}</p>
          )}
          <ol aria-label={t("week")} className="flex h-9 items-end gap-1.5">
            {days.map((day) => {
              const entry = entries.find((item) => item.day === day);
              const label = entry
                ? `${format.weekday(day)}: ${tm("moodLevel", { level: moodKey(entry.mood) })}`
                : `${format.weekday(day)}: ${t("none")}`;
              return (
                <li key={day} className="flex h-full flex-1 items-end">
                  <span
                    role="img"
                    aria-label={label}
                    className={cn(
                      "block w-full rounded-[0.5rem]",
                      !entry ? "h-1.5 bg-surface" : day === today ? "bg-scope-deep" : "bg-scope-dot/45",
                    )}
                    style={entry ? { height: `${(entry.mood / 5) * 100}%` } : undefined}
                  />
                </li>
              );
            })}
          </ol>
          {todayEntry ? (
            <p className="text-[0.6875rem] font-semibold text-scope-deep">
              {t.rich("checkedIn", {
                time: () => (
                  <span dir="ltr" className="tabular">
                    {format.clock(instantToClockTime(todayEntry.at))}
                  </span>
                ),
              })}
              {" · "}
              <Link href="/personal/journal" className="underline underline-offset-4">
                {t("addNote")}
              </Link>
            </p>
          ) : (
            <Button size="sm" className="self-start" onClick={() => openSheet("mood")}>
              {t("checkIn")}
            </Button>
          )}
        </>
      )}
    </ProductCard>
  );
}
