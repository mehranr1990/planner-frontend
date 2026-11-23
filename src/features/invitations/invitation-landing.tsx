"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { useAcceptCompanyInvitation, useCompanyInvitations, useDeclineCompanyInvitation } from "@/data/company-queries";
import type { ConversationInvitation, MeetingInvitation, Rsvp } from "@/data/messaging-domain";
import { useConversationInvitations, useMessagingMutation } from "@/data/messaging-queries";
import { useAcceptInvitation, useDeclineInvitation, useMyInvitations } from "@/data/project-queries";
import { useAcceptTeamInvitation, useDeclineTeamInvitation, useMyTeamInvitations } from "@/data/team-queries";
import { useMsgFormat } from "@/features/messages/format";
import { messagesHref } from "@/features/messages/paths";
import { companyHref, projectHref, teamHref } from "@/features/navigation/contexts";
import { forgetProof, peekProof, type InviteLinkKind } from "./held-proof";

/*
 * /invitations/accept?id=…[&kind=CONVERSATION|MEETING] — the signed-in
 * recipient answers explicitly; nothing is joined automatically.
 * - Project / Team / Company: the offer is looked up among my own pending
 *   invitations (they only list offers for this verified account) and
 *   answered with the existing accept / decline (fresh in-app proof).
 * - Conversation / Meeting: the email proof (held in memory by /invite)
 *   claims the offer once — that grants nothing — then Accept / Decline or
 *   RSVP use the existing invitation answers. Without the proof (e.g. after
 *   signing in) an already-claimed conversation offer is still answerable;
 *   otherwise the recipient opens the email link again.
 * Every failure reads the same (no hint whether an account or offer exists).
 */

export function InvitationLanding() {
  const t = useTranslations("Invitations");
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const rawKind = params.get("kind");
  const kind: InviteLinkKind | null = rawKind === "CONVERSATION" || rawKind === "MEETING" ? rawKind : null;
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4">
      <h1 className="type-title text-fg">{t("title")}</h1>
      {!id ? <InlineAlert tone="warning" title={t("brokenLink")} /> : kind === "CONVERSATION" ? <ConversationOffer id={id} /> : kind === "MEETING" ? <MeetingOffer id={id} /> : <WorkspaceOffer id={id} />}
    </main>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <UtilityCard as="section" tone="surface" className="gap-3 p-5">
      {children}
    </UtilityCard>
  );
}

function Unavailable() {
  const t = useTranslations("Invitations");
  return <InlineAlert tone="warning" title={t("unavailable")} description={t("unavailableHint")} />;
}

// ── Project / Team / Company ─────────────────────────────────────────────

function WorkspaceOffer({ id }: { id: string }) {
  const t = useTranslations("Invitations");
  const router = useRouter();
  // The email proof is not needed here: my own pending list proves the address, answers use a fresh in-app proof.
  useEffect(() => forgetProof(), []);
  const projects = useMyInvitations();
  const teams = useMyTeamInvitations();
  const companies = useCompanyInvitations();
  const acceptProject = useAcceptInvitation();
  const declineProject = useDeclineInvitation();
  const acceptTeam = useAcceptTeamInvitation();
  const declineTeam = useDeclineTeamInvitation();
  const acceptCompany = useAcceptCompanyInvitation();
  const declineCompany = useDeclineCompanyInvitation();
  const [failed, setFailed] = useState(false);

  const project = projects.data?.find((item) => item.id === id);
  const team = teams.data?.find((item) => item.id === id);
  const company = companies.data?.find((item) => item.id === id);
  const scope = project ? "project" : team ? "team" : company ? "company" : null;
  const loading = !scope && (projects.isPending || teams.isPending || companies.isPending);
  const busy = [acceptProject, declineProject, acceptTeam, declineTeam, acceptCompany, declineCompany].some((mutation) => mutation.isPending);
  if (loading) return <Skeleton className="h-36 rounded-row" />;
  if (!scope) return <Unavailable />;

  const name = project?.projectName ?? team?.teamName ?? company?.companyName ?? null;
  const onError = () => setFailed(true);
  const accept = () => {
    setFailed(false);
    if (scope === "project") acceptProject.mutate(id, { onSuccess: ({ projectId }) => router.replace(projectHref(projectId)), onError });
    else if (scope === "team") acceptTeam.mutate(id, { onSuccess: ({ teamId }) => router.replace(teamHref(teamId)), onError });
    else acceptCompany.mutate(id, { onSuccess: ({ companyId }) => router.replace(companyHref(companyId)), onError });
  };
  const decline = () => {
    setFailed(false);
    const home = scope === "project" ? "/projects" : scope === "team" ? "/teams" : "/companies";
    if (scope === "project") declineProject.mutate({ id }, { onSuccess: () => router.replace(home), onError });
    else if (scope === "team") declineTeam.mutate(id, { onSuccess: () => router.replace(home), onError });
    else declineCompany.mutate(id, { onSuccess: () => router.replace(home), onError });
  };
  return (
    <Panel>
      <p className="text-sm font-bold text-fg">{name ? <bdi>{t(`offer.${scope}Named`, { name })}</bdi> : t(`offer.${scope}`)}</p>
      <p className="text-xs text-fg-secondary">{t("expiryNote")}</p>
      {failed ? <InlineAlert tone="danger" title={t("answerFailed")} /> : null}
      <Answer busy={busy} onAccept={accept} onDecline={decline} />
    </Panel>
  );
}

