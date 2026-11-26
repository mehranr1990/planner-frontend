"use client";

import { Building2, CalendarClock, Check, FolderKanban, Mail, MessageSquare, Users, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ErrorState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAcceptCompanyInvitation, useDeclineCompanyInvitation } from "@/data/company-queries";
import { useConversationInvitations, useMessagingMutation } from "@/data/messaging-queries";
import { INVITATION_FEED_KINDS, type InvitationFeedKind, type InvitationNotice } from "@/data/personal-services";
import { serviceKeys, useInvitationFeed, useMarkInvitationRead } from "@/data/personal-services-queries";
import { useAcceptInvitation, useDeclineInvitation } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { useSocialPurgeMutation } from "@/data/social-queries";
import { useAcceptTeamInvitation, useDeclineTeamInvitation } from "@/data/team-queries";
import { messagesHref } from "@/features/messages/paths";
import { companyHref, projectHref, teamHref } from "@/features/navigation/contexts";
import { useServiceFormat } from "@/features/personal-services/use-service-format";
import { socialHref } from "@/features/social/paths";
import { cn } from "@/lib/cn";

/*
 * The invitation notification feed in the bell (B1–B4): every current,
 * authorized pending offer addressed to me, per kind (Projects, Teams,
 * Companies, Conversations, Meetings, Social groups), with read state,
 * inviter, destination, role, sent and expiry times. It honors my IN_APP
 * setting; the modules' ordinary pending lists (context switcher, Messages,
 * Social) stay the place that never hides an invitation.
 * Mark as read is only a read mark. Accept / Decline run each module's own
 * workflow (Project / Team / Company proof flows, the conversation's
 * pending offer, a fresh Social proof); meetings open the meeting to RSVP.
 * Expired rows are not actionable; answered, revoked or lost offers leave
 * the feed after the refresh that follows every answer.
 */

type Filter = "all" | InvitationFeedKind;

const KIND_ICON: Record<InvitationFeedKind, LucideIcon> = {
  project: FolderKanban,
  team: Users,
  company: Building2,
  conversation: MessageSquare,
  meeting: CalendarClock,
  socialGroup: UsersRound,
};

/** All six kind feeds (each one cursor-paged). */
function useFeeds() {
  const project = useInvitationFeed("project");
  const team = useInvitationFeed("team");
  const company = useInvitationFeed("company");
  const conversation = useInvitationFeed("conversation");
  const meeting = useInvitationFeed("meeting");
  const socialGroup = useInvitationFeed("socialGroup");
  return { project, team, company, conversation, meeting, socialGroup };
}

/** Feed failures worth showing: a server not serving the feed (unsupported / forbidden / not found) stays quiet. */
const loud = (error: unknown) => !(error instanceof RepositoryError && ["unsupported", "forbidden", "not-found"].includes(error.code));

/**
 * Whether any loaded invitation notice is unread. A yes / no only: the feed is
 * paged (25 per kind) and serves no total, so a loaded-page count would not be
 * the real unread total (gap recorded in DECISIONS_AND_BLOCKERS).
 */
export function useHasUnreadInvitations(): boolean {
  const feeds = useFeeds();
  return INVITATION_FEED_KINDS.some((kind) => feeds[kind].data?.pages.some((page) => page.items.some((item) => !item.readAt)) ?? false);
}

