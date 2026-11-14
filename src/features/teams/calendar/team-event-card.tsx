"use client";

import { Link2, Pencil, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { AvatarGroup } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RepositoryError } from "@/data/repositories";
import { toast } from "@/components/ui/toast";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { teamRsvps, type TeamEventDetail, type TeamRsvp } from "@/data/team-domain";
import { useTeamEventActions } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { rsvpCounts } from "./calendar-model";

/*
 * TM-03 event detail: a Signature card whose notch is never empty — Open
 * meeting link when the event has one, else Edit event for whoever may edit
 * it (organiser / Lead+), else Copy event link. Title, time, organiser, RSVP
 * Going / Maybe / Not going with the invitee summary, agenda items with owner
 * and minutes, and the external URL. Minutes, decisions and action items
 * arrive in Phase 5 (not shown).
 */

export function TeamEventCard({
  teamId,
  event,
  onEdit,
}: {
  teamId: string;
  event: TeamEventDetail;
  onEdit: () => void;
}) {
  const t = useTranslations("TeamCal");
  const format = useProjectFormat();
  const { rsvp, cancel } = useTeamEventActions(teamId);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const counts = rsvpCounts(event);
  const time = event.time
    ? convertDigits(event.end ? `${event.time} – ${event.end}` : event.time, format.digits)
    : t("allDay");

  const copyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("event", event.id);
    void navigator.clipboard?.writeText(url.toString());
    toast({ title: t("linkCopied") });
  };
  const action = event.url ? (
    <SignatureCardAction
      icon={Video}
      label={t("openLink")}
      onClick={() => window.open(event.url!, "_blank", "noopener,noreferrer")}
    />
  ) : event.can.edit ? (
    <SignatureCardAction icon={Pencil} label={t("editEvent")} onClick={onEdit} />
  ) : (
    <SignatureCardAction icon={Link2} label={t("copyLink")} onClick={copyLink} />
  );

  const answer = (value: TeamRsvp) =>
    rsvp.mutate({ eventId: event.id, rsvp: value }, { onSuccess: () => toast({ title: t("rsvp.saved") }) });

  // The event leaves the calendar only after the server canceled it (the refetch drops it).
  const confirmCancel = async () => {
    setCancelError(null);
    try {
      await cancel.mutateAsync(event.id);
      toast({ title: t("cancelEvent.done") });
    } catch (cause) {
      setCancelError(
        cause instanceof RepositoryError && cause.code === "conflict" ? t("cancelEvent.conflict") : t("cancelEvent.failed"),
      );
      throw cause;
    }
  };

  return (
    <SignatureCard action={action} as="section" aria-labelledby="team-event-title" contentClassName="gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">
          {event.kind === "time-off" ? t("timeOff") : t("event")}
        </p>
        <h2 id="team-event-title" className="type-title text-fg">
          <bdi>{event.title}</bdi>
        </h2>
        <p className="text-xs font-medium text-fg-secondary">
          {t("when", { date: `${format.day(event.day, "weekdayShort")} ${format.day(event.day, "dayMonth")}`, time })}
          {event.organiser ? (
            <>
              {" · "}
              {t("organiser", { name: event.organiser.name })}
            </>
          ) : null}
        </p>
      </div>

      {event.kind === "meeting" ? (
        <>
          {event.can.rsvp ? (
            <div role="group" aria-label={t("rsvp.label")} className="flex flex-wrap gap-1.5">
              {teamRsvps.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={event.myRsvp === value}
                  disabled={rsvp.isPending}
                  onClick={() => answer(value)}
                  className={cn(
                    "min-h-9 rounded-pill px-3 text-xs font-bold focus-visible:focus-ring",
                    event.myRsvp === value
                      ? "bg-scope-deep text-on-accent"
                      : "bg-surface text-fg inset-ring inset-ring-outline hover:bg-raised",
                  )}
                >
                  {t(`rsvp.${value}`)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <AvatarGroup
              size={32}
              max={4}
              people={event.invitees.map(({ person }) => ({
                name: person.name,
                initials: person.initials,
                tone: "team",
              }))}
            />
            <span className="text-xs font-medium text-fg-secondary">
              {t("rsvp.summary", {
                going: format.number(counts.going),
                maybe: format.number(counts.maybe),
                none: format.number(counts.none),
              })}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("agenda")}</h3>
            {event.agenda.length ? (
              <ol className="flex flex-col gap-1">
                {event.agenda.map((item) => (
                  <li key={item.id} className="flex min-h-11 items-center gap-3 text-sm font-semibold text-fg">
                    <span aria-hidden className="size-5 shrink-0 rounded-full inset-ring-2 inset-ring-outline" />
                    <bdi className="min-w-0 flex-1">
                      {item.owner ? t("agendaOwner", { title: item.title, name: item.owner.name }) : item.title}
                    </bdi>
                    {item.minutes !== null ? (
                      <span className="shrink-0 text-xs font-medium text-fg-secondary">
                        {t("minutes", { n: format.number(item.minutes) })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-fg-muted">{t("noAgenda")}</p>
            )}
          </div>
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="self-start truncate text-xs font-bold text-fg underline underline-offset-2"
            >
              {event.url.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
          {event.can.cancel ? (
            <ConfirmDialog
              tone="destructive"
              title={t("cancelEvent.title")}
              description={t("cancelEvent.body", { title: event.title })}
              confirmLabel={t("cancelEvent.confirm")}
              cancelLabel={t("cancelEvent.keep")}
              onConfirm={confirmCancel}
              onOpenChange={(open) => (open ? undefined : setCancelError(null))}
              error={cancelError}
              trigger={
                <Button variant="ghost" size="sm" className="self-start" disabled={cancel.isPending}>
                  {t("cancelEvent.action")}
                </Button>
              }
            />
          ) : null}
        </>
      ) : null}
    </SignatureCard>
  );
}
