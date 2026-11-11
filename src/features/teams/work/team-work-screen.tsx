"use client";

import { ArrowDownUp, CalendarDays, Filter, GitBranch, Kanban, List, Plus, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { CaseFlow } from "@/components/context/case-flow";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { RepositoryError } from "@/data/repositories";
import type { TeamTask, TeamTaskStatus } from "@/data/team-domain";
import { useTeamMembers, useTeamTaskActions, useTeamTasks, useTeamWeekPlan } from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { SourceChip, teamTaskHref } from "../source-chip";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";
import { TeamTaskAdd } from "./team-task-add";
import { TEAM_ROW_GRID, TeamStatusControl, TeamTaskRow, useAssignmentLine } from "./team-task-row";
import {
  boardColumns,
  buildFlowModel,
  groupTeamTasks,
  matchesWorkFilter,
  teamWorkFilters,
  teamWorkGroupings,
  workFilterCounts,
  type TeamWorkFilter,
  type TeamWorkGrouping,
} from "./work-model";

/*
 * TM-02 · Team work (/teams/[id]/work; ?view=board · ?view=flow). Two
 * sources: team tasks (indigo "Team" chip) plus, with "Include project
 * tasks" (default on), project tasks of members in projects the viewer can
 * open (blue chip, read-through: they open PJ-15 in their project). Fixed
 * team statuses (T4). Group by week plan (default) · status · person ·
 * source. Quick add (hidden for Viewers); ?add=task focuses it. Status
 * changes come with Undo. Flow = the shared CaseFlow over this week's plan.
 */

type WorkView = "list" | "board" | "flow";

export function TeamWorkScreen() {
  const t = useTranslations("TeamWork");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const format = useProjectFormat();
  const { team, capabilities, demo } = useTeam();
  const view: WorkView = search.get("view") === "board" ? "board" : search.get("view") === "flow" ? "flow" : "list";
  // ?filter=mine etc. (TM-04 "Open my tasks") sets the initial quick filter.
  const [filter, setFilter] = useState<TeamWorkFilter>(() => {
    const requested = search.get("filter");
    return (teamWorkFilters as readonly string[]).includes(requested ?? "") ? (requested as TeamWorkFilter) : "all";
  });
  const [grouping, setGrouping] = useState<TeamWorkGrouping>("plan");
  const [includeProjects, setIncludeProjects] = useState(true);
  const tasks = useTeamTasks(team.id, { includeProjects }, teamDemoAccessOptions(demo));
  const plan = useTeamWeekPlan(team.id);
  const members = useTeamMembers(team.id);
  const actions = useTeamTaskActions(team.id);
  const addRef = useRef<HTMLInputElement>(null);
  const assignmentLine = useAssignmentLine();
  const week = plan.data?.week ?? null;
  const canCreate = capabilities.createTask;

  // ?add=task (Overview "New task", the phone (+)): focus quick add once.
  const wantsAdd = search.get("add") === "task";
  // ?assignee=<id> (TM-08 "Assign a task"): quick add assigns that person unless the text names someone.
  const [assigneeId] = useState(() => search.get("assignee"));
  const defaultAssignee = members.data?.find((member) => member.person.id === assigneeId)?.person;
  useEffect(() => {
    if (wantsAdd && view === "list") addRef.current?.focus();
  }, [wantsAdd, view, tasks.data]);

  const setView = (next: WorkView) => {
    const params = new URLSearchParams(search.toString());
    if (next === "list") params.delete("view");
    else params.set("view", next);
    params.delete("add");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const move = (task: TeamTask, status: TeamTaskStatus) => {
    const previous = task.status;
    actions.setStatus.mutate(
      { taskId: task.id, status, revision: task.revision },
      {
        onSuccess: (saved) =>
          toast({
            title: t("moved", { title: task.title, status: t(`status.${status}`) }),
            action: {
              label: t("undo"),
              altText: t("undoAlt"),
              onClick: () => actions.setStatus.mutate({ taskId: saved.id, status: previous, revision: saved.revision }),
            },
          }),
        onError: (error) =>
          toast({ title: error instanceof RepositoryError && error.code === "conflict" ? t("conflict") : t("failed"), tone: "danger" }),
      },
    );
  };

  const newTask = () => {
    if (view !== "list") setView("list");
    requestAnimationFrame(() => addRef.current?.focus());
  };

  const header = (
    <TeamPageHeader
      module="work"
      title={t("title")}
      actions={
        <>
          <Segmented
            variant="accent"
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "list", label: <><Icon icon={List} size={16} />{t("view.list")}</> },
              { value: "board", label: <><Icon icon={Kanban} size={16} />{t("view.board")}</> },
              { value: "flow", label: <><Icon icon={GitBranch} size={16} />{t("view.flow")}</> },
            ]}
          />
          {canCreate ? (
            <Button size="lg" onClick={newTask} className="max-sm:hidden">
              <Icon icon={Plus} size={18} />
              {t("newTask")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (demo === "loading" || !tasks.data || !plan.data || !members.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const all = demo === "empty" ? [] : tasks.data;
  if (all.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          variant="card"
          size="default"
          titleAs="h2"
          title={t("empty.title")}
          description={t("empty.description")}
          primaryAction={
            canCreate ? (
              <Button onClick={newTask}>
                <Icon icon={Plus} size={18} />
                {t("newTask")}
              </Button>
            ) : undefined
          }
        />
        {canCreate ? (
          <TeamTaskAdd
            members={members.data.map((member) => member.person)}
            busy={actions.create.isPending}
            inputRef={addRef}
            defaultAssignee={defaultAssignee}
            onCreate={(input) => actions.create.mutate(input, { onSuccess: () => toast({ title: t("add.created") }) })}
          />
        ) : null}
      </>
    );
  }

  const counts = workFilterCounts(all, week);
  const visible = all.filter((task) => matchesWorkFilter(task, filter, week));
  const hrefOf = (task: TeamTask) => teamTaskHref(team.id, task);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <PillGroup
        label={t("filter.label")}
        value={filter}
        onValueChange={setFilter}
        className="max-sm:basis-full max-sm:overflow-x-auto"
        options={teamWorkFilters.map((value) => ({
          value,
          label: t(`filter.${value}`),
          count: value === "done" ? undefined : counts[value],
        }))}
      />
      <span className="flex-1" />
      <Switch label={t("includeProject")} checked={includeProjects} onCheckedChange={setIncludeProjects} />
      {view === "list" ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-2">
              <Icon icon={ArrowDownUp} size={16} />
              {t("group.button", { name: t(`group.${grouping}`) })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-scope="team">
            <DropdownMenuRadioGroup value={grouping} onValueChange={(value) => setGrouping(value as TeamWorkGrouping)}>
              {teamWorkGroupings.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {t(`group.${value}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );

  let body;
  if (view === "flow") {
    const model = buildFlowModel(
      all,
      members.data,
      week,
      (task) => {
        const line = assignmentLine(task);
        if (line) return line.text;
        return undefined;
      },
      hrefOf,
    );
    const labels = { todo: t("status.todo"), "in-progress": t("status.in-progress"), review: t("status.review") };
    body = (
      <CaseFlow
        scope="team"
        title={t("flow.title", { n: format.number(plan.data.weekNumber) })}
        people={model.people}
        columns={model.columns.map((column) => ({
          ...column,
          label: labels[column.status],
          moreHref: `${teamHref(team.id, "work")}`,
        }))}
        links={model.links}
        outcomes={model.outcomes.map((outcome) => ({
          ...outcome,
          meta: t("flow.meta", { name: outcome.who, day: format.day(outcome.completedAt.slice(0, 10), "weekdayShort") }),
        }))}
        outcomeLabel={t("flow.outcomes")}
        onPersonAction={() => {
          setFilter("unassigned");
          setView("list");
        }}
        footnote={t("flow.footnote")}
        actions={
          <>
            <IconButton icon={Filter} label={t("flow.filter")} variant="secondary" onClick={() => setView("list")} />
            <IconButton
              icon={Share2}
              label={t("flow.share")}
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href);
                toast({ title: t("flow.copied") });
              }}
            />
            <Link
              href={teamHref(team.id, "calendar")}
              aria-label={t("flow.calendar")}
              className="inline-flex size-11 items-center justify-center rounded-full bg-surface text-fg inset-ring inset-ring-line hover:bg-subtle"
            >
              <Icon icon={CalendarDays} size={18} />
            </Link>
          </>
        }
      />
    );
  } else if (view === "board") {
    body = (
      <section aria-label={t("board.label")} className="grid gap-3 overflow-x-auto max-lg:grid-flow-col max-lg:auto-cols-[85%] lg:grid-cols-5">
        {boardColumns.map((status) => {
          const items = visible.filter((task) => task.status === status);
          return (
            <div key={status} className="flex min-w-0 flex-col gap-2 rounded-card-sm bg-subtle p-3">
              <h2 className="flex items-center justify-between px-1 text-sm font-bold text-fg">
                {t(`status.${status}`)}
                <span className="text-xs font-semibold text-fg-secondary tabular">{format.number(items.length)}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((task) => (
                  <li key={task.id} className="flex flex-col gap-2 rounded-row bg-surface p-3">
                    <Link href={hrefOf(task)} className="text-sm font-semibold text-fg hover:underline">
                      <bdi>{task.title}</bdi>
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SourceChip source={task.source} />
                      {task.due ? <span className="text-xs text-fg-secondary">{format.day(task.due)}</span> : null}
                    </div>
                    {task.source.kind === "project" ? (
                      <span className="text-xs text-fg-muted">{t("board.readOnly")}</span>
                    ) : task.can.status ? (
                      <TeamStatusControl task={task} onStatus={(next) => move(task, next)} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    );
  } else {
    const groups = groupTeamTasks(visible, grouping, week);
    const groupTitle = (group: (typeof groups)[number]) => {
      if (group.kind === "plan") return t("inPlan");
      if (group.kind === "unplanned") return t("notPlanned");
      if (group.kind === "status") return t(`status.${group.status!}`);
      if (group.kind === "nobody") return t("group.nobody");
      if (group.kind === "team") return t("source.team");
      return group.name ?? "";
    };
    body = (
      <UtilityCard className="flex flex-col gap-1 p-2 lg:p-3">
        <div
          aria-hidden="true"
          className={cn("grid items-center gap-x-3 px-2 pb-1 text-xs font-semibold text-fg-secondary max-lg:hidden", TEAM_ROW_GRID)}
        >
          <span />
          <span>{t("columns.task")}</span>
          <span>{t("columns.source")}</span>
          <span>{t("columns.status")}</span>
          <span>{t("columns.who")}</span>
          <span>{t("columns.due")}</span>
          <span>{t("columns.est")}</span>
          <span>{t("columns.priority")}</span>
        </div>
        {visible.length === 0 ? <p className="px-2 py-6 text-sm text-fg-muted">{t("filtered")}</p> : null}
        {groups.map((group) => (
          <section key={group.key} aria-label={groupTitle(group)} className="flex flex-col gap-1">
            <h2 className="px-2 pt-3 pb-1 text-xs font-semibold text-fg-secondary">
              <bdi>{groupTitle(group)}</bdi> · {format.number(group.tasks.length)}
            </h2>
            <ul className="flex flex-col gap-1">
              {group.tasks.map((task) => (
                <TeamTaskRow key={`${group.key}-${task.id}`} teamId={team.id} task={task} onStatus={(status) => move(task, status)} />
              ))}
            </ul>
          </section>
        ))}
        {canCreate ? (
          <div className="pt-2">
            <TeamTaskAdd
              members={members.data.map((member) => member.person)}
              busy={actions.create.isPending}
              inputRef={addRef}
              defaultAssignee={defaultAssignee}
              onCreate={(input) =>
                actions.create.mutate(input, {
                  onSuccess: (task) =>
                    toast({
                      title: t("add.created"),
                      action: { label: t("add.undo"), altText: t("add.undoAlt"), onClick: () => actions.remove.mutate(task.id) },
                    }),
                  onError: () => toast({ title: t("add.failed"), tone: "danger" }),
                })
              }
            />
          </div>
        ) : null}
      </UtilityCard>
    );
  }

  return (
    <>
      {header}
      {view === "flow" ? null : toolbar}
      {body}
    </>
  );
}
