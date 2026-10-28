"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Eye, EyeOff } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { useReorderTasks } from "@/data/queries";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { cn } from "@/lib/cn";
import { DONE_COLUMN_ID, planBoardDrop, type BoardDropTarget, type BoardModel } from "../domain/board";
import { BOARD_GROUPS, type BoardGroupMode } from "../domain/types";
import { useList } from "../list/list-context";
import { useTasksState } from "../tasks-context";
import { ActiveFilters, FiltersPopover } from "../toolbar/tasks-toolbar";
import { BoardCardPreview } from "./board-card";
import { BoardColumnView } from "./board-column";
import { BoardContext, type BoardContextValue } from "./board-context";
import { DoneRail } from "./done-rail";
import type { BoardData } from "./use-board";

/*
 * P03 Tasks · Board. Toolbar (Group by · search · Filters · Show done), the
 * columns and the Done rail in one DndContext, and on phones a pager under
 * the snap pages. Mouse lifts after 4px, touch after a 250ms long-press (a
 * long-press released in place selects instead), the grip lifts with Space.
 * Scrollable columns auto-scroll while dragging near an edge. Decisions come
 * from planBoardDrop; this file is wiring.
 */

const LONG_PRESS_TOLERANCE = 8;

interface DragInfo {
  id: string;
  touch: boolean;
}

/** Cards win over the column they sit in; no pointer (keyboard) uses the closest corners. */
const detectCollisions: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCorners(args);
  const hits = pointerWithin(args);
  const cards = hits.filter((hit) => !String(hit.id).startsWith("column:"));
  return cards.length ? cards : hits;
};

function columnOfOver(over: Over | null): string | null {
  const data = over?.data.current as { columnId?: string } | undefined;
  return data?.columnId ?? null;
}

/** The (column, index) a drop over `over` means for the card `activeId`. */
function resolveTarget(model: BoardModel, activeId: string, over: Over | null): BoardDropTarget | null {
  const columnId = columnOfOver(over);
  if (!over || !columnId) return null;
  if (columnId === DONE_COLUMN_ID) return { columnId, index: 0 };
  const column = model.columns.find((item) => item.id === columnId);
  if (!column) return null;
  const ids = column.tasks.map((task) => task.id);
  const rest = ids.filter((id) => id !== activeId);
  const overId = String(over.id);
  if (overId.startsWith("column:")) return { columnId, index: rest.length };
  if (overId === activeId) return { columnId, index: Math.max(0, ids.indexOf(activeId)) };
  const at = rest.indexOf(overId);
  if (at < 0) return { columnId, index: 0 }; // an overdue card: the top
  const from = ids.indexOf(activeId);
  return { columnId, index: from >= 0 && from < ids.indexOf(overId) ? at + 1 : at };
}

export function TaskBoard({ board, searchRef }: { board: BoardData; searchRef: Ref<HTMLInputElement> }) {
  const t = useTranslations("Tasks.board");
  const { today, toggleSelected } = useTasksState();
  const { byId, actions } = useList();
  const { workHours } = usePlannerSettings();
  const reorder = useReorderTasks();
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [target, setTarget] = useState<BoardDropTarget | null>(null);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const { model } = board;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: LONG_PRESS_TOLERANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnTitle = useCallback(
    (over: Over | null) => {
      const id = columnOfOver(over);
      return id ? t(`columns.${id}` as "columns.today") : "";
    },
    [t],
  );
  const titleOf = useCallback((id: string | number) => byId.get(String(id))?.title ?? "", [byId]);

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => t("drag.start", { title: titleOf(active.id) }),
      onDragOver: ({ over }) => (over ? t("drag.over", { column: columnTitle(over) }) : undefined),
      onDragEnd: ({ active, over }) =>
        over ? t("drag.drop", { title: titleOf(active.id), column: columnTitle(over) }) : t("drag.cancel", { title: titleOf(active.id) }),
      onDragCancel: ({ active }) => t("drag.cancel", { title: titleOf(active.id) }),
    }),
    [t, titleOf, columnTitle],
  );

  const reset = () => {
    setDrag(null);
    setTarget(null);
  };

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    setDrag({ id: String(active.id), touch: activatorEvent.type.startsWith("touch") });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    setTarget(resolveTarget(model, String(active.id), over));
  };

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const id = String(active.id);
    const touch = drag?.touch ?? false;
    reset();
    // A long-press released where it began is the phone's "select".
    if (touch && Math.hypot(delta.x, delta.y) < LONG_PRESS_TOLERANCE) {
      toggleSelected(id);
      return;
    }
    const dropTarget = resolveTarget(model, id, over);
    const task = byId.get(id);
    if (!dropTarget || !task) return;
    const plan = planBoardDrop({ taskId: id, model, target: dropTarget, day: today, workHours });
    switch (plan.kind) {
      case "complete":
        actions.setDone(task, true);
        break;
      case "reorder":
        reorder.mutate({ ids: plan.ids });
        break;
      case "move":
        actions.update(task, plan.patch);
        break;
      default:
        if (plan.reason === "closed") toast({ tone: "neutral", title: t("closed") });
    }
  };

  const value = useMemo<BoardContextValue>(
    () => ({ ...board, activeId: drag?.id ?? null, target, doneExpanded, setDoneExpanded }),
    [board, drag, target, doneExpanded],
  );
  const activeTask = drag ? byId.get(drag.id) : undefined;

  return (
    <BoardContext.Provider value={value}>
      <BoardToolbar mode={board.mode} searchRef={searchRef} doneExpanded={doneExpanded} setDoneExpanded={setDoneExpanded} />
      <DndContext
        sensors={sensors}
        collisionDetection={detectCollisions}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t("drag.instructions") } }}
      >
        <BoardColumns model={model} />
        {/* Cards settle with their own layout spring, so the overlay itself drops instantly. */}
        <DragOverlay dropAnimation={null}>{activeTask ? <BoardCardPreview task={activeTask} /> : null}</DragOverlay>
      </DndContext>
    </BoardContext.Provider>
  );
}

