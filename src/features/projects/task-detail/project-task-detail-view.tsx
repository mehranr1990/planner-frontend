"use client";

import {
  CalendarDays,
  CalendarRange,
  Check,
  CircleCheck,
  Clock,
  Flag,
  Layers,
  Link2,
  ListPlus,
  SlidersHorizontal,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants, IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { DependencyType, ProjectTaskDetail, ProjectWorkflow } from "@/data/project-domain";
import {
  useProjectMilestones,
  useProjectPhases,
  useProjectTaskActions,
  useProjectTaskDetail,
  useProjectTasks,
  useProjectWorkflow,
  useTaskDetailActions,
} from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { projectHref } from "@/features/navigation/contexts";
import { priorityStyle } from "@/features/tasks/ui/priority-style";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { useWorkflowStatusLabel, WorkflowStatusChip } from "../workflow-status-chip";
import { AssignmentBlock } from "./assignment-block";

/*
 * PJ-15 · Project task detail — same container as Personal P06 (drawer on
 * soft navigation, full page on hard load, full screen on phones). Head =
 * the screen's signature card; notch = Mark done (moves to the workflow's
 * done status when allowed, else disabled with the reason) or Copy link for
 * roles that cannot change status (never empty). AssignmentBlock for the
 * pending assignee / managers. Properties, then FolderTabs Comments ·
 * Subtasks · Links · Activity. Adding a dependency that would loop shows
 * "This would create a loop". The assignee's personal notes and time blocks
 * are never shown here.
 */

export interface ProjectTaskDetailViewProps {
  taskId: string;
  variant: "drawer" | "page";
  /** Drawer close (X on desktop, back arrow on phones). */
  closeControl?: ReactNode;
}

export function ProjectTaskDetailView({ taskId, variant, closeControl }: ProjectTaskDetailViewProps) {
  const t = useTranslations("ProjectTask");
  const tDeleted = useTranslations("Access.states.deleted");
  const { project, capabilities, demo } = useProject();
  const detail = useProjectTaskDetail(project.id, taskId, demoAccessOptions(demo));
  const workflow = useProjectWorkflow(project.id);
  const phases = useProjectPhases(project.id);
  const milestones = useProjectMilestones(project.id);

  if (detail.isError) {
    return (
      <AccessState
        kind="deleted"
        titleAs={variant === "page" ? "h1" : "h2"}
        primaryAction={
          <Link href={projectHref(project.id, "tasks")} className={buttonVariants()}>
            {tDeleted("action")}
          </Link>
        }
      />
    );
  }
  if (!detail.data || !workflow.data || !phases.data || !milestones.data) return <AccessLoading />;

  const data = detail.data;
  const task = data.task;
  const phase = phases.data.find((candidate) => candidate.id === task.phaseId);
  const milestone = milestones.data.find((candidate) => candidate.id === task.milestoneId);
  return (
    <article className="flex flex-col gap-3" data-scope="project">
      <DetailHead
        data={data}
        workflow={workflow.data}
        phaseName={phase?.name ?? ""}
        milestoneTitle={milestone?.title}
        closeControl={closeControl}
        headingLevel={variant === "page" ? "h1" : "h2"}
      />
      {project.role === "viewer" ? <InlineAlert tone="info" title={t("viewer")} /> : null}
      <AssignmentBlock task={task} capabilities={capabilities} assignedAt={detailAssignedAt(data)} />
      <Properties
        data={data}
        workflow={workflow.data}
        phaseName={phase?.name ?? ""}
        milestoneTitle={milestone?.title}
      />
      <DetailTabs data={data} workflow={workflow.data} />
    </article>
  );
}

function detailAssignedAt(data: ProjectTaskDetail): string | null {
  const assigned = data.activity.find((item) => item.kind === "assigned");
  return assigned?.at ?? null;
}

function DetailHead({
  data,
  workflow,
  phaseName,
  milestoneTitle,
  closeControl,
  headingLevel: Heading,
}: {
  data: ProjectTaskDetail;
  workflow: ProjectWorkflow;
  phaseName: string;
  milestoneTitle?: string;
  closeControl?: ReactNode;
  headingLevel: "h1" | "h2";
}) {
  const t = useTranslations("ProjectTask");
  const tTasks = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { project, capabilities } = useProject();
  const actions = useProjectTaskActions(project.id);
  const reasonId = useId();
  const task = data.task;
  const status = workflow.statuses.find((candidate) => candidate.id === task.statusId);
  const doneStatus = workflow.statuses.find((candidate) => candidate.category === "done");
  const isDone = status?.category === "done";
  const canMove = capabilities.changeStatus && task.can?.status !== false;
  const doneAllowed = !!doneStatus && (workflow.transitions[task.statusId] ?? []).includes(doneStatus.id);
  const priority = priorityStyle(task.priority);

  const action = canMove ? (
    <SignatureCardAction
      icon={Check}
      label={t("markDone")}
      aria-disabled={!doneAllowed || isDone || undefined}
      aria-describedby={!doneAllowed && !isDone ? reasonId : undefined}
      onClick={() => {
        if (!doneAllowed || isDone || !doneStatus) return;
        actions.update.mutate({ taskId: task.id, patch: { statusId: doneStatus.id }, revision: task.revision });
      }}
      className={cn((!doneAllowed || isDone) && "opacity-60")}
    />
  ) : (
    <SignatureCardAction
      icon={Link2}
      variant="neutral"
      label={t("copyLink")}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href);
        toast({ title: t("copied") });
      }}
    />
  );

  return (
    <SignatureCard as="section" aria-label={task.title} action={action} contentClassName="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-fg-secondary">
        {closeControl}
        <nav aria-label={t("title")} className="flex min-w-0 items-center gap-1.5">
          <Link href={projectHref(project.id)} className="truncate underline underline-offset-2 hover:text-fg">
            <bdi>{project.name}</bdi>
          </Link>
          <span aria-hidden="true">›</span>
          <bdi className="truncate text-fg">{phaseName}</bdi>
        </nav>
      </div>
      <Heading className="type-h2 break-words text-fg">
        <bdi>{task.title}</bdi>
      </Heading>
      <div className="flex flex-wrap items-center gap-1.5">
        <WorkflowStatusChip status={status} />
        <span
          className={cn("inline-flex min-h-6 items-center rounded-pill px-2.5 text-xs font-semibold", priority.chip)}
        >
          {tTasks(`priority.${task.priority ?? "none"}`)}
        </span>
        {task.due ? (
          <span className="inline-flex min-h-6 items-center rounded-pill bg-raised px-2.5 text-xs font-semibold text-fg">
            {t("due", { date: format.day(task.due) })}
          </span>
        ) : null}
        {milestoneTitle ? (
          <span className="inline-flex min-h-6 items-center rounded-pill px-2.5 text-xs font-semibold text-fg inset-ring inset-ring-outline">
            <bdi>{t("milestone", { title: milestoneTitle })}</bdi>
          </span>
        ) : null}
      </div>
      {canMove && !doneAllowed && !isDone ? (
        <p id={reasonId} className="sr-only">
          {t("doneReason", { status: statusLabel(status) })}
        </p>
      ) : null}
    </SignatureCard>
  );
}

