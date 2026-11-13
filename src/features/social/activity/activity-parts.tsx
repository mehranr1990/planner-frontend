"use client";

import { ArrowRight, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import type { ActivitySummary, Rsvp } from "@/data/social-domain";
import { useSocialMutation } from "@/data/social-queries";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { GlyphTile, RsvpTag } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * Shared activity pieces (SO-04 / SO-05 / SO-15 / SO-16): "when" text
 * (today / tomorrow / in N days), the date line, the RSVP buttons
 * (Going · Maybe · Can’t — a full activity puts Going on the waitlist), the
 * next-activity signature card (notch = Open activity) and the list row.
 */

export function useActivityText() {
  const t = useTranslations("Social.common");
  const format = useSocialFormat();
  const when = useCallback(
    (day: string) => {
      const days = format.daysFromToday(day);
      if (days <= 0) return t("today");
      if (days === 1) return t("tomorrow");
      return t("inDays", { count: days, n: format.number(days) });
    },
    [format, t],
  );
  const dates = useCallback(
    (a: Pick<ActivitySummary, "startDay" | "endDay" | "startTime">) => {
      const range = a.startDay === a.endDay ? format.day(a.startDay, "full") : format.range(a.startDay, a.endDay);
      return a.startTime ? `${range} · ${convertDigits(a.startTime, format.digits)}` : range;
    },
    [format],
  );
  const span = useCallback((a: Pick<ActivitySummary, "startDay" | "endDay">) => {
    const n = format.daysFromToday(a.endDay) - format.daysFromToday(a.startDay) + 1;
    return t("daysLong", { count: n, n: format.number(n) });
  }, [format, t]);
  return { when, dates, span };
}

/** Going · Maybe · Can’t (Pending = no answer). */
export function RsvpButtons({ activity, className }: { activity: Pick<ActivitySummary, "id" | "myRsvp" | "status">; className?: string }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const rsvp = useSocialMutation((repo, value: Exclude<Rsvp, "pending">) => repo.activities.rsvp(activity.id, value));
  const options: Exclude<Rsvp, "pending">[] = ["going", "maybe", "declined"];
  return (
    <div role="group" aria-label={t("activity.rsvpTitle")} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((value) => {
        const selected = activity.myRsvp === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            disabled={activity.status !== "planned" || rsvp.isPending}
            onClick={() =>
              rsvp.mutate(value, {
                onSuccess: (result) => toast({ title: result.waitlisted ? t("activity.waitlisted") : t("activity.rsvpSaved"), tone: result.waitlisted ? "info" : "success" }),
                onError: (error) => toast({ title: errorText(error), tone: "danger" }),
              })
            }
            className={cn(
              "inline-flex h-9 items-center rounded-pill px-4 text-sm font-semibold transition-colors disabled:opacity-50",
              selected ? "bg-scope-soft text-scope-deep" : "text-fg-secondary inset-ring inset-ring-outline hover:text-fg",
            )}
          >
            {t(`rsvp.${value}`)}
          </button>
        );
      })}
    </div>
  );
}

