"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import type { MeetingInvitation, MeetingSummary, MeetingTab, Rsvp } from "@/data/messaging-domain";
import { useMeetingInvitations, useMeetings, useMessagingMutation } from "@/data/messaging-queries";
import { toast } from "@/components/ui/toast";
import { errorText } from "../message-dialogs";
import { useOpenMessagingSheet } from "../sheets/messaging-sheet-params";
import { MeetingRow, useMeetingTime } from "./meeting-parts";

/*
 * MT-01 · /messages/meetings: every meeting you're invited to, from all
 * calendars (Personal / project / team / company) — Upcoming · Past ·
 * Needs minutes (you're the minute taker and minutes aren't final). Rows use
 * the source colour; "Respond" when you haven't answered. No calls: links
 * are plain external URLs.
 */
export function MeetingsScreen() {
  const t = useTranslations("Msg.meetings");
  const [tab, setTab] = useState<MeetingTab>("upcoming");
  const list = useMeetings(tab);
  const needs = useMeetings("needs-minutes");
  const invitations = useMeetingInvitations(tab === "upcoming");
  const openSheet = useOpenMessagingSheet();
  const { day } = useMeetingTime();

  const groups: { label: string; rows: MeetingSummary[] }[] = [];
  for (const m of list.data ?? []) {
    const label = day(m.start);
    const last = groups.at(-1);
    if (last?.label === label) last.rows.push(m);
    else groups.push({ label, rows: [m] });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="type-display flex-1 text-fg">{t("title")}</h1>
        <Segmented<MeetingTab>
          label={t("tabsLabel")}
          value={tab}
          onValueChange={setTab}
          options={[
            { value: "upcoming", label: t("tabs.upcoming") },
            { value: "past", label: t("tabs.past") },
            { value: "needs-minutes", label: needs.data?.length ? t("tabs.needsCount", { count: needs.data.length }) : t("tabs.needs") },
          ]}
        />
        <Button aria-haspopup="dialog" onClick={() => openSheet("meeting-new", { source: "personal" })}>
          <Icon icon={Plus} size={18} />
          {t("new")}
        </Button>
      </header>
      {tab === "upcoming" && invitations.data?.length ? (
        <section aria-labelledby="mt-invitations" className="flex flex-col gap-2">
          <h2 id="mt-invitations" className="text-xs font-bold text-fg-secondary">
            {t("invitations")}
          </h2>
          <ul className="flex flex-col gap-2">
            {invitations.data.map((invitation) => (
              <li key={invitation.meetingId}>
                <InvitationRow invitation={invitation} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {list.isPending ? (
        <AccessLoading />
      ) : list.isError ? (
        <AccessState kind="error" titleAs="h2" />
      ) : list.data.length === 0 ? (
        <p className="rounded-[22px] bg-surface p-6 text-sm text-fg-secondary shadow-island">{t(`empty.${tab}`)}</p>
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label} className="flex flex-col gap-2">
            <h2 className="text-xs font-bold text-fg-secondary">{g.label}</h2>
            <ul className="flex flex-col gap-2">
              {g.rows.map((m) => (
                <li key={m.id}>
                  <MeetingRow meeting={m} past={tab !== "upcoming"} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="text-xs text-fg-secondary">{t("note")}</p>
    </div>
  );
}

/** OD-15: a pending invitation as a reduced row — title and time only (no source by policy), answered in place. */
function InvitationRow({ invitation }: { invitation: MeetingInvitation }) {
  const t = useTranslations("Msg.meetings");
  const tMsg = useTranslations("Msg");
  const { day, range } = useMeetingTime();
  const answer = useMessagingMutation((repo, value: Exclude<Rsvp, "none">) => repo.meetings.rsvp(invitation.meetingId, value));
  const fail = (e: unknown) => toast({ title: errorText(tMsg as never, e), tone: "danger" });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[22px] bg-surface p-4 shadow-island">
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi className="text-sm font-bold">{invitation.title}</bdi>
        {invitation.start && invitation.end ? (
          <span className="text-xs text-fg-secondary">
            {day(invitation.start)} · {range({ start: invitation.start, end: invitation.end })}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-wrap gap-2">
        {(["going", "maybe", "not-going"] as const).map((value) => (
          <Button key={value} size="sm" variant={value === "going" ? "primary" : "secondary"} disabled={answer.isPending} onClick={() => answer.mutate(value, { onError: fail })}>
            {t(`rsvp.${value}`)}
          </Button>
        ))}
      </span>
    </div>
  );
}
