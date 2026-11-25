"use client";

import { HeartHandshake } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { getPlannerToday } from "@/data/clock";
import { useSocialAvailable } from "@/data/social-provider";
import { useSocialProjections } from "@/data/social-queries";
import { socialHref } from "../paths";
import { RsvpTag } from "../social-ui";
import { useActivityText } from "./activity-parts";

/*
 * SO-05 calendar projection: Going / Maybe social activities in the visible
 * range of the Personal calendar, read-only, with their source chip (group
 * or organiser). Nothing from Personal is sent to Social. The Calendar draws
 * timed activities in its grid (Social layer) and passes `untimedOnly`, so
 * this list keeps only the ones with no start time.
 */
export function SocialCalendarProjections({ days, untimedOnly = false, className }: { days: readonly string[]; untimedOnly?: boolean; className?: string }) {
  const t = useTranslations("Social.activities");
  const text = useActivityText();
  const available = useSocialAvailable();
  const from = days[0] ?? getPlannerToday();
  const to = days.at(-1) ?? from;
  const rows = useSocialProjections(from, to);
  const items = untimedOnly ? (rows.data ?? []).filter((p) => !p.startTime) : (rows.data ?? []);
  if (!available || !items.length) return null;
  return (
    <section aria-labelledby="cal-social" data-scope="social" className={className}>
      <div className="mb-2 flex items-center gap-2">
        <Icon icon={HeartHandshake} size={16} className="text-scope-deep" />
        <h2 id="cal-social" className="flex-1 text-sm font-bold">
          {t("inCalendar")}
        </h2>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((p) => (
          <li key={p.activityId}>
            <Link href={socialHref.activity(p.activityId)} className="flex items-center gap-3 rounded-2xl bg-surface p-3 hover:bg-subtle">
              <span aria-hidden="true" className="h-9 w-1 shrink-0 rounded-pill bg-scope-dot" />
              <span className="flex min-w-0 flex-1 flex-col">
                <bdi className="truncate text-sm font-bold text-fg">{p.title}</bdi>
                <span className="truncate text-xs text-fg-secondary">
                  {text.dates(p)} · <bdi className="rounded-pill bg-scope-soft px-1.5 font-semibold text-scope-deep">{p.source}</bdi>
                </span>
              </span>
              <RsvpTag rsvp={p.rsvp} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
