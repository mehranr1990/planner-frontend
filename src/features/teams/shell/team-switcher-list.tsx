"use client";

import { Check, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { TeamDirectory, TeamInvitation, TeamSummary } from "@/data/team-domain";
import { useProjectFormat } from "@/features/projects/format";
import { ProjectTile } from "@/features/projects/project-visuals";
import { cn } from "@/lib/cn";
import { useTeamLabels } from "../labels";

/*
 * The Teams workspace list inside the context switcher (TS-01): Find a team ·
 * Your teams (recent first, role · people per team) · Invitations
 * (public-safe preview) · Archived (read-only) · All teams · New team.
 * Choosing an entry goes to /teams/[id] (the URL is the source of truth).
 */

export interface TeamSwitcherListProps {
  directory: TeamDirectory | undefined;
  invitations: readonly TeamInvitation[];
  activeTeamId?: string;
  /** Opens /teams/[id] (teams, invitations and archived alike). */
  onOpen: (teamId: string) => void;
  onAllTeams: () => void;
  onNewTeam: () => void;
}

export function TeamSwitcherList({
  directory,
  invitations,
  activeTeamId,
  onOpen,
  onAllTeams,
  onNewTeam,
}: TeamSwitcherListProps) {
  const t = useTranslations("Teams");
  const labels = useTeamLabels();
  const format = useProjectFormat();
  const [query, setQuery] = useState("");
  const searchId = useId();
  const needle = query.trim().toLocaleLowerCase();
  const matches = (name: string) => needle === "" || name.toLocaleLowerCase().includes(needle);

  const teams = (directory?.teams ?? []).filter((team) => matches(team.name));
  const live = teams.filter((team) => team.lifecycle === "active");
  const recentIds = directory?.recentIds ?? [];
  const yours = [
    ...recentIds.map((id) => live.find((team) => team.id === id)).filter((team) => team !== undefined),
    ...live.filter((team) => !recentIds.includes(team.id)),
  ];
  const archived = teams.filter((team) => team.lifecycle === "archived");
  const invites = invitations.filter((invitation) => invitation.teamId !== null && matches(invitation.teamName ?? ""));

  const row = (team: TeamSummary, line: string, tag?: string) => {
    const selected = team.id === activeTeamId;
    return (
      <button
        key={team.id}
        type="button"
        data-switcher-row=""
        aria-current={selected ? "true" : undefined}
        onClick={() => onOpen(team.id)}
        className={cn(
          "flex min-h-touch items-center gap-2.5 rounded-row px-2 py-1.5 text-start transition-colors",
          selected ? "bg-scope-soft text-scope-deep" : "text-fg hover:bg-raised",
        )}
      >
        <ProjectTile initials={team.initials} tint={team.tint} size="sm" muted={team.lifecycle === "archived"} />
        <span className="flex min-w-0 flex-1 flex-col leading-snug">
          <bdi className={cn("truncate text-sm", selected ? "font-bold" : "font-semibold")}>{team.name}</bdi>
          <span className="truncate text-xs font-medium text-fg-secondary">{line}</span>
        </span>
        {tag ? (
          <span className="shrink-0 rounded-pill bg-raised px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-secondary">
            {tag}
          </span>
        ) : null}
        {selected ? <Icon icon={Check} size={16} className="shrink-0" /> : null}
      </button>
    );
  };

  const section = (key: string, title: string, children: ReactNode[], count?: number) =>
    children.length > 0 ? (
      <div key={key} role="group" aria-label={title} className="flex flex-col gap-0.5 pt-2">
        <p aria-hidden="true" className="px-2 pb-0.5 text-[0.6875rem] font-bold tracking-wide text-fg-muted uppercase">
          {count === undefined ? title : `${title} · ${format.number(count)}`}
        </p>
        {children}
      </div>
    ) : null;

  const empty = yours.length + invites.length + archived.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={searchId} className="sr-only">
        {t("switcher.find")}
      </label>
      <div className="flex h-10 items-center gap-2 rounded-pill bg-surface px-3 text-fg-secondary">
        <Icon icon={Search} size={16} className="shrink-0" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Home/End move the caret here, not the row focus.
          onKeyDown={(event) => {
            if (event.key === "Home" || event.key === "End") event.stopPropagation();
          }}
          placeholder={t("switcher.find")}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      {section(
        "yours",
        t("switcher.yours"),
        yours.map((team) =>
          row(team, `${labels.role(team.role)} · ${t("people", { n: format.number(team.memberCount) })}`),
        ),
        yours.length,
      )}
      {section(
        "invitations",
        t("switcher.invitations"),
        invites.map((invitation) => (
          <button
            key={invitation.id}
            type="button"
            data-switcher-row=""
            onClick={() => onOpen(invitation.teamId!)}
            className="flex min-h-touch items-center gap-2.5 rounded-row px-2 py-1.5 text-start text-fg transition-colors hover:bg-raised"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-tile bg-raised text-xs font-bold text-fg-secondary"
            >
              <bdi>{invitation.initials ?? ""}</bdi>
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-snug">
              <bdi className="truncate text-sm font-semibold">{invitation.teamName ?? t("invite.generic")}</bdi>
              {invitation.inviter && invitation.role ? (
                <span className="truncate text-xs font-medium text-fg-secondary">
                  {t("switcher.invitedBy", { name: invitation.inviter.name, role: labels.role(invitation.role) })}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">
              {t("switcher.review")}
            </span>
          </button>
        )),
        invites.length,
      )}
      {section(
        "archived",
        t("switcher.archived"),
        archived.map((team) =>
          row(
            team,
            t("switcher.archivedOn", { date: team.lifecycleAt ? format.day(team.lifecycleAt) : "" }),
            t("switcher.readOnly"),
          ),
        ),
      )}
      {empty ? <p className="px-2 py-3 text-sm text-fg-muted">{t("switcher.noMatch")}</p> : null}
      <div className="mt-1 flex flex-col gap-0.5 border-t border-line pt-2">
        <button
          type="button"
          data-switcher-row=""
          onClick={onAllTeams}
          className="flex min-h-10 items-center rounded-row px-2 text-start text-sm font-bold text-scope-deep transition-colors hover:bg-raised"
        >
          {t("switcher.all")}
        </button>
        <button
          type="button"
          data-switcher-row=""
          aria-haspopup="dialog"
          onClick={onNewTeam}
          className="flex min-h-10 items-center gap-2 rounded-row px-2 text-start text-sm font-semibold text-fg transition-colors hover:bg-raised"
        >
          <Icon icon={Plus} size={16} className="shrink-0" />
          {t("new")}
        </button>
      </div>
    </div>
  );
}
