"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import { useTeamActivity, useTeamCheckinSummary, useTeamRecognition } from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";

/*
 * TM-01 bottom FolderTabs: Activity (replaces the old activity route) ·
 * Check-ins (replies count only: no mood, no scores; the tab count = your
 * reply missing) · Recognition (team-visible thanks only; no counts, no
 * ranking).
 */
export function UpdatesTabs({ teamId, canReply }: { teamId: string; canReply: boolean }) {
  const t = useTranslations("Team");
  const tWork = useTranslations("TeamWork");
  const format = useProjectFormat();
  const activity = useTeamActivity(teamId, 5);
  const checkins = useTeamCheckinSummary(teamId);
  const thanks = useTeamRecognition(teamId, 3);
  const bold = (chunks: React.ReactNode) => <strong className="font-bold text-fg">{chunks}</strong>;

  const tabs: FolderTab[] = [
    {
      value: "activity",
      label: t("tabs.activity"),
      content: !activity.data ? (
        <Skeleton className="h-28 rounded-row" />
      ) : activity.data.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("activity.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {activity.data.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <Avatar name={item.actor.name} initials={item.actor.initials} size={32} tone="team" decorative />
              <div className="flex min-w-0 flex-col leading-snug">
                <p className="text-sm text-fg">
                  {t.rich(`activity.${item.kind}`, {
                    name: item.actor.name,
                    subject: item.subject,
                    status: item.status ? tWork(`status.${item.status}`) : "",
                    b: bold,
                  })}
                </p>
                <span className="text-xs text-fg-muted">{format.relative(item.at)}</span>
              </div>
            </li>
          ))}
        </ul>
      ),
    },
    {
      value: "checkins",
      label: t("tabs.checkins"),
      count: checkins.data?.mine === "missing" ? 1 : undefined,
      content: !checkins.data ? (
        <Skeleton className="h-16 rounded-row" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col leading-snug">
            <p className="text-sm font-bold text-fg">{t("checkins.title")}</p>
            <p className="text-xs text-fg-secondary">
              {t("checkins.replied", {
                replied: format.number(checkins.data.replied),
                total: format.number(checkins.data.total),
                day: format.day(checkins.data.closesAt.slice(0, 10), "weekdayShort"),
              })}
            </p>
            {checkins.data.mine === "sent" ? <p className="text-xs text-fg-secondary">{t("checkins.sent")}</p> : null}
          </div>
          <Link
            href={teamHref(teamId, "checkins")}
            className={cn(buttonVariants({ size: "sm", variant: checkins.data.mine === "missing" && canReply ? "primary" : "secondary" }))}
          >
            {checkins.data.mine === "missing" && canReply ? t("checkins.reply") : t("checkins.open")}
          </Link>
        </div>
      ),
    },
    {
      value: "recognition",
      label: t("tabs.recognition"),
      content: !thanks.data ? (
        <Skeleton className="h-24 rounded-row" />
      ) : thanks.data.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("recognition.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {thanks.data.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <Avatar name={item.from.name} initials={item.from.initials} size={32} tone="team" decorative />
              <div className="flex min-w-0 flex-col gap-1 leading-snug">
                <p className="text-sm text-fg">{t.rich("recognition.thanked", { from: item.from.name, to: listNames(item.to, format.locale), b: bold })}</p>
                <p dir="auto" className="text-sm text-fg-secondary">
                  {item.text}
                </p>
                <span className="w-fit rounded-pill bg-raised px-2 py-0.5 text-xs font-semibold text-fg-secondary">
                  {t("recognition.team")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return <FolderTabsCard label={t("tabs.label")} tabs={tabs} defaultValue="activity" />;
}

/** "Sarah P. and Katy F." in the UI language (recipients of one thanks). */
export function listNames(people: readonly { name: string }[], locale: string): string {
  return new Intl.ListFormat(locale === "fa" ? "fa-IR" : "en", { type: "conjunction" }).format(people.map((person) => person.name));
}
