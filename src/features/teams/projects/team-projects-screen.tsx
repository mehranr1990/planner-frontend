"use client";

import { FolderKanban, Link2, Plus, Unlink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { getPlannerToday } from "@/data/clock";
import { useProjectDirectory } from "@/data/project-queries";
import type { TeamPortfolioProject } from "@/data/team-domain";
import { useProjectAssociationActions, useTeamLinkRequests, useTeamProjects } from "@/data/team-queries";
import { projectHref } from "@/features/navigation/contexts";
import { daysBetween, useProjectFormat } from "@/features/projects/format";
import { ProjectStatusChip, ProjectTile } from "@/features/projects/project-visuals";
import { cn } from "@/lib/cn";
import { useOpenTeamSheet } from "../sheets/team-sheet-params";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";

/*
 * TM-06 · Team projects (/teams/[id]/projects): the portfolio of projects
 * the viewer can open — Team-owned or Linked — as a table (status set in the
 * project, progress, next milestone, team people involved, open high risks,
 * your role, relation; a row opens /projects/[id]) or a read-only timeline
 * with a now line. Only visible projects: no hidden count, ever. Link a
 * project (team Owner/Admin; the project owner approves; linking never
 * grants access), New team project (Lead+) → ?sheet=project-new owned by
 * the team, Unlink (never deletes the project or changes its members).
 */

type View = "table" | "timeline";
type Filter = "all" | "owned" | "linked" | "risk";
const FILTERS: readonly Filter[] = ["all", "owned", "linked", "risk"];

const matches = (project: TeamPortfolioProject, filter: Filter) =>
  filter === "all" ||
  (filter === "owned" && project.relation === "owned") ||
  (filter === "linked" && project.relation === "linked") ||
  (filter === "risk" && project.health !== "on-track" && project.lifecycle === "active");

export function TeamProjectsScreen() {
  const t = useTranslations("TeamProjects");
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const projects = useTeamProjects(team.id);
  const requests = useTeamLinkRequests(team.id);
  const openSheet = useOpenTeamSheet();
  const [view, setView] = useState<View>("table");
  const [filter, setFilter] = useState<Filter>("all");
  const [linking, setLinking] = useState(false);

  const header = (
    <TeamPageHeader
      module="projects"
      title={t("title")}
      actions={
        <>
          <Segmented<View>
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "table", label: t("view.table") },
              { value: "timeline", label: t("view.timeline") },
            ]}
          />
          {capabilities.linkProjects ? (
            <Button variant="secondary" className="gap-2" onClick={() => setLinking(true)}>
              <Icon icon={Link2} size={16} />
              {t("link")}
            </Button>
          ) : null}
          {capabilities.createProject ? (
            <Button className="gap-2" onClick={() => openSheet("project-new")}>
              <Icon icon={Plus} size={16} />
              {t("new")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (projects.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void projects.refetch()} />
      </>
    );
  }
  if (!projects.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const list = projects.data;
  const counts = Object.fromEntries(
    FILTERS.map((key) => [key, list.filter((project) => matches(project, key)).length]),
  ) as Record<Filter, number>;
  const shown = list.filter((project) => matches(project, filter));

  return (
    <>
      {header}
      {requests.data && requests.data.length > 0 ? (
        <ProductCard as="section" aria-labelledby="link-requests" padding="compact" className="gap-2">
          <h2 id="link-requests" className="text-sm font-bold text-fg">
            {t("requests.title")}
          </h2>
          <ul className="flex flex-col gap-1.5" data-scope="project">
            {requests.data.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-row bg-subtle px-3 py-2"
              >
                <bdi className="text-sm font-bold text-fg">{request.projectName}</bdi>
                <span className="text-xs text-fg-secondary">
                  {t("requests.pending", { date: format.day(request.requestedAt.slice(0, 10)) })}
                </span>
              </li>
            ))}
          </ul>
        </ProductCard>
      ) : null}
      {list.length === 0 ? (
        <EmptyState icon={FolderKanban} title={t("empty.title")} description={t("empty.body")} />
      ) : view === "table" ? (
        <ProductCard as="section" aria-label={t("title")} className="gap-3">
          <div role="group" aria-label={t("filter.label")} className="flex flex-wrap gap-1.5">
            {FILTERS.map((key) => (
              <ToggleChip
                key={key}
                scope="team"
                size="sm"
                selected={filter === key}
                onSelectedChange={() => setFilter(key)}
              >
                {t(`filter.${key}`, { n: format.number(counts[key]) })}
              </ToggleChip>
            ))}
          </div>
          {shown.length ? (
            <PortfolioTable projects={shown} canUnlink={capabilities.linkProjects} />
          ) : (
            <p className="text-sm text-fg-muted">{t("filtered")}</p>
          )}
        </ProductCard>
      ) : (
        <PortfolioTimeline projects={list} />
      )}
      <LinkProjectDialog open={linking} onOpenChange={setLinking} linkedIds={list.map((project) => project.id)} />
    </>
  );
}

