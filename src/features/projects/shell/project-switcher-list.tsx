"use client";

import { Check, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type { ProjectDirectory, ProjectInvitation, ProjectSummary } from "@/data/project-domain";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProjectLabels } from "../labels";

/*
 * The Projects workspace list inside the context switcher (SH01 "Switcher &
 * workspaces"): Find a project · Recent (max 3) · Owned by you · Member of ·
 * Invitations (public-safe preview) · Archived (read-only) · All projects ·
 * New project. Section counts are the server counts. Choosing an entry goes
 * to its canonical route (the URL is the source of truth).
 */

const RECENT_MAX = 3;

export interface ProjectSwitcherListProps {
  directory: ProjectDirectory | undefined;
  invitations: readonly ProjectInvitation[];
  activeProjectId?: string;
  /** Opens /projects/[id] (projects, invitations and archived alike). */
  onOpen: (projectId: string) => void;
  onAllProjects: () => void;
  onNewProject: () => void;
}

export function ProjectSwitcherList({
  directory,
  invitations,
  activeProjectId,
  onOpen,
  onAllProjects,
  onNewProject,
}: ProjectSwitcherListProps) {
  const t = useTranslations("ContextShell.switcher");
  const labels = useProjectLabels();
  const format = useProjectFormat();
  const [query, setQuery] = useState("");
  const searchId = useId();
  const needle = query.trim().toLocaleLowerCase();
  const matches = (name: string) => needle === "" || name.toLocaleLowerCase().includes(needle);

  const projects = (directory?.projects ?? []).filter((project) => matches(project.name));
  const live = projects.filter((project) => project.lifecycle !== "archived");
  const recentIds = (directory?.recentIds ?? []).slice(0, RECENT_MAX);
  const recent = recentIds.map((id) => live.find((project) => project.id === id)).filter((p) => p !== undefined);
  const rest = live.filter((project) => !recentIds.includes(project.id));
  const owned = rest.filter((project) => project.role === "owner");
  const member = rest.filter((project) => project.role !== "owner");
  const archived = projects.filter((project) => project.lifecycle === "archived");
  const invites = invitations.filter((invitation) => invitation.projectId !== null && matches(invitation.projectName ?? ""));
  const counts = directory?.counts;

  const row = (project: ProjectSummary, line: string, tag?: string) => {
    const selected = project.id === activeProjectId;
    return (
      <button
        key={project.id}
        type="button"
        data-switcher-row=""
        aria-current={selected ? "true" : undefined}
        onClick={() => onOpen(project.id)}
        className={cn(
          "flex min-h-touch items-center gap-2.5 rounded-row px-2 py-1.5 text-start transition-colors",
          selected ? "bg-scope-soft text-scope-deep" : "text-fg hover:bg-raised",
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-tile bg-scope-soft text-[0.6875rem] font-bold text-scope-deep"
        >
          <bdi>{project.initials}</bdi>
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-snug">
          <bdi className={cn("truncate text-sm", selected ? "font-bold" : "font-semibold")}>{project.name}</bdi>
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

  const statusLine = (project: ProjectSummary) =>
    `${labels.role(project.role)} · ${project.lifecycle === "paused" ? labels.lifecycle("paused") : labels.health(project.health)}`;

  const section = (key: string, title: string, children: ReactNode[], count?: number) =>
    children.length > 0 ? (
      <div key={key} role="group" aria-label={title} className="flex flex-col gap-0.5 pt-2">
        <p aria-hidden="true" className="px-2 pb-0.5 text-[0.6875rem] font-bold tracking-wide text-fg-muted uppercase">
          {count === undefined ? title : `${title} · ${format.number(count)}`}
        </p>
        {children}
      </div>
    ) : null;

  const empty = recent.length + owned.length + member.length + invites.length + archived.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={searchId} className="sr-only">
        {t("find")}
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
          placeholder={t("find")}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      {section(
        "recent",
        t("recent"),
        recent.map((project) => row(project, statusLine(project))),
      )}
      {section(
        "owned",
        t("owned"),
        owned.map((project) => row(project, statusLine(project))),
        counts?.owned,
      )}
      {section(
        "member",
        t("member"),
        member.map((project) => row(project, statusLine(project))),
        counts?.member,
      )}
      {section(
        "invitations",
        t("invitations"),
        invites.map((invitation) => (
          <button
            key={invitation.id}
            type="button"
            data-switcher-row=""
            onClick={() => onOpen(invitation.projectId!)}
            className="flex min-h-touch items-center gap-2.5 rounded-row px-2 py-1.5 text-start text-fg transition-colors hover:bg-raised"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-tile border border-dashed border-line-strong text-fg-muted"
            >
              <Icon icon={Plus} size={14} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-snug">
              <bdi className="truncate text-sm font-semibold">{invitation.projectName ?? ""}</bdi>
              {invitation.inviter && invitation.role ? (
                <span className="truncate text-xs font-medium text-fg-secondary">
                  {t("invitedBy", {
                    name: invitation.inviter.name,
                    role: labels.role(invitation.role),
                  })}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">
              {t("review")}
            </span>
          </button>
        )),
        counts?.invitations,
      )}
      {section(
        "archived",
        t("archived"),
        archived.map((project) =>
          row(
            project,
            t("archivedOn", {
              date: project.lifecycleAt ? format.day(project.lifecycleAt) : "",
            }),
            t("readOnly"),
          ),
        ),
      )}
      {empty ? <p className="px-2 py-3 text-sm text-fg-muted">{t("noMatch")}</p> : null}
      <div className="mt-1 flex flex-col gap-0.5 border-t border-line pt-2">
        <button
          type="button"
          data-switcher-row=""
          onClick={onAllProjects}
          className="flex min-h-10 items-center rounded-row px-2 text-start text-sm font-bold text-scope-deep transition-colors hover:bg-raised"
        >
          {t("allProjects")}
        </button>
        <button
          type="button"
          data-switcher-row=""
          aria-haspopup="dialog"
          onClick={onNewProject}
          className="flex min-h-10 items-center gap-2 rounded-row px-2 text-start text-sm font-semibold text-fg transition-colors hover:bg-raised"
        >
          <Icon icon={Plus} size={16} className="shrink-0" />
          {t("newProject")}
        </button>
      </div>
    </div>
  );
}
