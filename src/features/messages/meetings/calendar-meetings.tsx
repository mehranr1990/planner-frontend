"use client";

import { Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { MsgSource } from "@/data/messaging-domain";
import { getPlannerToday } from "@/data/clock";
import { useMessagingAvailable } from "@/data/messaging-provider";
import { useMeetingsForCalendar } from "@/data/messaging-queries";
import { instantAt } from "@/lib/dates/clock-time";
import { useOpenMessagingSheet, sourceParam } from "../sheets/messaging-sheet-params";
import { MeetingRow } from "./meeting-parts";

/*
 * Meetings in a source calendar (MT-01 owner decision): Personal, project and
 * team calendars list the meetings that belong to them in the visible range
 * and offer "New meeting" (?sheet=meeting-new with this source and day).
 * People who aren't invited see "Busy" only when the source allows it.
 */
export function CalendarMeetings({ source, days, className }: { source: MsgSource; days: readonly string[]; className?: string }) {
  const t = useTranslations("Msg.meetings");
  const available = useMessagingAvailable();
  const openSheet = useOpenMessagingSheet();
  const from = days[0] ?? getPlannerToday();
  const last = days.at(-1) ?? from;
  const rows = useMeetingsForCalendar(available ? source : undefined, instantAt(from, 0), instantAt(last, 24 * 60));
  if (!available) return null;
  const today = getPlannerToday();
  const day = days.includes(today) ? today : from;
  return (
    <section aria-labelledby="cal-meetings" className={className}>
      <div className="mb-2 flex items-center gap-2">
        <Icon icon={Users} size={16} className="text-fg-secondary" />
        <h2 id="cal-meetings" className="flex-1 text-sm font-bold">
          {t("inCalendar")}
        </h2>
        <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => openSheet("meeting-new", { source: sourceParam(source.kind, source.workspaceId), day })}>
          <Icon icon={Plus} size={16} />
          {t("new")}
        </Button>
      </div>
      {rows.data?.length ? (
        <ul className="flex flex-col gap-2">
          {rows.data.map((m) => (
            <li key={m.id}>
              <MeetingRow meeting={m} busyOnly={m.busyOnly} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-surface p-3 text-sm text-fg-secondary">{t("noneInRange")}</p>
      )}
    </section>
  );
}
