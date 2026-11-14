"use client";

import { Archive, ArrowDownUp, LayoutGrid, List, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { ErrorState, NoResultsState } from "@/components/feedback/state-views";
import { Breadcrumbs } from "@/components/navigation/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { RepositoryError } from "@/data/repositories";
import type { ProjectFilter, ProjectInvitation, ProjectSummary } from "@/data/project-domain";
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useMyInvitations,
  useProjectDirectory,
  useRestoreProject,
} from "@/data/project-queries";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { DemoStateSwitch } from "../demo-state-switch";
import { parseProjectDemoState } from "../demo-state";
import { useProjectFormat } from "../format";
import { useOpenProjectSheet } from "../sheets/project-sheet-params";
import { InvitationStrip } from "./invitation-strip";
import { ProjectCard } from "./project-card";
import { ProjectListTable } from "./project-list-table";

/*
 * PJ-00 · All projects (/projects). A directory, not a dashboard: find the
 * project you need and act on invitations. Pills = local filter with server
 * counts; Grid/List = view mode (segmented); sort Recently active · Name ·
 * Due date · Progress. States: loading, empty first use, empty filtered,
 * error, archived tab (Restore for Owner/Admin, View otherwise). No quota and
 * no Team/Company association anywhere. Mock mode: `?state=` forces a state.
 */

export type ProjectSort = "recent" | "name" | "due" | "progress";
type ProjectView = "grid" | "list";

const FILTERS: readonly ProjectFilter[] = ["all", "owned", "member", "invitations", "archived"];
const FILTER_KEY: Record<ProjectFilter, "all" | "owned" | "member" | "invites" | "archived"> = {
  all: "all",
  owned: "owned",
  member: "member",
  invitations: "invites",
  archived: "archived",
};

function matchesFilter(project: ProjectSummary, filter: ProjectFilter): boolean {
  const archived = project.lifecycle === "archived";
  if (filter === "archived") return archived;
  if (archived) return false;
  if (filter === "owned") return project.role === "owner";
  if (filter === "member") return project.role !== "owner";
  return filter === "all";
}

