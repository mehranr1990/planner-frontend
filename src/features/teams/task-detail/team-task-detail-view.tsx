"use client";

import { CalendarDays, Check, Clock, Link2, Target, UserRound, CircleDot } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { StateLayout } from "@/components/feedback/state-layout";
import { buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { AccessLoading } from "@/components/feedback/access-state";
import { toast } from "@/components/ui/toast";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { TeamTaskDetail, TeamTaskStatus } from "@/data/team-domain";
import {
  useTeamTaskActions,
  useTeamTaskDetail,
  useTeamTaskDetailActions,
  useTeamWeekPlan,
} from "@/data/team-queries";
import { projectHref, teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { AssignmentBlockView } from "@/features/projects/task-detail/assignment-block";
import { PropertyRow, TaskComments } from "@/features/projects/task-detail/project-task-detail-view";
import { SourceChip } from "../source-chip";
import { teamDemoAccessOptions } from "../demo-state";
import { useTeam } from "../team-gate";
import { TeamStatusChip, TeamStatusControl } from "../work/team-task-row";

/*
 * TM-15 · Team task detail (drawer on soft navigation, full page on hard
 * load). Same anatomy as PJ-15: signature head (notch = Mark done; Viewer /
 * no rights: Copy link — never empty), the assignment block (Accept /
 * Decline with reason for the assignee; Lead sees Remind / Reassign), then
 * properties: Status (team set), Assignee, Dates + week plan, Estimate,
 * Goal link, Related project task (link only, opens in its project), and
 * Comments · Subtasks · Activity. Project tasks never open here. Privacy:
 * the assignee's personal notes, focus and time blocks are never shown.
 */
export function TeamTaskDetailView({
  taskId,
  variant,
  closeControl,
}: {
  taskId: string;
  variant: "drawer" | "page";
  closeControl?: ReactNode;
}) {
  const t = useTranslations("TeamTask");
  const { team, demo } = useTeam();
  const detail = useTeamTaskDetail(team.id, taskId, teamDemoAccessOptions(demo));
  const plan = useTeamWeekPlan(team.id);

  if (detail.isError) {
    return (
      <StateLayout
        role="status"
        tone="neutral"
        icon={Link2}
        title={t("notFound.title")}
        description={t("notFound.description")}
        titleAs={variant === "page" ? "h1" : "h2"}
        primaryAction={
          <Link href={teamHref(team.id, "work")} className={buttonVariants()}>
            {t("notFound.action")}
          </Link>
        }
      />
    );
  }
  if (!detail.data) return <AccessLoading />;

  const data = detail.data;
  const weekNumber = plan.data && plan.data.week === data.task.planWeek ? plan.data.weekNumber : null;
  return (
    <article className="flex flex-col gap-3" data-scope="team">
      <DetailHead data={data} weekNumber={weekNumber} closeControl={closeControl} headingLevel={variant === "page" ? "h1" : "h2"} />
      {team.role === "viewer" ? <InlineAlert tone="info" title={t("viewer")} /> : null}
      <Assignment data={data} />
      <Properties data={data} weekNumber={weekNumber} />
      <DetailTabs data={data} />
    </article>
  );
}

function DetailHead({
  data,
  weekNumber,
  closeControl,
  headingLevel: Heading,
}: {
  data: TeamTaskDetail;
  weekNumber: number | null;
  closeControl?: ReactNode;
  headingLevel: "h1" | "h2";
}) {
  const t = useTranslations("TeamTask");
  const tNav = useTranslations("Navigation");
  const format = useProjectFormat();
  const { team } = useTeam();
  const actions = useTeamTaskActions(team.id);
  const task = data.task;
  const isDone = task.status === "done";

  const setStatus = (status: TeamTaskStatus, after?: (revision: number) => void) =>
    actions.setStatus.mutate(
      { taskId: task.id, status, revision: task.revision },
      { onSuccess: (saved) => after?.(saved.revision) },
    );

  const action = task.can.status ? (
    <SignatureCardAction
      icon={Check}
      label={isDone ? t("reopen") : t("markDone")}
      aria-pressed={isDone}
      onClick={() => {
        if (isDone) {
          setStatus("todo");
          return;
        }
        const previous = task.status;
        setStatus("done", (revision) =>
          toast({
            title: t("done"),
            action: {
              label: t("doneUndo"),
              altText: t("doneUndoAlt"),
              onClick: () => actions.setStatus.mutate({ taskId: task.id, status: previous, revision }),
            },
          }),
        );
      }}
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
          <Link href={teamHref(team.id)} className="truncate underline underline-offset-2 hover:text-fg">
            <bdi>{team.name}</bdi>
          </Link>
          <span aria-hidden="true">›</span>
          <Link href={teamHref(team.id, "work")} className="truncate text-fg hover:underline">
            {tNav("items.work")}
          </Link>
        </nav>
      </div>
      <Heading className="type-h2 break-words text-fg">
        <bdi>{task.title}</bdi>
      </Heading>
      <div className="flex flex-wrap items-center gap-1.5">
        <TeamStatusChip status={task.status} />
        <SourceChip source={task.source} />
        {task.due ? (
          <span className="inline-flex min-h-6 items-center rounded-pill bg-raised px-2.5 text-xs font-semibold text-fg">
            {t("due", { date: format.day(task.due) })}
          </span>
        ) : null}
        {weekNumber !== null ? (
          <span className="inline-flex min-h-6 items-center rounded-pill px-2.5 text-xs font-semibold text-fg inset-ring inset-ring-outline">
            {t("weekPlan", { n: format.number(weekNumber) })}
          </span>
        ) : null}
      </div>
    </SignatureCard>
  );
}

function Assignment({ data }: { data: TeamTaskDetail }) {
  const t = useTranslations("TeamTask");
  const { team, capabilities } = useTeam();
  const actions = useTeamTaskDetailActions(team.id);
  const task = data.task;
  return (
    <AssignmentBlockView
      assignees={task.assignees}
      canAccept={capabilities.createTask}
      canManage={data.canManageAssignments}
      assignedAt={data.assignedAt}
      busy={actions.accept.isPending || actions.decline.isPending}
      remindBusy={actions.remind.isPending}
      onAccept={() =>
        actions.accept.mutate(
          { taskId: task.id, revision: task.revision },
          {
            onSuccess: (accepted) =>
              toast({
                title: t("accepted"),
                tone: "success",
                action: {
                  label: t("doneUndo"),
                  altText: t("doneUndoAlt"),
                  onClick: () => actions.revertAccept.mutate({ taskId: accepted.id, revision: accepted.revision }),
                },
              }),
          },
        )
      }
      onDecline={(reason, note) =>
        actions.decline.mutate(
          { taskId: task.id, reason, note: note || undefined, revision: task.revision },
          { onSuccess: () => toast({ title: t("declined") }) },
        )
      }
      onRemind={(name) => actions.remind.mutate(task.id, { onSuccess: () => toast({ title: t("reminded", { name }) }) })}
      // Reassign hidden: the PJ-90 assignment-reassign sheet is bound to the project host (see report).
    />
  );
}

function Properties({ data, weekNumber }: { data: TeamTaskDetail; weekNumber: number | null }) {
  const t = useTranslations("TeamTask");
  const format = useProjectFormat();
  const { team } = useTeam();
  const actions = useTeamTaskActions(team.id);
  const task = data.task;
  const assignee = task.assignees[0];

  const dates = task.due
    ? weekNumber !== null
      ? t("dueInPlan", { date: format.day(task.due), n: format.number(weekNumber) })
      : t("dueOnly", { date: format.day(task.due) })
    : weekNumber !== null
      ? t("weekPlan", { n: format.number(weekNumber) })
      : t("noDue");

  return (
    <dl aria-label={t("props.label")} className="flex flex-col gap-1.5">
      <PropertyRow icon={CircleDot} label={t("props.status")}>
        <TeamStatusControl
          task={task}
          onStatus={(status) => actions.setStatus.mutate({ taskId: task.id, status, revision: task.revision })}
        />
      </PropertyRow>
      <PropertyRow icon={UserRound} label={t("props.assignee")}>
        {assignee ? (
          <span className="inline-flex items-center gap-2">
            <Avatar name={assignee.person.name} initials={assignee.person.initials} size={32} decorative className="size-6 text-[0.5625rem]" />
            <bdi>{assignee.person.id === "me" ? t("you") : assignee.person.name}</bdi>
            {assignee.state !== "accepted" ? <span className="text-fg-secondary">· {t(`state.${assignee.state}`)}</span> : null}
          </span>
        ) : (
          t("unassigned")
        )}
      </PropertyRow>
      <PropertyRow icon={CalendarDays} label={t("props.dates")}>
        {dates}
      </PropertyRow>
      <PropertyRow icon={Clock} label={t("props.estimate")}>
        {task.estimateHours !== null ? t("hours", { h: format.number(task.estimateHours) }) : t("none")}
      </PropertyRow>
      <PropertyRow icon={Target} label={t("props.goal")}>
        {task.goal ? (
          <Link href={teamHref(team.id, "goals")} className="underline-offset-2 hover:underline">
            <bdi>{task.goal.title}</bdi>
          </Link>
        ) : (
          t("none")
        )}
      </PropertyRow>
      <PropertyRow icon={Link2} label={t("props.related")}>
        {data.related ? (
          <Link
            href={`${projectHref(data.related.projectId, "tasks")}/${encodeURIComponent(data.related.taskId)}`}
            className="text-project-deep underline-offset-2 hover:underline"
          >
            <bdi>{t("relatedTask", { title: data.related.title, project: data.related.projectName })}</bdi>
          </Link>
        ) : (
          t("none")
        )}
      </PropertyRow>
    </dl>
  );
}

function DetailTabs({ data }: { data: TeamTaskDetail }) {
  const t = useTranslations("TeamTask");
  const tWork = useTranslations("TeamWork");
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const actions = useTeamTaskDetailActions(team.id);
  const bold = (chunks: ReactNode) => <strong className="font-bold">{chunks}</strong>;
  const tabs: FolderTab[] = [
    {
      value: "comments",
      label: t("tabs.comments"),
      count: data.comments.length,
      content: (
        <TaskComments
          comments={data.comments}
          canComment={capabilities.createTask}
          busy={actions.addComment.isPending}
          onAdd={(body, done) => actions.addComment.mutate({ taskId: data.task.id, body }, { onSuccess: done })}
        />
      ),
    },
    {
      value: "subtasks",
      label: t("tabs.subtasks"),
      content: <p className="text-sm text-fg-secondary">{t("subtasks", { percent: format.percent(data.task.progress) })}</p>,
    },
    {
      value: "activity",
      label: t("tabs.activity"),
      content: (
        <ul className="flex flex-col gap-2">
          {data.activity.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 text-sm text-fg">
              <span>
                {t.rich(`activity.${item.kind}`, {
                  name: item.actor.name,
                  status: item.status ? tWork(`status.${item.status}`) : "",
                  b: bold,
                })}
              </span>
              <span className="text-xs text-fg-muted">{format.relative(item.at)}</span>
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return <FolderTabsCard label={t("tabs.label")} tabs={tabs} defaultValue="comments" />;
}
