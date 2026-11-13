"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { getPlannerToday } from "@/data/clock";
import type { ActivityFilter, ActivitySummary } from "@/data/social-domain";
import { useActivities, useGroupAccess } from "@/data/social-queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { monthGridOf } from "@/features/calendar/domain/navigation";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { addDaysToDay, localDateToDay } from "@/lib/dates/clock-time";
import { cn } from "@/lib/cn";
import { ActivityRow } from "../activity/activity-parts";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { isUnsupported, SocialPageHeader, SocialUnsupported } from "../social-ui";
import { useCurrentSocialGroup } from "../use-social";

/*
 * SO-16 · Activities. /social/activities lists every activity I take part
 * in (groups + independent, guest ones with the organiser's name); inside a
 * group the same list filtered to it, with New activity prefilled. View
 * mode List / Calendar (segmented); the calendar is the social layer only
 * (coral) on the Personal calendar's month grid (monthGridOf). Weekly sports
 * show the next occurrence; past activities stay read-only.
 */

const FILTERS: ActivityFilter[] = ["all", "needs-answer", "organised", "past"];
type View = "list" | "calendar";

export function ActivitiesScreen({ inGroup = false, initialView = "list" }: { inGroup?: boolean; initialView?: View }) {
  const t = useTranslations("Social");
  const { groupId } = useCurrentSocialGroup();
  const group = useGroupAccess(inGroup ? groupId : undefined);
  const groupInfo = inGroup && group.data?.kind === "member" ? { id: group.data.group.id, name: group.data.group.name } : null;
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [view, setView] = useState<View>(initialView);
  const activities = useActivities(view === "calendar" ? "all" : filter, inGroup ? groupId : undefined);
  const openSheet = useOpenSocialSheet();
  const title = groupInfo ? t("activities.groupTitle", { group: groupInfo.name }) : t("activities.title");

  return (
    <>
      <SocialPageHeader
        group={groupInfo}
        trail={[{ label: t("activities.title") }]}
        title={groupInfo ? t("activities.title") : title}
        actions={
          <>
            <Segmented<View>
              label={t("activities.view.label")}
              value={view}
              onValueChange={setView}
              options={[
                { value: "list", label: t("activities.view.list") },
                { value: "calendar", label: t("activities.view.calendar") },
              ]}
            />
            <Button className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("activity-new", groupInfo ? { group: groupInfo.id } : {})}>
              <Icon icon={Plus} size={16} />
              {t("common.newActivity")}
            </Button>
          </>
        }
      />
      {view === "list" ? <PillGroup<ActivityFilter> label={t("activities.filterLabel")} value={filter} onValueChange={setFilter} options={FILTERS.map((f) => ({ value: f, label: t(`activities.filters.${f}`) }))} /> : null}
      {activities.isError ? (
        isUnsupported(activities.error) ? <SocialUnsupported /> : <ErrorState onRetry={() => void activities.refetch()} />
      ) : !activities.data ? (
        <AccessLoading />
      ) : view === "calendar" ? (
        <SocialMonth activities={activities.data.filter((a) => a.status === "planned")} />
      ) : activities.data.length === 0 ? (
        <EmptyState title={t("activities.empty")} description={t("activities.emptyBody")} primaryAction={<Button onClick={() => openSheet("activity-new", groupInfo ? { group: groupInfo.id } : {})}>{t("common.newActivity")}</Button>} />
      ) : (
        <ProductCard as="section" aria-label={title}>
          {filter === "past" ? <p className="pb-2 text-xs text-fg-muted">{t("activity.past")}</p> : null}
          <ul className="flex flex-col gap-2">
            {activities.data.map((a) => (
              <ActivityRow key={a.id} activity={a} showGroup={!inGroup} action="respond" />
            ))}
          </ul>
        </ProductCard>
      )}
    </>
  );
}

/*
 * The social layer on the Personal calendar's month grid (`monthGridOf`:
 * Jalali / Gregorian per preference, the planner's week start and weekend),
 * read-only: no Personal blocks, no quick-add, no task layers.
 */
function SocialMonth({ activities }: { activities: ActivitySummary[] }) {
  const t = useTranslations("Social.activities");
  const tCal = useTranslations("Calendar.toolbar");
  const format = useSocialFormat();
  const { calendar } = usePreferences();
  const { week } = usePlannerSettings();
  const today = getPlannerToday();
  const [anchor, setAnchor] = useState(today);
  const grid = useMemo(() => monthGridOf(anchor, calendar, week), [anchor, calendar, week]);
  const inMonth = grid.flat().filter((cell) => cell.inMonth).map((cell) => localDateToDay(cell.date));
  const on = (day: string) => activities.filter((a) => a.startDay <= day && a.endDay >= day);
  return (
    <ProductCard as="section" aria-labelledby="social-month" data-scope="social" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="social-month" className="type-title text-fg">
          {format.day(anchor, "monthYear")}
        </h2>
        <div className="flex gap-1.5">
          <IconButton size="sm" icon={ChevronLeft} mirror label={tCal("previous")} onClick={() => setAnchor(addDaysToDay(inMonth[0]!, -1))} />
          <Button size="sm" variant="secondary" onClick={() => setAnchor(today)}>
            {tCal("today")}
          </Button>
          <IconButton size="sm" icon={ChevronRight} mirror label={tCal("next")} onClick={() => setAnchor(addDaysToDay(inMonth.at(-1)!, 1))} />
        </div>
      </div>
      <p className="text-xs text-fg-muted">{t("calendarNote")}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold" aria-hidden="true">
        {grid[0]!.map((cell) => (
          <span key={cell.weekday} className={cell.isWeekend ? "text-weekend-text" : "text-fg-muted"}>
            {format.day(localDateToDay(cell.date), "weekdayShort")}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {grid.flat().map((cell) => {
          const day = localDateToDay(cell.date);
          const list = on(day);
          return (
            <li
              key={day}
              aria-label={`${format.day(day, "full")}: ${list.map((a) => a.title).join(", ") || t("dayEmpty")}`}
              className={cn("flex min-h-20 flex-col gap-1 rounded-row p-1.5", day === today ? "bg-scope-soft" : cell.isWeekend ? "bg-danger-soft/40" : "bg-subtle", !cell.inMonth && "opacity-50")}
            >
              <span className={cn("text-xs font-bold tabular", cell.isWeekend ? "text-weekend-text" : "text-fg-secondary")}>{format.number(cell.dayOfMonth)}</span>
              {list.slice(0, 2).map((a) => (
                <Link key={a.id} href={socialHref.activity(a.id)} className="truncate rounded-md bg-scope-deep px-1.5 py-0.5 text-start text-[0.6875rem] font-semibold text-on-accent hover:opacity-90">
                  <bdi>{a.title}</bdi>
                </Link>
              ))}
              {list.length > 2 ? <span className="text-[0.6875rem] font-semibold text-scope-deep">+{format.number(list.length - 2)}</span> : null}
            </li>
          );
        })}
      </ol>
    </ProductCard>
  );
}