function sortProjects(projects: ProjectSummary[], sort: ProjectSort, locale: string): ProjectSummary[] {
  const byName = (a: ProjectSummary, b: ProjectSummary) => a.name.localeCompare(b.name, locale);
  return [...projects].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    if (sort === "progress") return b.progress.percent - a.progress.percent || byName(a, b);
    if (sort === "due") {
      // Undeclared dates sort last.
      const due = (project: ProjectSummary) => project.nextMilestone?.due ?? project.endDate ?? "9999-12-31";
      return due(a).localeCompare(due(b)) || byName(a, b);
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export function AllProjectsScreen() {
  const t = useTranslations("Projects");
  const router = useRouter();
  const demo = parseProjectDemoState(useSearchParams().get("state"));
  const format = useProjectFormat();
  const directory = useProjectDirectory();
  const invitations = useMyInvitations();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const openSheet = useOpenProjectSheet();
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [view, setView] = useState<ProjectView>("grid");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [query, setQuery] = useState("");

  const newProject = () => openSheet("project-new");
  const header = (
    <PageHeader
      breadcrumb={<Breadcrumbs scope="project" items={[{ label: t("title") }]} />}
      title={
        <>
          <span className="max-lg:hidden">{t("title")}</span>
          <span className="lg:hidden">{t("mobileTitle")}</span>
        </>
      }
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
          <Button size="lg" onClick={newProject} aria-haspopup="dialog">
            <Icon icon={Plus} size={18} />
            {t("new")}
          </Button>
        </>
      }
    />
  );

  const shell = (body: ReactNode) => (
    <div data-scope="project" className="flex min-w-0 flex-col gap-4">
      {header}
      {body}
      <DemoStateSwitch value={demo} />
    </div>
  );

  if (demo === "loading" || directory.isPending || invitations.isPending) {
    return shell(
      <AccessLoading onRetry={() => void directory.refetch()}>
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-11 w-full max-w-xl rounded-pill" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-56 rounded-product" />
          <Skeleton className="h-56 rounded-product" />
          <Skeleton className="h-56 rounded-product" />
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

  const pending: readonly ProjectInvitation[] = demo === "empty" ? [] : (invitations.data ?? []);
  const all = demo === "empty" ? [] : directory.data.projects;
  if (all.length === 0 && pending.length === 0) {
    return shell(
      <AccessState
        kind="empty"
        titleAs="h2"
        primaryAction={
          <Button onClick={newProject} aria-haspopup="dialog">
            {t("empty.action")}
          </Button>
        }
      />,
    );
  }

  const counts = { ...directory.data.counts, invitations: pending.length };
  const needle = demo === "filtered" ? "\u0000" : query.trim().toLocaleLowerCase();
  const visible = sortProjects(
    all.filter((project) => matchesFilter(project, filter) && project.name.toLocaleLowerCase().includes(needle)),
    sort,
    format.locale,
  );
  const shownInvites =
    filter === "all" || filter === "invitations"
      ? pending.filter((invitation) => (invitation.projectName ?? "").toLocaleLowerCase().includes(needle))
      : [];
  const busy = accept.isPending || decline.isPending;
  const clearFilters = () => {
    setFilter("all");
    setQuery("");
    if (demo === "filtered") router.replace("/projects");
  };

  const strips = shownInvites.map((invitation) => (
    <InvitationStrip
      key={invitation.id}
      invitation={invitation}
      busy={busy}
      onAccept={() =>
        accept.mutate(invitation.id, { onSuccess: ({ projectId }) => router.push(projectHref(projectId)) })
      }
      onDecline={(note) =>
        decline.mutate(
          { id: invitation.id, note: note || undefined },
          {
            onSuccess: () => toast({ title: t("invite.declined") }),
            onError: (cause) =>
              toast({
                title: t(
                  cause instanceof RepositoryError && cause.message === "decline-note"
                    ? "invite.noteUnavailable"
                    : "invite.declineFailed",
                ),
              }),
          },
        )
      }
    />
  ));

  let content: ReactNode;
  if (filter === "invitations") {
    content = strips.length > 0 ? null : <p className="px-1 text-sm text-fg-muted">{t("noInvites")}</p>;
  } else if (visible.length === 0) {
    content = (
      <NoResultsState
        variant="card"
        title={t("filtered.title")}
        description={t("filtered.description")}
        primaryAction={
          <Button variant="secondary" onClick={clearFilters}>
            {t("filtered.clear")}
          </Button>
        }
      />
    );
  } else if (filter === "archived") {
    content = <ArchivedList projects={visible} />;
  } else if (view === "list") {
    content = <ProjectListTable projects={visible} />;
  } else {
    content = (
      <ul key={`${filter}-${sort}`} className="grid gap-4 motion-safe:animate-overlay-in sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((project) => (
          <li key={project.id} className="flex">
            <div className="flex w-full">
              <ProjectCard project={project} />
            </div>
          </li>
        ))}
        <li className="flex max-sm:hidden">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={newProject}
            className="flex min-h-56 w-full flex-col items-center justify-center gap-2 rounded-product border-2 border-dashed border-line-strong text-center transition-colors hover:bg-subtle"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-11 items-center justify-center rounded-full bg-scope-soft text-scope-deep"
            >
              <Icon icon={Plus} size={20} />
            </span>
            <span className="text-sm font-bold text-fg">{t("newCard.title")}</span>
            <span className="text-xs font-medium text-fg-secondary">{t("newCard.hint")}</span>
          </button>
        </li>
      </ul>
    );
  }

  return shell(
    <>
      <div className="flex flex-wrap items-center gap-2">
        <PillGroup
          label={t("filter.label")}
          value={filter}
          onValueChange={setFilter}
          options={FILTERS.map((value) => ({ value, label: t(`filter.${FILTER_KEY[value]}`), count: counts[value] }))}
        />
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder={t("search")}
          aria-label={t("search")}
          className="min-w-48 flex-1 max-sm:order-last max-sm:basis-full"
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-2 max-sm:hidden">
              <Icon icon={ArrowDownUp} size={16} />
              <span className="sr-only">{t("sort.label")}:</span>
              {t(`sort.${sort}`)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-scope="project">
            <DropdownMenuRadioGroup value={sort} onValueChange={(value) => setSort(value as ProjectSort)}>
              {(["recent", "name", "due", "progress"] as const).map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {t(`sort.${value}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {strips.length > 0 ? <div className="flex flex-col gap-2">{strips}</div> : null}
      {content}
    </>,
  );
}

/** Archived tab: read-only rows; Restore for Owner/Admin (server flag), View for everyone else. */
function ArchivedList({ projects }: { projects: readonly ProjectSummary[] }) {
  const t = useTranslations("Projects.archived");
  const format = useProjectFormat();
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {projects.map((project) => (
          <ArchivedRow
            key={project.id}
            project={project}
            date={project.lifecycleAt ? format.day(project.lifecycleAt) : ""}
          />
        ))}
      </ul>
      <p className="px-1 text-xs font-medium text-fg-muted">{t("hint")}</p>
    </div>
  );
}

function ArchivedRow({ project, date }: { project: ProjectSummary; date: string }) {
  const t = useTranslations("Projects.archived");
  const restore = useRestoreProject(project.id);
  return (
    <li className="flex items-center gap-3 rounded-row bg-surface px-4 py-3">
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-raised text-fg-secondary"
      >
        <Icon icon={Archive} size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-snug">
        <bdi className="truncate text-sm font-bold text-fg">{project.name}</bdi>
        <span className="truncate text-xs font-medium text-fg-secondary">{t("line", { date })}</span>
      </div>
      {project.restorable ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={restore.isPending}
          onClick={() =>
            restore.mutate(undefined, { onSuccess: () => toast({ title: t("restored", { project: project.name }) }) })
          }
        >
          {t("restore")}
        </Button>
      ) : (
        <Link href={projectHref(project.id)} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
          {t("view")}
        </Link>
      )}
    </li>
  );
}