function PortfolioTable({ projects, canUnlink }: { projects: readonly TeamPortfolioProject[]; canUnlink: boolean }) {
  const t = useTranslations("TeamProjects");
  const tRoles = useTranslations("ContextShell.roles");
  const format = useProjectFormat();
  const [unlinking, setUnlinking] = useState<TeamPortfolioProject | null>(null);
  const grid = "lg:grid-cols-[minmax(12rem,1.6fr)_7rem_minmax(8rem,1fr)_minmax(8rem,1fr)_5rem_3.5rem_5.5rem_7.5rem]";
  return (
    <div data-scope="project" className="flex flex-col gap-1.5">
      <div aria-hidden className={cn("hidden gap-3 px-3 text-xs font-semibold text-fg-secondary lg:grid", grid)}>
        <span>{t("columns.project")}</span>
        <span>{t("columns.status")}</span>
        <span>{t("columns.progress")}</span>
        <span>{t("columns.milestone")}</span>
        <span>{t("columns.people")}</span>
        <span>{t("columns.risks")}</span>
        <span>{t("columns.role")}</span>
        <span>{t("columns.relation")}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {projects.map((project) => (
          <li
            key={project.id}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-row bg-subtle px-3 py-3 lg:grid",
              grid,
            )}
          >
            <Link
              href={projectHref(project.id)}
              className="flex min-w-0 items-center gap-3 font-bold text-fg hover:underline"
            >
              <ProjectTile initials={project.initials} tint={project.tint} size="sm" />
              <bdi className="truncate text-sm">{project.name}</bdi>
            </Link>
            <ProjectStatusChip health={project.health} lifecycle={project.lifecycle} />
            <span className="col-span-2 flex items-center gap-2 lg:col-span-1">
              <Progress
                value={project.percent}
                size="sm"
                className="min-w-0 flex-1"
                label={t("progress", { project: project.name })}
                valueText={format.percent(project.percent)}
              />
              <span className="w-10 shrink-0 text-end text-xs font-semibold tabular">
                {format.percent(project.percent)}
              </span>
            </span>
            <span className="text-xs font-semibold text-fg max-lg:col-span-2">
              {project.nextMilestone ? (
                <bdi>
                  {t("milestone", { title: project.nextMilestone.title, date: format.day(project.nextMilestone.due) })}
                </bdi>
              ) : (
                t("none")
              )}
            </span>
            <span
              className="flex [&>*+*]:-ms-1.5"
              aria-label={
                project.teamPeople.length ? project.teamPeople.map((person) => person.name).join(", ") : t("noPeople")
              }
            >
              {project.teamPeople.slice(0, 3).map((person) => (
                <span
                  key={person.id}
                  aria-hidden
                  title={person.name}
                  className="grid size-6 place-items-center rounded-full bg-team-soft text-[9px] font-bold text-team-deep inset-ring-2 inset-ring-surface"
                >
                  {person.initials}
                </span>
              ))}
              {project.teamPeople.length === 0 ? (
                <span aria-hidden className="text-xs">
                  {t("none")}
                </span>
              ) : null}
            </span>
            <span className={cn("text-xs font-bold", project.openHighRisks ? "text-danger-text" : "text-fg-secondary")}>
              {project.openHighRisks ? (
                <span aria-label={t("risks", { n: format.number(project.openHighRisks) })}>
                  {format.number(project.openHighRisks)}
                </span>
              ) : (
                t("none")
              )}
            </span>
            <span className="text-xs font-semibold text-fg">{tRoles(project.role)}</span>
            <span className="flex items-center gap-1">
              <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-bold text-fg inset-ring inset-ring-outline">
                {t(project.relation === "owned" ? "owned" : "linked")}
              </span>
              {canUnlink && project.relation === "linked" ? (
                <IconButton
                  icon={Unlink}
                  size="sm"
                  variant="ghost"
                  label={t("unlink.action", { project: project.name })}
                  onClick={() => setUnlinking(project)}
                />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <UnlinkDialog project={unlinking} onClose={() => setUnlinking(null)} />
    </div>
  );
}

function UnlinkDialog({ project, onClose }: { project: TeamPortfolioProject | null; onClose: () => void }) {
  const t = useTranslations("TeamProjects.unlink");
  const tLink = useTranslations("TeamProjects.linkDialog");
  const { team } = useTeam();
  const { unlink } = useProjectAssociationActions(team.id);
  const [error, setError] = useState(false);
  if (!project) return null;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setError(false);
          onClose();
        }
      }}
      tone="destructive"
      title={t("title", { project: project.name })}
      description={t("body")}
      confirmLabel={t("confirm")}
      cancelLabel={t("cancel")}
      error={error ? tLink("failed") : undefined}
      onConfirm={() =>
        unlink.mutateAsync(project.id).then(
          () => {
            toast({ title: t("done", { project: project.name }) });
            onClose();
          },
          (cause: unknown) => {
            setError(true);
            throw cause;
          },
        )
      }
    />
  );
}

