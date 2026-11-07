"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { EmptyState, NoResultsState } from "@/components/feedback/state-views";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { getPlannerNow } from "@/data/clock";
import type { ProjectMilestone, ProjectTask, ProjectWorkflow, WorkflowStatus } from "@/data/project-domain";
import {
  useProjectMembers,
  useProjectMilestones,
  useProjectPhases,
  useProjectTaskActions,
  useProjectTasks,
  useProjectWorkflow,
} from "@/data/project-queries";
import type { ProjectTaskPatch } from "@/data/project-repositories";
import { RepositoryError } from "@/data/repositories";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { ActiveTaskFilters, TaskFiltersPopover, TaskViewSwitch, useTasksUrlState } from "../tasks/task-view-shared";
import { useWorkflowStatusLabel } from "../workflow-status-chip";
import {
  buildBoard,
  decideDrop,
  DONE_COLLAPSE_DAYS,
  lanePatch,
  laneOf,
  reorderIds,
  SWIMLANES,
  type BoardColumnModel,
  type BoardLane,
  type BoardModel,
  type DropDecision,
  type Swimlane,
} from "./board-model";
import { ProjectBoardCard, ProjectBoardCardPreview } from "./project-board-card";

/*
 * PJ-03 · Project board (/projects/[id]/board), the Board view mode of Tasks
 * (segmented List / Board / Flow in the header, D3). Columns = the published
 * workflow statuses (version in the toolbar); Done collapses cards completed
 * more than 7 days ago. Drag = transition request: an allowed drop moves the
 * card optimistically and the (mock) server confirms; a move the workflow or
 * the role does not allow outlines the column in rose with the reason and
 * the card springs back; a server rejection after the drop returns the card
 * with a toast. WIP badge per column: over the limit Manager+ confirm, others
 * are blocked. Swimlanes None · Phase · Assignee (lane moves change phase /
 * assignee only if the role can). Keyboard: Space lift, arrows, Space/Enter
 * drop, Esc cancel, live-region announcements (Personal board strings).
 * Phones (PJM03): one status per snap page with the pager on top.
 */

const LONG_PRESS_MS = 200;
const LONG_PRESS_TOLERANCE = 8;
const COLUMN_PREFIX = "col:";

interface Slot {
  laneId: string;
  statusId: string;
}

interface Optimistic {
  taskId: string;
  statusId: string;
  patch: ProjectTaskPatch | null;
}

const columnDropId = (laneId: string, statusId: string) => `${COLUMN_PREFIX}${laneId}::${statusId}`;

function slotOf(over: Over | null): Slot | null {
  const data = over?.data.current as Partial<Slot> | undefined;
  return data?.laneId && data.statusId ? { laneId: data.laneId, statusId: data.statusId } : null;
}

/** Cards win over the column they sit in; no pointer (keyboard) uses the closest corners. */
const detectCollisions: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCorners(args);
  const hits = pointerWithin(args);
  const cards = hits.filter((hit) => !String(hit.id).startsWith(COLUMN_PREFIX));
  return cards.length ? cards : hits;
};

function parseSwimlane(value: string | null): Swimlane {
  return (SWIMLANES as readonly string[]).includes(value ?? "") ? (value as Swimlane) : "none";
}

/** A task as the board shows it while a move waits for the server. */
function applyOptimistic(task: ProjectTask, optimistic: Optimistic | null, members: Map<string, ProjectTask["assignees"][number]["person"]>): ProjectTask {
  if (!optimistic || optimistic.taskId !== task.id) return task;
  const next: ProjectTask = { ...task, statusId: optimistic.statusId };
  const patch = optimistic.patch;
  if (patch?.phaseId !== undefined) next.phaseId = patch.phaseId;
  if (patch?.assigneeIds !== undefined) {
    next.assignees = patch.assigneeIds.map((id) => {
      const kept = task.assignees.find((assignee) => assignee.person.id === id);
      const person = members.get(id);
      return kept ?? { person: person ?? { id, name: id, initials: "?" }, state: "pending" as const };
    });
  }
  return next;
}

