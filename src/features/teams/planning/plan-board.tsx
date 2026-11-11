"use client";

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowRight, Check, CalendarPlus, ListTodo } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { Progress } from "@/design-system/feedback/progress";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { RepositoryError } from "@/data/repositories";
import type { TeamTask, TeamWeekPlan } from "@/data/team-domain";
import {
  useTeamCapacity,
  useTeamMembers,
  useTeamPlanActions,
  useTeamTasks,
  useTeamUnplanned,
} from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { SourceChip, teamTaskHref } from "../source-chip";
import { useTeam } from "../team-gate";
import { canPlanTask, holderOf, planColumns, planSummary, planTargets, type PlanColumn } from "./planning-model";

/*
 * TM-04 plan board: To plan (carry-overs + unplanned team tasks + member
 * project tasks the viewer can open) · one column per person with booked /
 * capacity (over capacity = rose outline + summary line; a warning, never a
 * block) · the plan summary Signature card (notch: Lead+ Publish plan →
 * Open week work once published; Member: Open my tasks). Dragging from To
 * plan onto a person plans + assigns (Pending until accepted); between
 * people = reassign. Keyboard / phone alternative: "Plan for…" on each card.
 * Members plan only their own tasks.
 */

const TOPLAN = "toplan";

export function PlanBoard({
  plan,
  weekNumber,
  lastWeekNumber,
  onStartFromLastWeek,
}: {
  plan: TeamWeekPlan;
  weekNumber: number;
  lastWeekNumber: number;
  onStartFromLastWeek: () => void;
}) {
  const t = useTranslations("Planning");
  const format = useProjectFormat();
  const { team, capabilities, demo } = useTeam();
  const preview = teamDemoAccessOptions(demo);
  const tasks = useTeamTasks(team.id, {}, preview);
  const unplanned = useTeamUnplanned(team.id, preview);
  const members = useTeamMembers(team.id);
  // OPEN(DECISIONS): whether Viewers may see this-week booking — default off (no capacity request).
  const capacity = useTeamCapacity(team.id, capabilities.seeBooking);
  const actions = useTeamPlanActions(team.id);
  const [filters, setFilters] = useState<ReadonlySet<"carried" | "unplanned">>(new Set(["carried", "unplanned"]));

  const planned = useMemo(
    () => (tasks.data ?? []).filter((task) => task.planWeek === plan.week),
    [tasks.data, plan.week],
  );
  const capacityMap = useMemo(
    () => (capacity.data ? new Map(capacity.data.map((entry) => [entry.personId, entry.capacityHours])) : null),
    [capacity.data],
  );
  const columns = useMemo(
    () => planColumns(members.data ?? [], planned, capacityMap),
    [members.data, planned, capacityMap],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  if (tasks.isError || unplanned.isError || members.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void tasks.refetch();
          void unplanned.refetch();
          void members.refetch();
        }}
      />
    );
  }
  if (!tasks.data || !unplanned.data || !members.data) return <AccessLoading />;

  const memberIds = members.data.map((member) => member.person.id);
  const nameOf = (id: string) => members.data.find((member) => member.person.id === id)?.person.name ?? id;

  const move = (task: TeamTask, target: string) => {
    if (!planTargets(task, capabilities, memberIds).includes(target)) return;
    const toPlan = target === TOPLAN;
    actions.plan.mutate(
      {
        taskId: task.id,
        week: toPlan ? null : plan.week,
        assigneeId: toPlan ? (holderOf(task)?.person.id ?? null) : target,
        revision: task.revision,
      },
      {
        onSuccess: () =>
          toast({
            title: toPlan
              ? t("toast.unplanned", { title: task.title })
              : t("toast.planned", { title: task.title, name: nameOf(target) }),
          }),
        onError: (error) =>
          toast({
            tone: "danger",
            title:
              error instanceof RepositoryError && error.code === "conflict"
                ? t("toast.conflict")
                : error instanceof RepositoryError && error.code === "forbidden"
                  ? task.source.kind === "project"
                    ? t("toast.projectAssigned")
                    : t("toast.forbidden")
                  : t("toast.failed"),
          }),
      },
    );
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const task = [...unplanned.data, ...planned].find((item) => item.id === active.id);
    const target = (over?.data.current as { target?: string } | undefined)?.target;
    if (task && target) move(task, target);
  };

  const carried = unplanned.data.filter((task) => task.carriedFrom);
  const others = unplanned.data.filter((task) => !task.carriedFrom);
  const toPlan = [...(filters.has("carried") ? carried : []), ...(filters.has("unplanned") ? others : [])];
  const toggle = (key: "carried" | "unplanned") => {
    const next = new Set(filters);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setFilters(next);
  };
  const cardProps = { capabilities, memberIds, nameOf, onMove: move, teamId: team.id };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {!capabilities.editWeekFocus && capabilities.createTask ? (
        <p className="text-sm font-medium text-fg-secondary">{t("readOnly")}</p>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)_minmax(17rem,19rem)] lg:items-start">
        <DropZone target={TOPLAN} label={t("toPlan")} className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="type-title text-fg">{t("toPlan")}</h2>
            <span className="text-xs font-semibold text-fg-secondary">
              {t("toPlanTotal", {
                n: format.number(unplanned.data.length),
                hours: format.number(unplanned.data.reduce((sum, task) => sum + (task.estimateHours ?? 0), 0)),
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ToggleChip
              scope="team"
              size="sm"
              selected={filters.has("carried")}
              onSelectedChange={() => toggle("carried")}
            >
              {t("filterCarried", { n: format.number(carried.length) })}
            </ToggleChip>
            <ToggleChip
              scope="team"
              size="sm"
              selected={filters.has("unplanned")}
              onSelectedChange={() => toggle("unplanned")}
            >
              {t("filterUnplanned", { n: format.number(others.length) })}
            </ToggleChip>
          </div>
          {toPlan.length ? (
            <ul className="flex flex-col gap-2">
              {toPlan.map((task) => (
                <li key={task.id}>
                  <PlanCard task={task} {...cardProps} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">{t("toPlanEmpty")}</p>
          )}
        </DropZone>

        <div className="flex min-w-0 flex-col gap-3">
          {planned.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title={t("empty.title")}
              description={t("empty.body")}
              primaryAction={
                <Button variant="secondary" onClick={onStartFromLastWeek}>
                  {t("empty.action", { n: format.number(lastWeekNumber) })}
                </Button>
              }
            />
          ) : null}
          <ul className="flex min-w-0 snap-x gap-3 overflow-x-auto pb-2">
            {columns.map((column) => (
              <li key={column.member.person.id} className="w-56 shrink-0 snap-start">
                <PersonColumn column={column} canDropHere={canDropOn(column, capabilities)} {...cardProps} />
              </li>
            ))}
          </ul>
        </div>

        <PlanSummary plan={plan} weekNumber={weekNumber} columns={columns} planned={planned} />
      </div>
    </DndContext>
  );
}

function canDropOn(column: PlanColumn, capabilities: ReturnType<typeof useTeam>["capabilities"]) {
  return capabilities.editWeekFocus || (capabilities.createTask && column.member.person.id === "me");
}

function DropZone({
  target,
  label,
  className,
  disabled,
  children,
}: {
  target: string;
  label: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${target}`, data: { target }, disabled });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(className, isOver && "inset-ring-2 inset-ring-scope-deep")}
    >
      {children}
    </section>
  );
}

interface CardContext {
  capabilities: ReturnType<typeof useTeam>["capabilities"];
  memberIds: readonly string[];
  nameOf: (id: string) => string;
  onMove: (task: TeamTask, target: string) => void;
  teamId: string;
}

function PersonColumn({ column, canDropHere, ...context }: CardContext & { column: PlanColumn; canDropHere: boolean }) {
  const t = useTranslations("Planning");
  const format = useProjectFormat();
  const { person } = column.member;
  const ratio = column.capacityHours ? Math.min(100, (column.bookedHours / column.capacityHours) * 100) : 0;
  return (
    <DropZone
      target={person.id}
      label={person.name}
      disabled={!canDropHere}
      className={cn(
        "flex min-h-40 flex-col gap-2 rounded-[24px] bg-surface p-3",
        column.over && "inset-ring-2 inset-ring-danger",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-scope-soft text-[10px] font-bold text-scope-deep"
        >
          {person.initials}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-fg">
          <bdi>{person.name}</bdi>
        </h3>
        {column.capacityHours !== null ? (
          <span
            className={cn("shrink-0 text-xs font-bold tabular", column.over ? "text-danger-text" : "text-fg-secondary")}
            aria-label={t("bookedLabel", {
              booked: format.number(column.bookedHours),
              capacity: format.number(column.capacityHours),
            })}
          >
            {t("booked", { booked: format.number(column.bookedHours), capacity: format.number(column.capacityHours) })}
          </span>
        ) : null}
      </div>
      {column.capacityHours !== null ? (
        <Progress
          value={ratio}
          size="sm"
          label={column.over ? t("overCapacity") : person.name}
          indicatorClassName={column.over ? "bg-danger" : "bg-scope-deep"}
        />
      ) : null}
      {column.over ? <p className="text-xs font-bold text-danger-text">{t("overCapacity")}</p> : null}
      <ul className="flex flex-col gap-2">
        {column.tasks.map((task) => (
          <li key={task.id}>
            <PlanCard task={task} {...context} />
          </li>
        ))}
      </ul>
      {canDropHere ? (
        <p className="mt-auto rounded-[16px] px-2 py-3 text-center text-xs font-semibold text-scope-deep border border-dashed border-scope-deep/40 max-lg:hidden">
          {t("dropFor", { name: person.name })}
        </p>
      ) : null}
    </DropZone>
  );
}

function PlanCard({ task, capabilities, memberIds, nameOf, onMove, teamId }: CardContext & { task: TeamTask }) {
  const t = useTranslations("Planning");
  const format = useProjectFormat();
  const targets = planTargets(task, capabilities, memberIds);
  const movable = canPlanTask(task, capabilities) && targets.length > 0;
  // Pointer drag only (the card holds a link and a menu); keyboard users use "Plan for…".
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !movable,
  });
  const holder = holderOf(task);
  return (
    <div
      ref={setNodeRef}
      {...(movable ? listeners : {})}
      data-task={task.id}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "flex flex-col gap-1.5 rounded-[16px] bg-subtle p-3",
        movable && "cursor-grab touch-manipulation",
        isDragging && "relative z-20 shadow-elevated inset-ring-2 inset-ring-scope-deep",
        task.status === "done" && "opacity-70",
      )}
    >
      <div className="flex items-start gap-1">
        <Link
          href={teamTaskHref(teamId, task)}
          className={cn(
            "min-w-0 flex-1 text-sm font-bold text-fg hover:underline",
            task.status === "done" && "line-through",
          )}
        >
          <bdi>{task.title}</bdi>
        </Link>
        {movable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                icon={CalendarPlus}
                size="sm"
                variant="ghost"
                label={t("planForTask", { title: task.title })}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {targets.map((target) => (
                <DropdownMenuItem key={target} onSelect={() => onMove(task, target)}>
                  {target === TOPLAN ? t("backToPlan") : nameOf(target)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {task.carriedFrom ? (
          <span className="rounded-pill bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-text">
            {t("carried")}
          </span>
        ) : (
          <SourceChip source={task.source} />
        )}
        {holder?.state === "pending" ? (
          <span className="rounded-pill bg-raised px-2 py-0.5 text-xs font-semibold text-fg-secondary">
            {t("pending")}
          </span>
        ) : null}
        {task.estimateHours !== null ? (
          <span className="ms-auto text-xs font-semibold text-fg-secondary tabular">
            {t("hours", { n: format.number(task.estimateHours) })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PlanSummary({
  plan,
  weekNumber,
  columns,
  planned,
}: {
  plan: TeamWeekPlan;
  weekNumber: number;
  columns: readonly PlanColumn[];
  planned: readonly TeamTask[];
}) {
  const t = useTranslations("Planning");
  const format = useProjectFormat();
  const router = useRouter();
  const { team, capabilities } = useTeam();
  const actions = useTeamPlanActions(team.id);
  const summary = planSummary(columns, planned);
  const published = plan.status === "published";

  // Notch never empty: Lead+ Publish → Open week work; Members Open my tasks.
  const action = capabilities.editWeekFocus ? (
    published ? (
      <SignatureCardAction
        icon={ArrowRight}
        mirror
        label={t("openWork")}
        onClick={() => router.push(teamHref(team.id, "work"))}
      />
    ) : (
      <SignatureCardAction
        icon={Check}
        label={t("publish")}
        disabled={actions.publish.isPending}
        onClick={() =>
          actions.publish.mutate(plan.week, {
            onSuccess: () => toast({ title: t("toast.published") }),
            onError: () => toast({ tone: "danger", title: t("toast.failed") }),
          })
        }
      />
    )
  ) : capabilities.createTask ? (
    <SignatureCardAction
      icon={ArrowRight}
      mirror
      label={t("openMine")}
      onClick={() => router.push(`${teamHref(team.id, "work")}?filter=mine`)}
    />
  ) : (
    <SignatureCardAction
      icon={ArrowRight}
      mirror
      label={t("openWork")}
      onClick={() => router.push(teamHref(team.id, "work"))}
    />
  );

  return (
    <SignatureCard action={action} as="section" aria-labelledby="plan-summary-title" contentClassName="gap-3">
      <h2 id="plan-summary-title" className="text-xs font-bold tracking-wide text-scope-deep uppercase">
        {t(published ? "summary.published" : "summary.draft", { n: format.number(weekNumber) })}
      </h2>
      {published && plan.publishedAt && plan.publishedBy ? (
        <p className="flex items-center gap-1.5 rounded-row bg-scope-soft px-3 py-2 text-xs font-semibold text-scope-deep">
          <Check aria-hidden size={14} />
          {t("summary.publishedAt", {
            n: format.number(weekNumber),
            date: `${format.day(plan.publishedAt.slice(0, 10), "weekdayShort")} ${convertDigits(plan.publishedAt.slice(11, 16), format.digits)}`,
            name: plan.publishedBy.name,
          })}
        </p>
      ) : null}
      <p className="flex items-baseline gap-2 text-fg">
        <span className="text-5xl font-bold tabular">{format.number(summary.tasks)}</span>
        <span className="text-sm font-medium text-fg-secondary">
          {t("summary.tasks", { hours: format.number(summary.hours), capacity: format.number(summary.capacity) })}
        </span>
      </p>
      {summary.capacity > 0 ? (
        <Progress
          value={Math.min(100, (summary.hours / summary.capacity) * 100)}
          size="sm"
          label={t("summary.tasks", { hours: format.number(summary.hours), capacity: format.number(summary.capacity) })}
        />
      ) : null}
      <dl className="flex flex-col gap-1.5 text-sm">
        <SummaryRow label={t("summary.overCapacity")}>
          {summary.over.length
            ? summary.over
                .map(
                  (column) =>
                    `${column.member.person.name} · ${t("booked", { booked: format.number(column.bookedHours), capacity: format.number(column.capacityHours ?? 0) })}`,
                )
                .join(", ")
            : t("summary.none")}
        </SummaryRow>
        <SummaryRow label={t("summary.unassigned")}>{format.number(summary.unassigned)}</SummaryRow>
        <SummaryRow label={t("summary.carriedFrom", { n: format.number(weekNumber - 1) })}>
          {format.number(plan.carriedOver)}
        </SummaryRow>
      </dl>
      <p className="text-xs text-fg-secondary">{t("summary.note")}</p>
    </SignatureCard>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-medium text-fg-secondary">{label}</dt>
      <dd className="text-end font-bold text-fg">{children}</dd>
    </div>
  );
}