/** Read-only bars with a now line; positioned with logical insets, so RTL mirrors by coordinates. */
function PortfolioTimeline({ projects }: { projects: readonly TeamPortfolioProject[] }) {
  const t = useTranslations("TeamProjects.timeline");
  const format = useProjectFormat();
  const today = getPlannerToday();
  const from = projects.reduce((min, project) => (project.startDate < min ? project.startDate : min), today);
  const to = projects.reduce((max, project) => (project.endDate > max ? project.endDate : max), today);
  const span = Math.max(1, daysBetween(from, to));
  const at = (day: string) => (daysBetween(from, day) / span) * 100;
  return (
    <ProductCard as="section" aria-labelledby="portfolio-timeline" className="gap-3" data-scope="project">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="portfolio-timeline" className="type-title text-fg">
          {t("title")}
        </h2>
        <span className="text-xs font-medium text-fg-secondary">{format.range(from, to)}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {projects.map((project) => (
          <li key={project.id} className="grid grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)] items-center gap-3">
            <Link href={projectHref(project.id)} className="truncate text-xs font-bold text-fg hover:underline">
              <bdi>{project.name}</bdi>
            </Link>
            <div className="relative h-5 rounded-pill bg-subtle">
              <span
                role="img"
                aria-label={t("bar", {
                  project: project.name,
                  range: format.range(project.startDate, project.endDate),
                })}
                className={cn(
                  "absolute inset-y-0 rounded-pill",
                  project.lifecycle === "active" ? "bg-scope-dot" : "bg-raised",
                )}
                style={{
                  insetInlineStart: `${at(project.startDate)}%`,
                  width: `${Math.max(1, at(project.endDate) - at(project.startDate))}%`,
                }}
              />
              <span
                aria-hidden
                className="absolute -inset-y-1 w-0.5 bg-team-deep"
                style={{ insetInlineStart: `${at(today)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-secondary">
        <span aria-hidden className="me-1.5 inline-block h-3 w-0.5 bg-team-deep align-middle" />
        {t("now")}
      </p>
    </ProductCard>
  );
}

function LinkProjectDialog({
  open,
  onOpenChange,
  linkedIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedIds: readonly string[];
}) {
  const t = useTranslations("TeamProjects");
  const { team } = useTeam();
  const directory = useProjectDirectory();
  const requests = useTeamLinkRequests(team.id);
  const { request } = useProjectAssociationActions(team.id);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const candidates = useMemo(() => {
    const pending = new Set((requests.data ?? []).map((item) => item.projectId));
    const needle = query.trim().toLocaleLowerCase();
    return (directory.data?.projects ?? []).filter(
      (project) =>
        (project.role === "owner" || project.role === "admin") &&
        project.lifecycle !== "archived" &&
        !linkedIds.includes(project.id) &&
        !pending.has(project.id) &&
        (!needle || project.name.toLocaleLowerCase().includes(needle)),
    );
  }, [directory.data, requests.data, linkedIds, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("link")} description={t("linkDialog.body")}>
        <p className="text-sm font-bold text-fg">{t("linkNote")}</p>
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder={t("linkDialog.search")}
          aria-label={t("linkDialog.search")}
        />
        {candidates.length ? (
          <ul
            role="radiogroup"
            aria-label={t("link")}
            className="flex max-h-60 flex-col gap-1.5 overflow-y-auto"
            data-scope="project"
          >
            {candidates.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked === project.id}
                  onClick={() => setPicked(project.id)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-row px-3 text-start text-sm font-bold text-fg focus-visible:focus-ring",
                    picked === project.id
                      ? "bg-scope-soft inset-ring-2 inset-ring-scope-deep"
                      : "bg-subtle hover:bg-raised",
                  )}
                >
                  <ProjectTile initials={project.initials} tint={project.tint} size="sm" />
                  <bdi className="truncate">{project.name}</bdi>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t("linkDialog.empty")}</p>
        )}
        {failed ? <InlineAlert tone="danger" title={t("linkDialog.failed")} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("linkDialog.cancel")}
          </Button>
          <Button
            disabled={!picked || request.isPending}
            onClick={() => {
              if (!picked) return;
              setFailed(false);
              request.mutate(picked, {
                onSuccess: () => {
                  toast({ title: t("linkDialog.sent") });
                  setPicked(null);
                  onOpenChange(false);
                },
                onError: () => setFailed(true),
              });
            }}
          >
            {t("linkDialog.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
