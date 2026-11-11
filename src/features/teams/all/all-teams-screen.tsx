"use client";

import { Archive, LayoutGrid, List, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import type { TeamInvitation, TeamSummary } from "@/data/team-domain";
import {
  useAcceptTeamInvitation,
  useDeclineTeamInvitation,
  useMyTeamInvitations,
  useRestoreTeam,
  useTeamDirectory,
} from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { DemoStateSwitch } from "@/features/projects/demo-state-switch";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";
import { parseTeamDemoState } from "../demo-state";
import { useTeamLabels } from "../labels";
import { useOpenTeamSheet } from "../sheets/team-sheet-params";
import { TeamCard } from "./team-card";
import { TeamInvitationStrip } from "./team-invitation-strip";

/*
 * TM-00 · All teams (/teams). A directory, not a dashboard: find your team and
 * act on invitations. Pills = local filter (All · Lead / Admin · Member ·
 * Viewer · Invitations · Archived); Grid / List = view mode (segmented).
 * States: loading, empty first use, archived (Restore for Owner/Admin only).
 * Project counts only include projects the viewer can open. No quota or
 * upsell. Mock mode: `?state=loading|empty|error`.
 */

export type TeamFilter = "all" | "lead" | "member" | "viewer" | "invitations" | "archived";
type TeamView = "grid" | "list";

const FILTERS: readonly TeamFilter[] = ["all", "lead", "member", "viewer", "invitations", "archived"];

export function matchesTeamFilter(team: TeamSummary, filter: TeamFilter): boolean {
  const archived = team.lifecycle === "archived";
  if (filter === "archived") return archived;
  if (archived || filter === "invitations") return false;
  if (filter === "lead") return team.role === "owner" || team.role === "admin" || team.role === "lead";
  if (filter === "member" || filter === "viewer") return team.role === filter;
  return true;
}

export function AllTeamsScreen() {
  const t = useTranslations("Teams");
  const tAccess = useTranslations("Access.states");
  const router = useRouter();
  const demo = parseTeamDemoState(useSearchParams().get("state"));
  const directory = useTeamDirectory();
  const invitations = useMyTeamInvitations();
  const accept = useAcceptTeamInvitation();
  const decline = useDeclineTeamInvitation();
  const openSheet = useOpenTeamSheet();
  const [filter, setFilter] = useState<TeamFilter>("all");
  const [view, setView] = useState<TeamView>("grid");

  const newTeam = () => openSheet("team-new");
  const header = (
    <PageHeader
      breadcrumb={<Breadcrumbs scope="team" items={[{ label: t("breadcrumb") }]} />}
      title={t("title")}
      actions={
        <>
          <Segmented
            variant="accent"
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            className="max-sm:hidden"
            options={[
              {
                value: "grid",
                label: (
                  <>
                    <Icon icon={LayoutGrid} size={16} />
                    {t("view.grid")}
                  </>
                ),
              },
              {
                value: "list",
                label: (
                  <>
                    <Icon icon={List} size={16} />
                    {t("view.list")}
                  </>
                ),
              },
            ]}
          />
          <Button size="lg" onClick={newTeam} aria-haspopup="dialog" className="max-sm:hidden">
            <Icon icon={Plus} size={18} />
            {t("new")}
          </Button>
        </>
      }
    />
  );

  const shell = (body: ReactNode) => (
    <div data-scope="team" className="flex min-w-0 flex-col gap-4">
      {header}
      {body}
      <DemoStateSwitch value={demo} states={["loading", "empty", "error"]} />
    </div>
  );

  if (demo === "loading" || directory.isPending || invitations.isPending) {
    return shell(
      <AccessLoading onRetry={() => void directory.refetch()}>
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-11 w-full max-w-xl rounded-pill" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 rounded-product" />
          <Skeleton className="h-44 rounded-product" />
          <Skeleton className="h-44 rounded-product" />
        </div>
      </AccessLoading>,
    );
  }
  if (demo === "error" || directory.isError || !directory.data) {
    return shell(
      <ErrorState
        size="default"
        variant="card"
        title={t("error.title")}
        retryLabel={t("error.retry")}
        onRetry={() => void directory.refetch()}
      />,
    );
  }

  const pending: readonly TeamInvitation[] = demo === "empty" ? [] : (invitations.data ?? []);
  const all = demo === "empty" ? [] : directory.data.teams;
  if (all.length === 0 && pending.length === 0) {
    return shell(
      <EmptyState
        variant="card"
        size="default"
        titleAs="h2"
        icon={Users}
        title={t("empty")}
        description={t("emptyDescription")}
        primaryAction={
          <Button onClick={newTeam} aria-haspopup="dialog">
            {t("new")}
          </Button>
        }
      />,
    );
  }

  const counts: Record<TeamFilter, number> = {
    all: all.filter((team) => matchesTeamFilter(team, "all")).length,
    lead: all.filter((team) => matchesTeamFilter(team, "lead")).length,
    member: all.filter((team) => matchesTeamFilter(team, "member")).length,
    viewer: all.filter((team) => matchesTeamFilter(team, "viewer")).length,
    invitations: pending.length,
    archived: all.filter((team) => matchesTeamFilter(team, "archived")).length,
  };
  const visible = all
    .filter((team) => matchesTeamFilter(team, filter))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const shownInvites = filter === "all" || filter === "invitations" ? pending : [];
  const busy = accept.isPending || decline.isPending;

  const strips = shownInvites.map((invitation) => (
    <TeamInvitationStrip
      key={invitation.id}
      invitation={invitation}
      busy={busy}
      onAccept={() =>
        accept.mutate(invitation.id, {
          onSuccess: ({ teamId }) => {
            toast({ title: tAccess("teamJoined.title"), description: tAccess("teamJoined.description") });
            router.push(teamHref(teamId));
          },
        })
      }
      onDecline={() => decline.mutate(invitation.id, { onSuccess: () => toast({ title: t("invite.declined") }) })}
    />
  ));

  let content: ReactNode;
  if (filter === "invitations") {
    content = strips.length > 0 ? null : <p className="px-1 text-sm text-fg-muted">{t("noInvites")}</p>;
  } else if (visible.length === 0) {
    content = <p className="px-1 text-sm text-fg-muted">{t("noneHere")}</p>;
  } else if (filter === "archived") {
    content = <ArchivedList teams={visible} />;
  } else if (view === "list") {
    content = <TeamListTable teams={visible} />;
  } else {
    content = (
      <ul key={filter} className="grid gap-4 motion-safe:animate-overlay-in sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((team) => (
          <li key={team.id} className="flex">
            <TeamCard team={team} />
          </li>
        ))}
      </ul>
    );
  }

  return shell(
    <>
      <PillGroup
        label={t("filter.label")}
        value={filter}
        onValueChange={setFilter}
        className="max-sm:hidden"
        options={FILTERS.map((value) => ({
          value,
          label: t(`filter.${value}`),
          count: value === "archived" ? undefined : counts[value],
        }))}
      />
      {strips.length > 0 ? <div className="flex flex-col gap-2">{strips}</div> : null}
      {content}
    </>,
  );
}