export function ProjectBoardScreen() {
  const t = useTranslations("ProjectBoard");
  const tTasks = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const { project, capabilities, demo } = useProject();
  const url = useTasksUrlState();
  const swimlane = project.role === "guest" && url.swimlane === "assignee" ? "none" : parseSwimlane(url.swimlane);
  const [searchText, setSearchText] = useState(url.search);
  const preview = demoAccessOptions(demo);
  const list = useProjectTasks(project.id, { view: "all", filters: url.taskFilters, search: url.search }, preview);
  const workflow = useProjectWorkflow(project.id);
  const phases = useProjectPhases(project.id);
  const milestones = useProjectMilestones(project.id);
  const members = useProjectMembers(project.id);
  const actions = useProjectTaskActions(project.id);
  const [optimistic, setOptimistic] = useState<Optimistic | null>(null);
  const [pendingOrder, setPendingOrder] = useState<readonly string[] | null>(null);
  const [confirm, setConfirm] = useState<{ task: ProjectTask; slot: Slot; decision: DropDecision & { kind: "move" } } | null>(null);
  const guest = project.role === "guest";

  useEffect(() => {
    if (searchText === url.search) return;
    const timer = window.setTimeout(() => url.set({ q: searchText || null }), 250);
    return () => window.clearTimeout(timer);
  }, [searchText, url]);

  const memberMap = useMemo(() => new Map((members.data ?? []).map((person) => [person.id, person])), [members.data]);
  const tasks = useMemo(() => {
    const base = (list.data?.tasks ?? []).map((task) => applyOptimistic(task, optimistic, memberMap));
    if (!pendingOrder) return base;
    const rank = new Map(pendingOrder.map((id, index) => [id, index]));
    const ordered = base.filter((task) => rank.has(task.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    let next = 0;
    return base.map((task) => (rank.has(task.id) ? ordered[next++]! : task));
  }, [list.data, optimistic, memberMap, pendingOrder]);

  const model = useMemo(
    () =>
      workflow.data && phases.data
        ? buildBoard(tasks, workflow.data, {
            swimlane,
            phases: phases.data,
            members: members.data ?? [],
            now: getPlannerNow(),
          })
        : null,
    [tasks, workflow.data, phases.data, members.data, swimlane],
  );

  const header = (
    <ProjectPageHeader
      module="tasks"
      title={tTasks("title")}
      actions={
        <>
          <TaskViewSwitch projectId={project.id} current="board" query={url.query} />
          {capabilities.createTask ? (
            <Button size="lg" asChild>
              <Link href={`${projectHref(project.id, "tasks")}?add=1`}>
                <Icon icon={Plus} size={18} />
                {tTasks("newTask")}
              </Link>
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (!list.data || !workflow.data || !phases.data || !milestones.data || !model) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const wf = workflow.data;
  const showEmptyFirstUse = demo === "empty" || (list.data.counts.all === 0 && url.filterCount === 0 && !url.search);
  const showFiltered = demo === "filtered" || (!showEmptyFirstUse && tasks.length === 0);
  const canDrag = capabilities.changeStatus;

  const settle = () => {
    setOptimistic(null);
    setPendingOrder(null);
  };

  const rejectReason = (error: unknown, task: ProjectTask, toStatusId: string): string => {
    if (error instanceof RepositoryError && error.message === "wip-limit") {
      return t("wip", { n: format.number((model.counts[toStatusId] ?? 0) + 1), max: format.number(wf.wipLimits?.[toStatusId] ?? 0) });
    }
    if (error instanceof RepositoryError && (error.code === "invalid" || error.code === "forbidden")) {
      return t("notAllowed", { from: statusLabel(findStatus(wf, task.statusId)), to: statusLabel(findStatus(wf, toStatusId)) });
    }
    return tTasks("error");
  };

  const commitMove = (task: ProjectTask, slot: Slot, decision: DropDecision & { kind: "move" }, exceedWip: boolean) => {
    const patch = decision.laneChange ? lanePatch(slot.laneId) : null;
    setOptimistic({ taskId: task.id, statusId: slot.statusId, patch });
    const onError = (error: unknown) => {
      settle();
      toast({ tone: "danger", title: t("rejected", { reason: rejectReason(error, task, slot.statusId) }) });
    };
    const updateLane = (revision: number) => {
      if (!patch) return settle();
      actions.update.mutate({ taskId: task.id, patch, revision }, { onSuccess: settle, onError });
    };
    if (decision.statusChange) {
      actions.transition.mutate(
        { taskId: task.id, toStatusId: slot.statusId, revision: task.revision, exceedWip },
        { onSuccess: (updated) => updateLane(updated.revision), onError },
      );
    } else updateLane(task.revision);
  };

  const onDrop = (task: ProjectTask, slot: Slot, index: number, column: BoardColumnModel | undefined) => {
    const decision = decideDrop({
      task,
      toStatusId: slot.statusId,
      fromLane: laneOf(task, swimlane),
      toLane: slot.laneId,
      swimlane,
      workflow: wf,
      counts: model.counts,
      capabilities,
    });
    if (decision.kind === "reorder") {
      const ids = column?.tasks.map((item) => item.id) ?? [];
      const next = reorderIds(ids, task.id, index);
      if (next.join() === ids.join()) return;
      setPendingOrder(next);
      actions.reorder.mutate(next, {
        onSuccess: settle,
        onError: (error) => {
          settle();
          toast({ tone: "danger", title: t("rejected", { reason: rejectReason(error, task, slot.statusId) }) });
        },
      });
    } else if (decision.kind === "move") {
      if (decision.confirmWip) setConfirm({ task, slot, decision });
      else commitMove(task, slot, decision, false);
    }
  };

  return (
    <>
      {header}
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 lg:rounded-pill lg:bg-surface lg:p-2.5">
        <span className="hidden ps-2 text-xs font-semibold text-fg-muted lg:inline">{t("swimlanes")}</span>
        <Segmented<Swimlane>
          label={t("swimlanes")}
          value={swimlane}
          onValueChange={(value) => url.set({ lanes: value === "none" ? null : value })}
          variant="neutral"
          size="sm"
          className="bg-canvas max-lg:hidden"
          options={SWIMLANES.filter((value) => !(guest && value === "assignee")).map((value) => ({
            value,
            label: tTasks(`group.${value}`),
          }))}
        />
        <SearchField
          value={searchText}
          onValueChange={setSearchText}
          placeholder={tTasks("search")}
          aria-label={tTasks("search")}
          className="min-w-44 flex-1"
        />
        <TaskFiltersPopover
          url={url}
          workflow={wf}
          members={members.data ?? []}
          milestones={milestones.data}
          guest={guest}
        />
        <span className="rounded-pill bg-surface px-3 py-1.5 text-xs font-semibold text-fg-secondary inset-ring inset-ring-outline max-lg:hidden">
          {t("workflowVersion", {
            version: format.number(wf.version),
            date: wf.publishedAt ? format.day(wf.publishedAt.slice(0, 10)) : "—",
          })}
        </span>
      </div>
      <ActiveTaskFilters url={url} workflow={wf} members={members.data ?? []} milestones={milestones.data} />

      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}
      {!canDrag && !guest ? <p className="px-1 text-xs font-semibold text-fg-secondary">{tTasks("viewer")}</p> : null}

      {showEmptyFirstUse ? (
        <EmptyState variant="card" title={tTasks("empty.title")} description={tTasks("empty.description")} titleAs="h2" />
      ) : showFiltered ? (
        <NoResultsState
          variant="card"
          title={tTasks("filtered.title")}
          description={tTasks("filtered.description")}
          primaryAction={
            <Button variant="secondary" onClick={url.clearFilters}>
              {tTasks("filters.clear")}
            </Button>
          }
        />
      ) : (
        <BoardDnd
          model={model}
          workflow={wf}
          projectId={project.id}
          milestones={milestones.data}
          canDrag={canDrag}
          swimlane={swimlane}
          capabilities={capabilities}
          onDrop={onDrop}
        />
      )}

      {confirm ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
          title={t("wip", {
            n: format.number((model.counts[confirm.slot.statusId] ?? 0) + 1),
            max: format.number(wf.wipLimits?.[confirm.slot.statusId] ?? 0),
          })}
          onConfirm={() => {
            commitMove(confirm.task, confirm.slot, confirm.decision, true);
            setConfirm(null);
          }}
        />
      ) : null}
    </>
  );
}

function findStatus(workflow: ProjectWorkflow, id: string): WorkflowStatus | undefined {
  return workflow.statuses.find((status) => status.id === id);
}

interface BoardDndProps {
  model: BoardModel;
  workflow: ProjectWorkflow;
  projectId: string;
  milestones: readonly ProjectMilestone[];
  canDrag: boolean;
  swimlane: Swimlane;
  capabilities: { exceedWip: boolean; reorderTasks: boolean };
  onDrop: (task: ProjectTask, slot: Slot, index: number, column: BoardColumnModel | undefined) => void;
}

interface Hover {
  slot: Slot;
  decision: DropDecision;
  /** Status of the dragged card (the "from" of the reason). */
  fromStatusId: string;
}

function BoardDnd({ model, workflow, projectId, milestones, canDrag, swimlane, capabilities, onDrop }: BoardDndProps) {
  const tBoard = useTranslations("Tasks.board");
  const statusLabel = useWorkflowStatusLabel();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  /** The column that refused the last drop keeps its rose outline briefly. */
  const [refused, setRefused] = useState<Hover | null>(null);
  const refusedTimer = useRef<number | undefined>(undefined);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: LONG_PRESS_TOLERANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = useMemo(() => {
    const map = new Map<string, ProjectTask>();
    for (const lane of model.lanes)
      for (const column of lane.columns) for (const task of [...column.tasks, ...column.collapsed]) map.set(task.id, task);
    return map;
  }, [model]);

  useEffect(() => () => window.clearTimeout(refusedTimer.current), []);

  const decide = useCallback(
    (taskId: string, slot: Slot): DropDecision | null => {
      const task = byId.get(taskId);
      if (!task) return null;
      return decideDrop({
        task,
        toStatusId: slot.statusId,
        fromLane: laneOf(task, swimlane),
        toLane: slot.laneId,
        swimlane,
        workflow,
        counts: model.counts,
        capabilities,
      });
    },
    [byId, swimlane, workflow, model.counts, capabilities],
  );

  const titleOf = useCallback((id: string | number) => byId.get(String(id))?.title ?? "", [byId]);
  const columnTitle = useCallback(
    (over: Over | null) => {
      const slot = slotOf(over);
      return slot ? statusLabel(findStatus(workflow, slot.statusId)) : "";
    },
    [statusLabel, workflow],
  );
  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => tBoard("drag.start", { title: titleOf(active.id) }),
      onDragOver: ({ over }) => (over ? tBoard("drag.over", { column: columnTitle(over) }) : undefined),
      onDragEnd: ({ active, over }) => {
        const slot = slotOf(over);
        const decision = slot ? decide(String(active.id), slot) : null;
        return slot && decision && decision.kind !== "not-allowed"
          ? tBoard("drag.drop", { title: titleOf(active.id), column: columnTitle(over) })
          : tBoard("drag.cancel", { title: titleOf(active.id) });
      },
      onDragCancel: ({ active }) => tBoard("drag.cancel", { title: titleOf(active.id) }),
    }),
    [tBoard, titleOf, columnTitle, decide],
  );

  const reset = () => {
    setActiveId(null);
    setHover(null);
  };

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const slot = slotOf(over);
    const decision = slot ? decide(String(active.id), slot) : null;
    const task = byId.get(String(active.id));
    setHover(slot && decision && task ? { slot, decision, fromStatusId: task.statusId } : null);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    reset();
    const slot = slotOf(over);
    const task = byId.get(id);
    if (!slot || !task) return;
    const decision = decide(id, slot);
    if (decision?.kind === "not-allowed") {
      window.clearTimeout(refusedTimer.current);
      setRefused({ slot, decision, fromStatusId: task.statusId });
      refusedTimer.current = window.setTimeout(() => setRefused(null), 2400);
      return;
    }
    const column = model.lanes.find((lane) => lane.id === slot.laneId)?.columns.find((col) => col.status.id === slot.statusId);
    const overId = String(over?.id ?? "");
    const ids = column?.tasks.map((item) => item.id) ?? [];
    const index = overId.startsWith(COLUMN_PREFIX) ? ids.length : Math.max(0, ids.indexOf(overId));
    onDrop(task, slot, index, column);
  };

  const activeTask = activeId ? byId.get(activeId) : undefined;
  const single = model.lanes.length === 1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={detectCollisions}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
      accessibility={{ announcements, screenReaderInstructions: { draggable: tBoard("drag.instructions") } }}
    >
      <div className="flex flex-col gap-4">
        {model.lanes.map((lane) => (
          <LaneView
            key={lane.id}
            lane={lane}
            model={model}
            workflow={workflow}
            projectId={projectId}
            milestones={milestones}
            canDrag={canDrag}
            activeId={activeId}
            hover={hover ?? refused}
            pager={single}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? <ProjectBoardCardPreview task={activeTask} milestones={milestones} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

interface LaneViewProps {
  lane: BoardLane;
  model: BoardModel;
  workflow: ProjectWorkflow;
  projectId: string;
  milestones: readonly ProjectMilestone[];
  canDrag: boolean;
  activeId: string | null;
  hover: Hover | null;
  /** Phones: pager on top of the snap pages (single lane only). */
  pager: boolean;
}

function LaneView({ lane, model, workflow, projectId, milestones, canDrag, activeId, hover, pager }: LaneViewProps) {
  const tTasks = useTranslations("ProjectTasks");
  const tBoard = useTranslations("Tasks.board");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const head = lane.head;
  const laneTitle =
    head.kind === "phase"
      ? head.phase.name
      : head.kind === "person"
        ? head.person.name
        : head.kind === "nobody"
          ? tTasks("group.nobody")
          : head.kind === "no-phase"
            ? tTasks("group.noPhase")
            : null;

  const onScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const center = box.left + box.width / 2;
    let best = 0;
    let bestDistance = Infinity;
    root.querySelectorAll<HTMLElement>("[data-board-column]").forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    setPage(best);
  };
  const goTo = (index: number) => {
    const element = scrollRef.current?.querySelectorAll<HTMLElement>("[data-board-column]")[index];
    element?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", inline: "center", block: "nearest" });
  };
  const columnName = (index: number) => {
    const status = model.statuses[index];
    return status ? `${statusLabel(status)} ${format.number(model.counts[status.id] ?? 0)}` : "";
  };

  return (
    <section aria-label={laneTitle ?? undefined} className="flex flex-col gap-2.5">
      {laneTitle ? (
        <h2 className="px-1 text-sm font-bold text-fg">
          <bdi>{laneTitle}</bdi>
        </h2>
      ) : null}
      {pager ? (
        // Phones (PJM03/PJM04): pager on top; pages follow the reading direction.
        <nav aria-label={tBoard("pager")} className="flex items-center justify-between gap-2 text-xs font-semibold text-fg-secondary lg:hidden">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => goTo(page - 1)}
            className="inline-flex min-h-8 items-center gap-1 rounded-pill px-1 disabled:invisible focus-visible:focus-ring"
          >
            <Icon icon={ChevronLeft} size={14} className="rtl:-scale-x-100" />
            {columnName(page - 1)}
          </button>
          <span className="flex gap-1.5">
            {model.statuses.map((status, index) => (
              <button
                key={status.id}
                type="button"
                aria-label={tBoard("page", { column: statusLabel(status) })}
                aria-current={index === page ? "true" : undefined}
                onClick={() => goTo(index)}
                className="inline-flex size-6 items-center justify-center rounded-full focus-visible:focus-ring"
              >
                <span
                  className={cn(
                    "h-1.5 rounded-pill transition-[width] duration-200 motion-reduce:transition-none",
                    index === page ? "w-5 bg-primary" : "w-1.5 bg-outline",
                  )}
                />
              </button>
            ))}
          </span>
          <button
            type="button"
            disabled={page >= model.statuses.length - 1}
            onClick={() => goTo(page + 1)}
            className="inline-flex min-h-8 items-center gap-1 rounded-pill px-1 disabled:invisible focus-visible:focus-ring"
          >
            {columnName(page + 1)}
            <Icon icon={ChevronRight} size={14} className="rtl:-scale-x-100" />
          </button>
        </nav>
      ) : null}
      <div
        ref={scrollRef}
        role="region"
        aria-label={tBoard("label")}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:snap-none lg:rounded-[28px] lg:bg-surface lg:p-3"
      >
        {lane.columns.map((column) => (
          <ColumnView
            key={column.status.id}
            laneId={lane.id}
            column={column}
            workflow={workflow}
            count={model.counts[column.status.id] ?? 0}
            projectId={projectId}
            milestones={milestones}
            canDrag={canDrag}
            activeId={activeId}
            hover={hover?.slot.laneId === lane.id && hover.slot.statusId === column.status.id ? hover : null}
          />
        ))}
      </div>
    </section>
  );
}

interface ColumnViewProps {
  laneId: string;
  column: BoardColumnModel;
  workflow: ProjectWorkflow;
  /** Tasks in this status across lanes (WIP). */
  count: number;
  projectId: string;
  milestones: readonly ProjectMilestone[];
  canDrag: boolean;
  activeId: string | null;
  hover: Hover | null;
}

function ColumnView({ laneId, column, workflow, count, projectId, milestones, canDrag, activeId, hover }: ColumnViewProps) {
  const t = useTranslations("ProjectBoard");
  const tBoard = useTranslations("Tasks.board");
  const format = useProjectFormat();
  const statusLabel = useWorkflowStatusLabel();
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const { status } = column;
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(laneId, status.id), data: { laneId, statusId: status.id } });
  const limit = workflow.wipLimits?.[status.id];
  const over = limit !== undefined && count > limit;
  const refused = hover?.decision.kind === "not-allowed" ? hover.decision : null;
  const shown = expanded ? [...column.tasks, ...column.collapsed] : column.tasks;
  const visibleCount = column.tasks.length + column.collapsed.length;
  const label = statusLabel(status);

  const reason =
    refused && hover
      ? refused.reason === "wip" && limit !== undefined
        ? t("wip", { n: format.number(count + 1), max: format.number(limit) })
        : t("notAllowed", { from: statusLabel(findStatus(workflow, hover.fromStatusId)), to: label })
      : null;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-board-column={status.id}
      data-refused={refused ? "true" : undefined}
      className={cn(
        "flex w-[86vw] max-w-[340px] shrink-0 snap-center flex-col gap-2.5 self-start rounded-[24px] bg-subtle p-2.5 transition-shadow duration-200 motion-reduce:transition-none sm:w-[300px] lg:w-auto lg:min-w-[200px] lg:max-w-none lg:flex-1",
        refused ? "bg-danger-soft/40 ring-2 ring-danger" : isOver && activeId && "ring-2 ring-primary",
      )}
    >
      <header className="flex flex-col gap-1 px-1.5 pt-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 id={headingId} className="text-[15px] font-bold text-fg">
            <bdi>{label}</bdi>
            <span className="ms-1.5 text-xs font-semibold text-fg-muted">{format.number(visibleCount)}</span>
            <span className="sr-only">, {tBoard("cards", { count: visibleCount, n: format.number(visibleCount) })}</span>
          </h3>
          {limit !== undefined ? (
            <span
              data-wip={over ? "over" : "ok"}
              className={cn(
                "rounded-pill px-2 py-0.5 text-xs font-bold",
                over ? "bg-warning-soft text-warning-text" : "bg-surface text-fg-secondary",
              )}
            >
              {t("wip", { n: format.number(count), max: format.number(limit) })}
            </span>
          ) : null}
        </div>
        {refused && reason ? (
          <p role="status" className="text-xs font-semibold text-danger-text">
            {reason}
          </p>
        ) : null}
      </header>
      <SortableContext id={`${laneId}::${status.id}`} items={shown.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-12 flex-col gap-2" aria-labelledby={headingId}>
          {shown.map((task) => (
            <ProjectBoardCard
              key={task.id}
              task={task}
              projectId={projectId}
              laneId={laneId}
              milestones={milestones}
              draggable={canDrag && task.can?.status !== false}
              lifted={task.id === activeId}
            />
          ))}
        </ul>
      </SortableContext>
      {column.collapsed.length > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="rounded px-1.5 text-start text-xs font-semibold text-fg-secondary hover:text-fg focus-visible:focus-ring"
        >
          {t("doneMore", { n: format.number(column.collapsed.length), days: format.number(DONE_COLLAPSE_DAYS) })}
        </button>
      ) : null}
    </section>
  );
}