function BoardColumns({ model }: { model: BoardModel }) {
  const t = useTranslations("Tasks.board");
  const reduced = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const pages = [...model.columns.map((column) => column.id as string), DONE_COLUMN_ID];

  const onScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    const center = root.getBoundingClientRect().left + root.clientWidth / 2;
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

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        role="region"
        aria-label={t("label")}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:snap-none lg:rounded-[28px] lg:bg-surface lg:p-3"
      >
        {model.columns.map((column) => (
          <BoardColumnView key={column.id} column={column} />
        ))}
        <DoneRail />
      </div>
      <nav aria-label={t("pager")} className="flex justify-center gap-1.5 lg:hidden">
        {pages.map((id, index) => (
          <button
            key={id}
            type="button"
            aria-label={t("page", { column: t(`columns.${id}` as "columns.today") })}
            aria-current={index === page ? "true" : undefined}
            onClick={() => goTo(index)}
            className="inline-flex size-6 items-center justify-center rounded-full focus-visible:focus-ring"
          >
            <span className={cn("h-1.5 rounded-pill transition-[width] duration-200 motion-reduce:transition-none", index === page ? "w-5 bg-primary" : "w-1.5 bg-border-strong")} />
          </button>
        ))}
      </nav>
    </div>
  );
}

interface BoardToolbarProps {
  mode: BoardGroupMode;
  searchRef: Ref<HTMLInputElement>;
  doneExpanded: boolean;
  setDoneExpanded(expanded: boolean): void;
}

function BoardToolbar({ mode, searchRef, doneExpanded, setDoneExpanded }: BoardToolbarProps) {
  const t = useTranslations("Tasks.board");
  const tToolbar = useTranslations("Tasks.toolbar");
  const tKeys = useTranslations("Tasks.keyboard");
  const { q, setQ, setGroup } = useTasksState();
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 lg:rounded-pill lg:bg-surface lg:p-2.5">
        <span className="hidden ps-2 text-xs font-semibold text-fg-muted lg:inline">{t("groupBy")}</span>
        <Segmented<BoardGroupMode>
          label={t("groupBy")}
          value={mode}
          onValueChange={(value) => setGroup(value === "horizon" ? null : value)}
          variant="neutral"
          size="sm"
          className="bg-canvas max-lg:bg-surface"
          options={BOARD_GROUPS.map((value) => ({ value, label: t(`groups.${value}`) }))}
        />
        <SearchField
          ref={searchRef}
          value={q}
          onValueChange={setQ}
          placeholder={tToolbar("search")}
          aria-label={tToolbar("search")}
          shortcut={tKeys("search")}
          className="hidden min-w-[200px] flex-1 lg:flex"
        />
        <span className="hidden lg:contents">
          <FiltersPopover />
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={doneExpanded}
          onClick={() => setDoneExpanded(!doneExpanded)}
          className="min-h-9 gap-1.5 bg-surface px-3.5 text-[13px] font-bold max-lg:ms-auto"
        >
          {doneExpanded ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
          {doneExpanded ? t("hideDone") : t("showDone")}
        </Button>
      </div>
      <ActiveFilters />
    </>
  );
}