/** List view (segmented): Team · Role · People · Open tasks · For you · Projects · Updated. */
function TeamListTable({ teams }: { teams: readonly TeamSummary[] }) {
  const t = useTranslations("Teams.list");
  const labels = useTeamLabels();
  const format = useProjectFormat();
  const columns = ["role", "people", "open", "forYou", "projects"] as const;
  return (
    <UtilityCard className="overflow-x-auto p-2">
      <table className="w-full min-w-160 border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{t("label")}</caption>
        <thead>
          <tr className="text-xs font-semibold text-fg-secondary">
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t("team")}
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-3 text-start font-semibold">
                {t(column)}
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-end font-semibold">
              {t("updated")}
            </th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id} className="[&>td]:border-t [&>td]:border-line">
              <td className="px-4 py-3.5 font-bold text-fg">
                <Link href={teamHref(team.id)} className="rounded-pill hover:underline">
                  <bdi>{team.name}</bdi>
                </Link>
              </td>
              <td className="px-3 py-3.5 text-xs font-medium">{labels.role(team.role)}</td>
              <td className="px-3 py-3.5 text-xs tabular">{format.number(team.memberCount)}</td>
              <td className="px-3 py-3.5 text-xs tabular">{format.number(team.openTasks)}</td>
              <td className="px-3 py-3.5 text-xs font-semibold tabular">{format.number(team.forYou)}</td>
              <td className="px-3 py-3.5 text-xs tabular">{format.number(team.projectCount)}</td>
              <td className="px-4 py-3.5 text-end text-xs text-fg-muted">{format.relative(team.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </UtilityCard>
  );
}

/** Archived tab: read-only rows; Restore for Owner/Admin, View for everyone else. */
function ArchivedList({ teams }: { teams: readonly TeamSummary[] }) {
  const t = useTranslations("Teams.archived");
  return (
    <UtilityCard className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {teams.map((team) => (
          <ArchivedRow key={team.id} team={team} />
        ))}
      </ul>
      <p className="px-1 text-xs font-medium text-fg-muted">{t("hint")}</p>
    </UtilityCard>
  );
}

function ArchivedRow({ team }: { team: TeamSummary }) {
  const t = useTranslations("Teams.archived");
  const restore = useRestoreTeam();
  return (
    <li className="flex items-center gap-3 rounded-row bg-surface px-4 py-3">
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-fg-secondary"
      >
        <Icon icon={Archive} size={16} />
      </span>
      <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{team.name}</bdi>
      <span className="shrink-0 rounded-pill bg-raised px-2.5 py-1 text-xs font-semibold text-fg-secondary">
        {t("readOnly")}
      </span>
      {team.restorable ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={restore.isPending}
          onClick={() =>
            restore.mutate(team.id, { onSuccess: () => toast({ title: t("restored", { team: team.name }) }) })
          }
        >
          {t("restore")}
        </Button>
      ) : (
        <Link href={teamHref(team.id)} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          {t("view")}
        </Link>
      )}
    </li>
  );
}
