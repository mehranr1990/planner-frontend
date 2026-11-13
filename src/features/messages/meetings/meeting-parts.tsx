"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import type { MeetingSummary, MinutesStatus, MsgSource, Rsvp } from "@/data/messaging-domain";
import { cn } from "@/lib/cn";
import { useMsgFormat } from "../format";
import { messagesHref, sourceScope } from "../paths";
import { SourceChip } from "../visuals";

/*
 * Meeting pieces shared by MT-01 (list), the calendars and MT-02: the source
 * colour bar / chip (Personal = neutral slate), time range, RSVP chip
 * ("Respond" when unanswered) and minutes status.
 */

export function useMeetingTime() {
  const f = useMsgFormat();
  return {
    range: (m: Pick<MeetingSummary, "start" | "end">) => `${f.time(m.start)} – ${f.time(m.end)}`,
    day: (instant: string) => f.dayLabel(instant),
    f,
  };
}

export function MeetingSourceChip({ source }: { source: MsgSource }) {
  const t = useTranslations("Msg.meetings");
  return <SourceChip source={source} label={source.kind === "personal" ? t("personal") : source.name} />;
}

export function RsvpChip({ rsvp }: { rsvp: Rsvp }) {
  const t = useTranslations("Msg.meetings.rsvp");
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-pill px-3 text-xs font-bold",
        rsvp === "none" ? "bg-warning-soft text-warning-text" : rsvp === "not-going" ? "bg-subtle text-fg-secondary line-through" : "bg-subtle text-fg",
      )}
    >
      {t(rsvp === "none" ? "respond" : rsvp)}
    </span>
  );
}

export function MinutesChip({ status }: { status: MinutesStatus }) {
  const t = useTranslations("Msg.minutes.status");
  return <span className={cn("inline-flex h-7 shrink-0 items-center rounded-pill px-3 text-xs font-bold", status === "final" ? "bg-success-soft text-success-text" : "bg-info-soft text-info-text")}>{t(status)}</span>;
}

export function MeetingRow({ meeting: m, busyOnly = false, past = false }: { meeting: MeetingSummary; busyOnly?: boolean; past?: boolean }) {
  const t = useTranslations("Msg.meetings");
  const { range, f } = useMeetingTime();
  const body = (
    <>
      <span aria-hidden className="w-1 self-stretch rounded-pill bg-scope-deep" />
      <span className="flex w-28 shrink-0 flex-col text-xs">
        <span dir="ltr" className="font-bold text-fg">
          {range(m)}
        </span>
        <span className="text-fg-secondary">{busyOnly ? t("busy") : m.link ? t("externalLink") : m.location ? <bdi>{m.location}</bdi> : f.relative(m.start)}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <bdi className="truncate text-sm font-bold text-fg">{busyOnly ? t("busyTitle") : m.title}</bdi>
        <MeetingSourceChip source={m.source} />
      </span>
      {busyOnly ? null : past && m.minutesStatus ? <MinutesChip status={m.minutesStatus} /> : <RsvpChip rsvp={m.myRsvp} />}
    </>
  );
  const className = "flex items-center gap-3 rounded-[22px] bg-surface p-3 shadow-island transition-colors";
  if (busyOnly)
    return (
      <div data-scope={sourceScope(m.source)} className={cn(className, "opacity-70")}>
        {body}
      </div>
    );
  return (
    <Link href={messagesHref.meeting(m.id)} data-scope={sourceScope(m.source)} className={cn(className, "hover:bg-subtle")}>
      {body}
    </Link>
  );
}