function Answer({ busy, onAccept, onDecline }: { busy: boolean; onAccept: () => void; onDecline: () => void }) {
  const t = useTranslations("Invitations");
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={onAccept}>
        {t("accept")}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={onDecline}>
        {t("decline")}
      </Button>
    </div>
  );
}

// ── Conversation ─────────────────────────────────────────────────────────

/** Claims the held proof once per mount; resolves the claimed offer or null (generic failure). */
function useClaim<T>(id: string, claim: (proof: string) => Promise<T>) {
  const [state, setState] = useState<{ status: "idle" | "pending" | "done" | "failed"; value: T | null }>(() => ({ status: peekProof(id) ? "pending" : "idle", value: null }));
  const started = useRef(false);
  const claimRef = useRef(claim);
  useEffect(() => {
    const proof = peekProof(id);
    if (!proof || started.current) return;
    started.current = true;
    claimRef
      .current(proof)
      .then((value) => setState({ status: "done", value }))
      .catch(() => setState({ status: "failed", value: null }))
      // Single-use either way: a failed proof is not retried from memory.
      .finally(forgetProof);
  }, [id]);
  return state;
}

function ConversationOffer({ id }: { id: string }) {
  const t = useTranslations("Invitations");
  const router = useRouter();
  const format = useMsgFormat();
  const claimMutation = useMessagingMutation((repo, proof: string) => repo.conversations.claimEmailInvitation(id, proof));
  const claimed = useClaim<ConversationInvitation>(id, (proof) => claimMutation.mutateAsync(proof));
  const mine = useConversationInvitations();
  const respond = useMessagingMutation((repo, vars: { invitation: ConversationInvitation; accept: boolean }) => repo.conversations.respondInvitation(vars.invitation, vars.accept));
  const invitation = claimed.value ?? mine.data?.find((item) => item.id === id) ?? null;

  if (claimed.status === "pending" || (!invitation && mine.isPending)) return <Skeleton className="h-36 rounded-row" />;
  if (!invitation) return claimed.status === "idle" ? <InlineAlert tone="warning" title={t("reopenLink")} description={t("reopenLinkHint")} /> : <Unavailable />;
  return (
    <Panel>
      <p className="text-sm font-bold text-fg">
        {invitation.inviterName ? <bdi>{t(`offer.conversationFrom.${invitation.kind}`, { name: invitation.inviterName })}</bdi> : t(`offer.conversation.${invitation.kind}`)}
      </p>
      <p className="text-xs text-fg-secondary">{t("expires", { date: format.date(invitation.expiresAt, "full") })}</p>
      {respond.isError ? <InlineAlert tone="danger" title={t("answerFailed")} /> : null}
      <Answer
        busy={respond.isPending}
        onAccept={() => respond.mutate({ invitation, accept: true }, { onSuccess: (conversationId) => router.replace(messagesHref.conversation(conversationId)) })}
        onDecline={() => respond.mutate({ invitation, accept: false }, { onSuccess: () => router.replace(messagesHref.root) })}
      />
    </Panel>
  );
}

// ── Meeting ──────────────────────────────────────────────────────────────

const RSVPS: readonly Exclude<Rsvp, "none">[] = ["going", "maybe", "not-going"];

function MeetingOffer({ id }: { id: string }) {
  const t = useTranslations("Invitations");
  const router = useRouter();
  const format = useMsgFormat();
  const claimMutation = useMessagingMutation((repo, proof: string) => repo.meetings.claimEmailInvitation(id, proof));
  const claimed = useClaim<MeetingInvitation>(id, (proof) => claimMutation.mutateAsync(proof));
  const rsvp = useMessagingMutation((repo, vars: { meetingId: string; value: Exclude<Rsvp, "none"> }) => repo.meetings.rsvp(vars.meetingId, vars.value));
  const meeting = claimed.value;

  if (claimed.status === "pending") return <Skeleton className="h-36 rounded-row" />;
  if (claimed.status === "idle") return <InlineAlert tone="warning" title={t("reopenLink")} description={t("reopenLinkHint")} />;
  if (!meeting) return <Unavailable />;
  return (
    <Panel>
      <p className="text-sm font-bold text-fg">
        <bdi dir="auto">{meeting.title}</bdi>
      </p>
      <p className="text-xs text-fg-secondary">
        {meeting.start ? (
          <span dir="ltr" className="tabular">
            {format.date(meeting.start, "full")} · {format.time(meeting.start)}
            {meeting.end ? `–${format.time(meeting.end)}` : ""}
          </span>
        ) : (
          t("timeUnknown")
        )}
      </p>
      {rsvp.isError ? <InlineAlert tone="danger" title={t("answerFailed")} /> : null}
      <div className="flex flex-wrap gap-2">
        {RSVPS.map((value) => (
          <Button
            key={value}
            variant={value === "going" ? "primary" : "secondary"}
            disabled={rsvp.isPending}
            onClick={() => rsvp.mutate({ meetingId: meeting.meetingId, value }, { onSuccess: () => router.replace(messagesHref.meeting(meeting.meetingId)) })}
          >
            {t(`rsvp.${value}`)}
          </Button>
        ))}
      </div>
    </Panel>
  );
}