export function InvitationsNoticeSection({ onNavigate }: { onNavigate(): void }) {
  const t = useTranslations("Invitations");
  const tShell = useTranslations("Shell.notifications");
  const titleId = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const feeds = useFeeds();
  const kinds = filter === "all" ? INVITATION_FEED_KINDS : [filter];
  const rows = kinds
    .flatMap((kind) => feeds[kind].data?.pages.flatMap((page) => page.items) ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = kinds.some((kind) => feeds[kind].isPending && feeds[kind].fetchStatus !== "idle");
  const failed = kinds.filter((kind) => feeds[kind].isError && loud(feeds[kind].error));
  const more = kinds.filter((kind) => feeds[kind].hasNextPage);
  const loadingMore = kinds.some((kind) => feeds[kind].isFetchingNextPage);
  const anyItems = INVITATION_FEED_KINDS.some((kind) => (feeds[kind].data?.pages[0]?.items.length ?? 0) > 0);
  // Nothing to say in "All" with no offers and no failure: the section stays out of the way.
  if (filter === "all" && !anyItems && !pending && failed.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1 border-b border-line pb-2">
      <div className="flex items-center justify-between gap-2 px-1.5">
        <h3 id={titleId} className="flex items-center gap-1.5 text-xs font-bold text-fg-secondary">
          <Mail aria-hidden="true" className="size-3.5" />
          {tShell("invitations")}
        </h3>
        <Select aria-label={t("feed.kindFilter")} value={filter} onValueChange={(value) => setFilter(value as Filter)} className="h-8 w-40 text-xs">
          <SelectItem value="all">{t("feed.allKinds")}</SelectItem>
          {INVITATION_FEED_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind} icon={KIND_ICON[kind]}>
              {t(`feed.kind.${kind}`)}
            </SelectItem>
          ))}
        </Select>
      </div>
      {failed.length > 0 ? (
        <ErrorState variant="bare" title={t("feed.error")} onRetry={() => failed.forEach((kind) => void feeds[kind].refetch())} />
      ) : null}
      {pending && rows.length === 0 ? (
        <div className="flex flex-col gap-1" aria-busy="true" aria-label={t("feed.loading")}>
          <Skeleton className="h-16 rounded-row" />
        </div>
      ) : rows.length === 0 && failed.length === 0 ? (
        <p className="px-1.5 py-2 text-xs text-fg-muted">{t("feed.empty")}</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {rows.map((row) => (
            <InvitationRow key={`${row.kind}-${row.id}`} row={row} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
      {more.length > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          className="self-center"
          loading={loadingMore}
          onClick={() => more.forEach((kind) => void feeds[kind].fetchNextPage())}
        >
          {t("feed.more")}
        </Button>
      ) : null}
    </section>
  );
}

function InvitationRow({ row, onNavigate }: { row: InvitationNotice; onNavigate(): void }) {
  const t = useTranslations("Invitations");
  const ts = useTranslations("Services.inbox");
  const format = useServiceFormat();
  const router = useRouter();
  const client = useQueryClient();
  const markRead = useMarkInvitationRead();
  const conversationOffers = useConversationInvitations();
  const acceptProject = useAcceptInvitation();
  const declineProject = useDeclineInvitation();
  const acceptTeam = useAcceptTeamInvitation();
  const declineTeam = useDeclineTeamInvitation();
  const acceptCompany = useAcceptCompanyInvitation();
  const declineCompany = useDeclineCompanyInvitation();
  const answerConversation = useMessagingMutation((repo, input: { accept: boolean }) => {
    const offer = conversationOffers.data?.find((item) => item.id === row.id);
    if (!offer) throw new RepositoryError("not-found", "The conversation invitation is no longer pending");
    return repo.conversations.respondInvitation(offer, input.accept);
  });
  const answerGroup = useSocialPurgeMutation((repo, input: { accept: boolean }) => repo.invitations.answerPending({ id: row.id, revision: row.revision }, input.accept));
  const mutations = [markRead, acceptProject, declineProject, acceptTeam, declineTeam, acceptCompany, declineCompany, answerConversation, answerGroup];
  const busy = mutations.some((mutation) => mutation.isPending);

  const unread = !row.readAt;
  // The time the row was first shown (render stays pure); a refetch after any answer drops ended offers.
  const [now] = useState(() => Date.now());
  const expired = Date.parse(row.expiresAt) <= now;
  // Meetings are answered with an RSVP on the meeting itself; a conversation only while its pending offer is listed.
  const inPlace = !expired && (row.kind !== "meeting" && (row.kind !== "conversation" || Boolean(conversationOffers.data?.some((item) => item.id === row.id))));
  const openHref = row.kind === "meeting" ? messagesHref.meeting(row.targetId) : row.kind === "conversation" ? messagesHref.root : row.kind === "socialGroup" ? socialHref.home : null;
  const Icon = KIND_ICON[row.kind];

  const refresh = () => client.invalidateQueries({ queryKey: serviceKeys.invitationFeed });
  const onError = () => {
    toast({ title: t("answerFailed"), tone: "danger" });
    void refresh();
  };
  const open = (href: string) => {
    void refresh();
    onNavigate();
    router.push(href);
  };
  const answer = (accept: boolean) => {
    const done = { onError, onSuccess: () => void refresh() };
    if (row.kind === "project") {
      if (accept) acceptProject.mutate(row.id, { onError, onSuccess: ({ projectId }) => open(projectHref(projectId)) });
      else declineProject.mutate({ id: row.id }, done);
    } else if (row.kind === "team") {
      if (accept) acceptTeam.mutate(row.id, { onError, onSuccess: ({ teamId }) => open(teamHref(teamId)) });
      else declineTeam.mutate(row.id, done);
    } else if (row.kind === "company") {
      if (accept) acceptCompany.mutate(row.id, { onError, onSuccess: ({ companyId }) => open(companyHref(companyId)) });
      else declineCompany.mutate(row.id, done);
    } else if (row.kind === "conversation") {
      answerConversation.mutate({ accept }, { onError, onSuccess: (conversationId) => (accept ? open(messagesHref.conversation(conversationId)) : void refresh()) });
    } else if (row.kind === "socialGroup") {
      answerGroup.mutate({ accept }, { onError, onSuccess: ({ groupId }) => (accept ? open(groupId ? socialHref.group(groupId) : socialHref.home) : void refresh()) });
    }
  };

  const details = [t(`feed.kind.${row.kind}`), row.inviterName ? t("feed.from", { name: row.inviterName }) : null, row.role ? t("feed.role", { role: row.role }) : null].filter(Boolean);

  return (
    <li data-kind={row.kind} data-unread={unread || undefined} className={cn("flex flex-col gap-2 rounded-row p-2", unread ? "bg-subtle" : "bg-transparent")}>
      <div className="flex min-w-0 items-start gap-2">
        <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", unread ? "bg-scope-deep" : "bg-transparent")} />
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className={cn("min-w-0 text-sm", unread ? "font-bold text-fg" : "font-semibold text-fg-secondary")}>
            <bdi dir="auto">{row.targetName}</bdi>
            {unread ? <span className="sr-only"> · {ts("unreadState")}</span> : null}
          </p>
          <p className="text-xs text-fg-secondary">
            <bdi dir="auto">{details.join(" · ")}</bdi>
          </p>
          <p className="text-xs text-fg-muted">
            {t("feed.sent", { when: format.instant(row.createdAt) })} ·{" "}
            {expired ? <span className="font-semibold text-danger-text">{t("feed.expired")}</span> : t("feed.expires", { when: format.instant(row.expiresAt) })}
          </p>
        </div>
        {unread ? (
          <IconButton
            size="sm"
            variant="ghost"
            icon={Check}
            label={t("feed.markRead")}
            disabled={busy}
            onClick={() => markRead.mutate({ kind: row.kind, id: row.id }, { onError: () => toast({ title: t("feed.readFailed"), tone: "danger" }) })}
          />
        ) : null}
      </div>
      {expired ? null : (
        <div className="flex flex-wrap justify-end gap-1.5">
          {openHref && !inPlace ? (
            <Button size="sm" variant="secondary" asChild>
              <Link href={openHref} onClick={onNavigate}>
                {row.kind === "meeting" ? t("feed.openMeeting") : t("feed.open")}
              </Link>
            </Button>
          ) : null}
          {inPlace ? (
            <>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => answer(false)}>
                {t("decline")}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => answer(true)}>
                {t("accept")}
              </Button>
            </>
          ) : null}
        </div>
      )}
    </li>
  );
}
