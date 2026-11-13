"use client";

import { Megaphone, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { MsgSource, MsgSourceKind } from "@/data/messaging-domain";
import { useMessagingAvailable } from "@/data/messaging-provider";
import { useChannels, useChannelWorkspace } from "@/data/messaging-queries";
import { CompanyPageHeader } from "@/features/companies/company-page-header";
import { useCurrentCompanyAccess } from "@/features/companies/use-current-company";
import { ProjectPageHeader } from "@/features/projects/project-page-header";
import { useCurrentProjectAccess } from "@/features/projects/use-current-project";
import { TeamPageHeader } from "@/features/teams/team-page-header";
import { useCurrentTeamAccess } from "@/features/teams/use-current-team";
import { cn } from "@/lib/cn";
import { ConversationRoute } from "../conversation-route";
import type { ConversationHrefs } from "../conversation-view";
import { announcementsHref, channelsHref, sourceScope } from "../paths";
import { sourceParam, useOpenMessagingSheet } from "../sheets/messaging-sheet-params";

/*
 * Workspace Channels (MS-03): /projects|teams|companies/[id]/channels/[cid]
 * — this workspace's channels only (badge = unread), a pinned
 * "Announcements" entry (MT-04), "New channel" for workspace admins, and the
 * same conversation component as /messages (same conversation id). Which
 * channels show is decided by the messaging server: workspace membership
 * never grants channel history by itself.
 */

export type WorkspaceKind = Exclude<MsgSourceKind, "personal">;

/** Workspace name from the context's own access hooks (already loaded by the gate). */
export function useWorkspaceSource(kind: WorkspaceKind): MsgSource | undefined {
  const project = useCurrentProjectAccess();
  const team = useCurrentTeamAccess();
  const company = useCurrentCompanyAccess();
  if (kind === "project") return project.projectId ? { kind, workspaceId: project.projectId, name: project.project?.name ?? "" } : undefined;
  if (kind === "team") return team.teamId ? { kind, workspaceId: team.teamId, name: team.team?.name ?? "" } : undefined;
  return company.companyId ? { kind, workspaceId: company.companyId, name: company.company?.name ?? "" } : undefined;
}

export function WorkspaceHeader({ kind, title, resource }: { kind: WorkspaceKind; title: string; resource?: string }) {
  if (kind === "project") return <ProjectPageHeader module="channels" resource={resource} title={title} />;
  if (kind === "team") return <TeamPageHeader module="channels" resource={resource} title={title} />;
  return <CompanyPageHeader module="channels" resource={resource} title={title} />;
}

export function ChannelsScreen({ kind }: { kind: WorkspaceKind }) {
  const t = useTranslations("Msg.channels");
  const available = useMessagingAvailable();
  const params = useParams<{ rest?: string[] }>();
  const source = useWorkspaceSource(kind);
  const channels = useChannels(source?.workspaceId ?? undefined);
  const workspace = useChannelWorkspace(source?.workspaceId ?? undefined);
  const openSheet = useOpenMessagingSheet();
  const selected = params.rest?.[0] ? decodeURIComponent(params.rest[0]) : undefined;
  const panelSegments = params.rest?.slice(1);

  if (!available)
    return (
      <>
        <WorkspaceHeader kind={kind} title={t("title")} />
        <AccessState kind="msg-not-available" />
      </>
    );
  if (!source) return null;

  const hrefs: ConversationHrefs = {
    conversation: (cid) => channelsHref(source, cid),
    thread: (cid, mid) => channelsHref(source, cid, `/thread/${encodeURIComponent(mid)}`),
    info: (cid) => channelsHref(source, cid, "/info"),
    back: channelsHref(source),
  };
  const fallback = channels.data?.[0]?.id;
  const current = selected ?? fallback;

  return (
    <>
      <WorkspaceHeader kind={kind} title={t("title")} />
      <div data-scope={sourceScope(source)} className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-5">
        <nav aria-label={t("listLabel", { workspace: source.name })} className={cn("flex flex-col gap-1 rounded-[28px] bg-surface p-3 shadow-island lg:sticky lg:top-4", selected && "max-lg:hidden")}>
          <Link
            href={announcementsHref(source)}
            className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-bold text-fg hover:bg-subtle"
          >
            <Icon icon={Megaphone} size={16} className="text-scope-deep" />
            {t("announcements")}
          </Link>
          <span className="mx-3 my-1 h-px bg-hairline" aria-hidden />
          {channels.isPending ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-2xl" />)
          ) : channels.isError ? (
            <AccessState kind="error" titleAs="h2" />
          ) : channels.data.length === 0 ? (
            <p className="px-3 py-2 text-sm text-fg-secondary">{t("empty", { workspace: source.name })}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {channels.data.map((c) => (
                <li key={c.id}>
                  <Link
                    href={channelsHref(source, c.id)}
                    aria-current={c.id === current ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-fg hover:bg-subtle",
                      c.id === current && "inset-ring-[1.5px] inset-ring-scope-deep",
                      c.muted && "text-fg-secondary",
                    )}
                  >
                    <span aria-hidden className="text-scope-deep">
                      #
                    </span>
                    <bdi className="min-w-0 flex-1 truncate">{c.title}</bdi>
                    {c.unread > 0 ? <Badge label={t("unread", { count: c.unread })} count={c.unread} tone={c.mentions > 0 ? "primary" : "neutral"} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {workspace.data?.canCreate ? (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => openSheet("channel-new", { ws: sourceParam(source.kind, source.workspaceId) })}
              className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-fg-secondary hover:bg-subtle hover:text-fg"
            >
              <Icon icon={Plus} size={16} />
              {t("new")}
            </button>
          ) : null}
        </nav>
        <div className={cn("min-w-0", !selected && "max-lg:hidden")}>
          {current ? (
            <Suspense fallback={<AccessLoading />}>
              <ConversationRoute key={current} hrefs={hrefs} conversationId={current} panelSegments={selected ? panelSegments : undefined} />
            </Suspense>
          ) : channels.isSuccess ? (
            <AccessState kind="empty" titleAs="h2" />
          ) : null}
        </div>
      </div>
    </>
  );
}