/** Next activity (SO-04 / SO-15): signature card, notch = Open activity. */
export function NextActivityCard({ activity, className }: { activity: ActivitySummary; className?: string }) {
  const t = useTranslations("Social");
  const router = useRouter();
  const text = useActivityText();
  const format = useSocialFormat();
  const capacity = activity.capacity;
  const left = capacity === null ? null : Math.max(0, capacity - activity.goingCount);
  const pct = capacity ? Math.min(100, (activity.goingCount / capacity) * 100) : null;
  return (
    <SignatureCard
      as="section"
      aria-labelledby={`next-${activity.id}`}
      className={className}
      contentClassName="flex flex-col gap-3"
      action={<SignatureCardAction label={t("group.openActivity")} icon={ArrowRight} mirror onClick={() => router.push(socialHref.activity(activity.id))} />}
    >
      <p className="pe-16 text-xs font-bold tracking-wide text-scope-deep uppercase">{t("group.nextActivity", { when: text.when(activity.startDay) })}</p>
      <h2 id={`next-${activity.id}`} className="pe-16 type-h2 text-fg">
        <bdi>{activity.title}</bdi>
      </h2>
      <p className="text-sm text-fg-secondary">
        {text.dates(activity)} · {text.span(activity)} · {t("common.organiser", { name: activity.organiser.name })}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="type-display text-fg tabular">{format.number(activity.goingCount)}</span>
        {capacity !== null ? <span className="text-lg font-semibold text-fg-muted tabular">/{format.number(capacity)}</span> : null}
        <span className="text-sm text-fg-secondary">
          {t("group.goingLine")}
          {left !== null ? ` · ${t("group.spotsLeft", { count: left, n: format.number(left) })}` : ""}
          {activity.waitlistCount > 0 ? ` · ${t("group.onWaitlist", { n: format.number(activity.waitlistCount) })}` : ""}
        </span>
      </div>
      {pct !== null ? (
        <div role="img" aria-label={t("activity.capacity", { going: format.number(activity.goingCount), capacity: format.number(capacity!) })} className="h-2 overflow-hidden rounded-pill bg-subtle">
          <span className="block h-full rounded-pill bg-scope-deep" style={{ inlineSize: `${pct}%` }} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RsvpButtons activity={activity} />
        <span className="text-xs font-semibold text-fg-muted">{t("group.yourRsvp", { rsvp: t(`rsvp.${activity.myRsvp}`) })}</span>
      </div>
    </SignatureCard>
  );
}

/** No upcoming activity: "Plan something" card (notch = New activity). */
export function PlanSomethingCard({ groupId, className }: { groupId?: string; className?: string }) {
  const t = useTranslations("Social");
  const openSheet = useOpenSocialSheet();
  return (
    <SignatureCard
      as="section"
      className={className}
      contentClassName="flex min-h-40 flex-col justify-end gap-2"
      action={<SignatureCardAction label={t("common.newActivity")} icon={Plus} aria-haspopup="dialog" onClick={() => openSheet("activity-new", groupId ? { group: groupId } : {})} />}
    >
      <h2 className="pe-16 type-h2 text-fg">{groupId ? t("group.noNext") : t("home.planSomething")}</h2>
      <p className="text-sm text-fg-secondary">{groupId ? t("group.noNextBody") : t("home.planSomethingBody")}</p>
    </SignatureCard>
  );
}

/** One activity in a list (SO-04 Upcoming, SO-15 Coming up, SO-16). */
export function ActivityRow({ activity, showGroup = true, action }: { activity: ActivitySummary; showGroup?: boolean; action?: "respond" | "tag" }) {
  const t = useTranslations("Social");
  const text = useActivityText();
  const format = useSocialFormat();
  const scopeLine = activity.group ? (showGroup ? activity.group.name : null) : `${t("common.independent")} · ${t("common.by", { name: activity.organiser.name })}`;
  return (
    <li>
      <Link href={socialHref.activity(activity.id)} className="flex min-h-16 items-center gap-3 rounded-row bg-subtle px-3 py-2 transition-colors hover:bg-raised">
        <GlyphTile kind={activity.template} />
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi className={cn("truncate text-sm font-bold text-fg", activity.status === "cancelled" && "line-through")}>{activity.title}</bdi>
          <span className="truncate text-xs text-fg-secondary">
            {activity.recurringWeekly ? (
              <>
                <Icon icon={Repeat} size={12} className="me-1 inline align-[-2px]" />
                {t("common.weekly")} · {t("activities.nextOn", { date: format.day(activity.startDay) })}
              </>
            ) : (
              text.dates(activity)
            )}
            {scopeLine ? <> · <bdi>{scopeLine}</bdi></> : null}
            {activity.isGuest ? ` · ${t("common.guest")}` : ""}
          </span>
        </span>
        {activity.status === "cancelled" ? (
          <span className="shrink-0 rounded-pill bg-danger-soft px-3 py-1 text-xs font-bold text-danger-text">{t("activities.cancelledTag")}</span>
        ) : activity.myRsvp === "pending" && action === "respond" ? (
          <span className="shrink-0 rounded-pill px-3 py-1 text-xs font-bold text-fg inset-ring inset-ring-outline">{t("group.respond")}</span>
        ) : activity.myWaitlist !== null ? (
          <span className="shrink-0 rounded-pill bg-warning-soft px-3 py-1 text-xs font-bold text-warning-text">{t("activity.waitlistTitle")}</span>
        ) : (
          <RsvpTag rsvp={activity.myRsvp} />
        )}
      </Link>
    </li>
  );
}