export function PropertyRow({
  icon,
  label,
  children,
  aside,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="grid min-h-12 grid-cols-[1.25rem_7.5rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-row bg-surface px-3.5 py-2">
      <Icon icon={icon} size={16} className="text-fg-secondary" />
      <dt className="text-xs font-medium text-fg-secondary">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold text-fg">{children}</dd>
      {aside ? <dd className="text-xs font-medium text-fg-muted">{aside}</dd> : <span />}
    </div>
  );
}

function Properties({
  data,
  workflow,
  phaseName,
  milestoneTitle,
}: {
  data: ProjectTaskDetail;
  workflow: ProjectWorkflow;
  phaseName: string;
  milestoneTitle?: string;
}) {
  const t = useTranslations("ProjectTask.props");
  const tTasks = useTranslations("ProjectTasks.row");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { project, capabilities } = useProject();
  const actions = useProjectTaskActions(project.id);
  const detailActions = useTaskDetailActions(data.task.projectId, data.task.id);
  const task = data.task;
  const status = workflow.statuses.find((candidate) => candidate.id === task.statusId);
  const moves = (workflow.transitions[task.statusId] ?? [])
    .map((id) => workflow.statuses.find((candidate) => candidate.id === id))
    .filter((candidate) => candidate !== undefined);
  const canMove = capabilities.changeStatus && task.can?.status !== false;
  const me = task.assignees.find((assignee) => assignee.person.id === "me");

  const statusValue = canMove ? (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={tTasks("changeStatus", { title: task.title })} className="rounded-pill">
          <WorkflowStatusChip status={status} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-scope="project">
        {moves.map((move) => (
          <DropdownMenuItem
            key={move.id}
            onSelect={() =>
              actions.update.mutate({ taskId: task.id, patch: { statusId: move.id }, revision: task.revision })
            }
          >
            <bdi>{statusLabel(move)}</bdi>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <WorkflowStatusChip status={status} />
  );

  return (
    <dl aria-label={t("label")} className="flex flex-col gap-1.5">
      <PropertyRow
        icon={CircleCheck}
        label={t("status")}
        aside={moves.length > 0 ? t("moves", { list: moves.map((move) => statusLabel(move)).join(" · ") }) : undefined}
      >
        {statusValue}
      </PropertyRow>
      <PropertyRow
        icon={UserRound}
        label={t("assignee")}
        aside={capabilities.assignTasks ? t("contributor") : undefined}
      >
        {task.assignees.length === 0 ? (
          <span className="text-fg-muted">{t("nobody")}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {task.assignees.map((assignee) => (
              <span key={assignee.person.id} className="inline-flex items-center gap-1.5">
                <Avatar
                  name={assignee.person.name}
                  initials={assignee.person.initials}
                  size={32}
                  decorative
                  className="size-6 text-[0.5625rem]"
                />
                <bdi>{assignee.person.id === "me" ? t("you") : assignee.person.name}</bdi>
                {assignee.state !== "accepted" ? (
                  <span className={assignee.state === "pending" ? "text-warning-text" : "text-danger-text"}>
                    · {t(assignee.state)}
                  </span>
                ) : null}
              </span>
            ))}
          </span>
        )}
      </PropertyRow>
      <PropertyRow icon={CalendarRange} label={t("dates")}>
        {data.start && task.due
          ? `${t("start", { date: format.day(data.start) })} → ${t("dueOnly", { date: format.day(task.due) })}`
          : task.due
            ? t("dueOnly", { date: format.day(task.due) })
            : t("noDates")}
      </PropertyRow>
      <PropertyRow icon={Clock} label={t("estimate")} aside={t("logged", { h: format.number(data.loggedHours) })}>
        {task.estimateHours !== null ? t("hours", { h: format.number(task.estimateHours) }) : t("none")}
      </PropertyRow>
      <PropertyRow icon={Layers} label={t("phase")}>
        <bdi>{[phaseName, data.section].filter(Boolean).join(" · ") || t("none")}</bdi>
      </PropertyRow>
      {milestoneTitle ? (
        <PropertyRow icon={Flag} label={t("milestoneLabel")}>
          <bdi>{milestoneTitle}</bdi>
        </PropertyRow>
      ) : null}
      {data.customFields.length > 0 ? (
        <PropertyRow icon={SlidersHorizontal} label={t("fields")}>
          <bdi>{data.customFields.map((field) => `${field.label}: ${field.value}`).join(" · ")}</bdi>
        </PropertyRow>
      ) : null}
      {me ? (
        <div className="flex min-h-12 items-center gap-2.5 rounded-row bg-surface px-3.5 py-2 inset-ring inset-ring-line">
          <Icon icon={CalendarDays} size={16} className="text-scope-deep" />
          <Switch
            wrapperClassName="flex-1"
            label={<span className="text-sm font-semibold text-fg">{t("calendar")}</span>}
            description={me.state === "pending" ? t("calendarHint") : undefined}
            checked={me.state === "accepted" ? data.showInCalendar : false}
            disabled={me.state !== "accepted" || detailActions.setShowInCalendar.isPending}
            onCheckedChange={(on) => detailActions.setShowInCalendar.mutate(on)}
          />
        </div>
      ) : null}
    </dl>
  );
}

const DEPENDENCY_TYPES: readonly DependencyType[] = ["FS", "SS", "FF", "SF"];

function DetailTabs({ data, workflow }: { data: ProjectTaskDetail; workflow: ProjectWorkflow }) {
  const t = useTranslations("ProjectTask");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { project, capabilities } = useProject();
  const actions = useTaskDetailActions(data.task.projectId, data.task.id);
  const projectTasks = useProjectTasks(project.id, {});
  const [predecessor, setPredecessor] = useState("");
  const [type, setType] = useState<DependencyType>("FS");
  const [lag, setLag] = useState("0");
  const [cycle, setCycle] = useState(false);
  const task = data.task;
  const canEdit = task.can?.edit === true;
  const doneSubtasks = data.subtasks.filter((item) => item.done).length;

  const tabs: FolderTab[] = [
    {
      value: "comments",
      label: t("tabs.comments"),
      count: data.comments.length,
      content: (
        <TaskComments
          comments={data.comments}
          canComment={capabilities.comment}
          busy={actions.addComment.isPending}
          onAdd={(body, done) => actions.addComment.mutate(body, { onSuccess: done })}
        />
      ),
    },
    {
      value: "subtasks",
      label: t("tabs.subtasks"),
      count: `${format.number(doneSubtasks)}/${format.number(data.subtasks.length)}`,
      content:
        data.subtasks.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("subtasks.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.subtasks.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-11 items-center gap-3 rounded-row px-2 hover:bg-subtle">
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={!canEdit}
                    onChange={() => actions.toggleSubtask.mutate(item.id)}
                    className="size-4 accent-(--primary)"
                  />
                  <bdi className={cn("text-sm text-fg", item.done && "text-fg-muted line-through")}>{item.title}</bdi>
                </label>
              </li>
            ))}
          </ul>
        ),
    },
    {
      value: "links",
      label: t("tabs.links"),
      count: data.dependencies.length + data.files.length,
      content: (
        <div className="flex flex-col gap-4">
          <section aria-label={t("links.dependsOn")} className="flex flex-col gap-2">
            <p className="text-xs font-bold text-fg-secondary">{t("links.dependsOn")}</p>
            {data.dependencies.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("links.noDependencies")}</p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {data.dependencies.map((dependency) => (
                <li key={dependency.id} className="flex min-h-11 items-center gap-2 rounded-row bg-subtle px-3">
                  <Icon icon={Link2} size={14} className="text-fg-secondary" />
                  <bdi className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                    {dependency.predecessorTitle}
                  </bdi>
                  <span className="text-xs font-semibold text-fg-secondary" title={t(`links.type.${dependency.type}`)}>
                    <span dir="ltr">{dependency.type}</span>
                    {dependency.lagDays !== 0 ? ` · ${t("links.lag", { n: format.number(dependency.lagDays) })}` : ""}
                  </span>
                  {canEdit ? (
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      variant="ghost"
                      label={t("links.remove", { title: dependency.predecessorTitle })}
                      onClick={() => actions.removeDependency.mutate(dependency.id)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            {canEdit ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!predecessor) return;
                  setCycle(false);
                  actions.addDependency.mutate(
                    { predecessorId: predecessor, type, lagDays: Number(lag) || 0 },
                    {
                      onSuccess: () => setPredecessor(""),
                      onError: (error) => {
                        if (error instanceof RepositoryError && error.message === "cycle") setCycle(true);
                      },
                    },
                  );
                }}
              >
                <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold text-fg-secondary">
                  {t("links.predecessor")}
                  <select
                    value={predecessor}
                    onChange={(event) => {
                      setPredecessor(event.target.value);
                      setCycle(false);
                    }}
                    className="h-10 rounded-field border border-line bg-surface px-2 text-sm text-fg"
                  >
                    <option value="" />
                    {(projectTasks.data?.tasks ?? [])
                      .filter((candidate) => candidate.id !== task.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-fg-secondary">
                  {t("links.typeLabel")}
                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value as DependencyType)}
                    className="h-10 rounded-field border border-line bg-surface px-2 text-sm text-fg"
                  >
                    {DEPENDENCY_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value} · {t(`links.type.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-24 flex-col gap-1 text-xs font-semibold text-fg-secondary">
                  {t("links.lagLabel")}
                  <input
                    type="number"
                    value={lag}
                    onChange={(event) => setLag(event.target.value)}
                    className="h-10 rounded-field border border-line bg-surface px-2 text-sm text-fg"
                  />
                </label>
                <Button type="submit" size="sm" variant="secondary" disabled={!predecessor}>
                  <Icon icon={ListPlus} size={16} />
                  {t("links.submit")}
                </Button>
              </form>
            ) : null}
            {cycle ? <InlineAlert tone="danger" title={t("dep.cycle")} /> : null}
          </section>
          <section aria-label={t("links.files")} className="flex flex-col gap-2">
            <p className="text-xs font-bold text-fg-secondary">{t("links.files")}</p>
            {data.files.length === 0 ? <p className="text-sm text-fg-muted">{t("links.noFiles")}</p> : null}
            <ul className="flex flex-col gap-1">
              {data.files.map((file) => (
                <li
                  key={file.id}
                  className="flex min-h-10 items-center gap-2 rounded-row bg-subtle px-3 text-sm font-semibold text-fg"
                >
                  <bdi>{file.name}</bdi>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ),
    },
    {
      value: "activity",
      label: t("tabs.activity"),
      content: (
        <ul className="flex flex-col gap-2">
          {data.activity.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 text-sm text-fg">
              <Avatar
                name={item.actor.name}
                initials={item.actor.initials}
                size={32}
                decorative
                className="size-6 text-[0.5625rem]"
              />
              <bdi className="min-w-0 flex-1">
                {item.kind === "assigned"
                  ? t("activity.assigned", { actor: item.actor.name, person: item.person })
                  : item.kind === "status"
                    ? t("activity.status", {
                        actor: item.actor.name,
                        status: statusLabel(workflow.statuses.find((status) => status.id === item.statusId)),
                      })
                    : t("activity.created", { actor: item.actor.name })}
              </bdi>
              <span className="text-xs text-fg-muted">{format.relative(item.at)}</span>
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return <FolderTabsCard label={t("tabs.label")} tabs={tabs} defaultValue="comments" />;
}

/**
 * PJ-15 comments panel (list + composer). Context-neutral seam: Teams (TM-15)
 * render the same component with their own comments and handler.
 */
export function TaskComments({
  comments,
  canComment,
  busy,
  onAdd,
}: {
  comments: readonly { id: string; author: { name: string; initials: string }; at: string; body: string }[];
  canComment: boolean;
  busy: boolean;
  /** Save the body; call `done` on success to clear the field. */
  onAdd: (body: string, done: () => void) => void;
}) {
  const t = useTranslations("ProjectTask");
  const format = useProjectFormat();
  const [comment, setComment] = useState("");
  const commentId = useId();
  return (
    <div className="flex flex-col gap-3">
      {comments.length === 0 ? <p className="text-sm text-fg-muted">{t("comments.empty")}</p> : null}
      <ul className="flex flex-col gap-3">
        {comments.map((item) => (
          <li key={item.id} className="flex gap-2.5">
            <Avatar
              name={item.author.name}
              initials={item.author.initials}
              size={32}
              decorative
              className="size-7 text-[0.625rem]"
            />
            <div className="flex min-w-0 flex-col">
              <p className="text-xs font-bold text-fg">
                <bdi>{item.author.name}</bdi>{" "}
                <span className="font-medium text-fg-muted">{format.relative(item.at)}</span>
              </p>
              <p dir="auto" className="text-sm text-fg">
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {canComment ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!comment.trim()) return;
            onAdd(comment, () => setComment(""));
          }}
        >
          <label htmlFor={commentId} className="sr-only">
            {t("comments.label")}
          </label>
          <Textarea
            id={commentId}
            dir="auto"
            rows={1}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("comments.placeholder")}
            className="min-h-11 flex-1"
          />
          <Button type="submit" size="sm" disabled={!comment.trim() || busy}>
            {t("comments.send")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
