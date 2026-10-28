"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { TASK_CREATE_HREF } from "@/features/personal/routes";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import type { Task } from "@/data/domain";
import { TaskBoard } from "./board/task-board";
import { useBoard } from "./board/use-board";
import { BulkBar } from "./bulk/bulk-bar";
import { boardIds } from "./domain/board";
import { RescheduleSheet } from "./bulk/reschedule-sheet";
import type { TasksUrlState } from "./domain/url-state";
import { AddTaskRow } from "./list/add-task-row";
import { ListContext, type ListContextValue } from "./list/list-context";
import { visibleRows } from "./list/task-group";
import { TaskList } from "./list/task-list";
import { useListKeyboard } from "./list/use-list-keyboard";
import { useTaskActions } from "./list/use-task-actions";
import { pickTasksState, TasksLoading, TasksStateView } from "./states/tasks-states";
import { TasksProvider, useTasksState } from "./tasks-context";
import { TasksHeader, TasksToolbar } from "./toolbar/tasks-toolbar";
import { useTasksQuery } from "./use-tasks-query";

/*
 * P03 Tasks · List. Header, toolbar, filter chips, then the list card (or
 * one of its states), the floating bulk bar and the phone Reschedule sheet.
 * The page mounts it inside <Suspense> (the provider follows the URL).
 * ?view=board swaps the toolbar and list for the board (board/*).
 */

export interface TasksScreenProps {
  /** Tests and demos: keep the view in memory with these values instead of the URL. */
  demo?: { today?: string; initial?: Partial<TasksUrlState>; initialSelection?: readonly string[] };
}

export function TasksScreen({ demo }: TasksScreenProps) {
  return demo ? (
    <TasksProvider syncUrl={false} today={demo.today} initial={demo.initial} initialSelection={demo.initialSelection}>
      <TasksLayout />
    </TasksProvider>
  ) : (
    <TasksProvider>
      <TasksLayout />
    </TasksProvider>
  );
}

function TasksLayout() {
  const state = useTasksState();
  const data = useTasksQuery();
  const actions = useTaskActions();
  const desktop = useIsDesktop();
  const searchRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const [rescheduleIds, setRescheduleIds] = useState<readonly string[] | null>(null);
  const [doneShown, setDoneShown] = useState<Readonly<Record<string, boolean>>>({});

  const byId = useMemo(() => new Map<string, Task>(data.tasks.map((task) => [task.id, task])), [data.tasks]);
  const { phase } = actions.lifecycle;
  const { isGroupCollapsed } = state;
  const onBoard = state.layout === "board";
  const board = useBoard(data, onBoard);
  const visibleIds = useMemo(
    () =>
      onBoard ? boardIds(board.model, true) : data.groups.flatMap((group) =>
        isGroupCollapsed(group.id, group.collapsedByDefault)
          ? []
          : visibleRows(group, phase, doneShown[group.id] === true).map((task) => task.id),
      ),
    [onBoard, board.model, data.groups, isGroupCollapsed, phase, doneShown],
  );
  const router = useRouter();
  const focusAdd = useCallback(() => addRef.current?.focus(), []);
  const addFirst = () => (desktop ? focusAdd() : router.push(TASK_CREATE_HREF));

  const list = useMemo<ListContextValue>(
    () => ({
      data,
      actions,
      byId,
      visibleIds,
      openReschedule: (ids) => setRescheduleIds(ids),
      focusAdd,
      isDoneShown: (groupId) => doneShown[groupId] === true,
      toggleDoneShown: (groupId) => setDoneShown((current) => ({ ...current, [groupId]: !current[groupId] })),
    }),
    [data, actions, byId, visibleIds, focusAdd, doneShown],
  );

  useListKeyboard(list, searchRef, desktop);

  const kind = state.layout === "list" ? pickTasksState(data, state.tab) : null;

  return (
    <ListContext.Provider value={list}>
      <div data-screen="tasks" className="flex min-w-0 flex-col gap-4 lg:gap-[18px]">
        <TasksHeader />
        {onBoard ? (
          data.isPending ? (
            <TasksLoading />
          ) : data.isError ? (
            <TasksStateView kind="error" data={data} onAddFirst={addFirst} />
          ) : (
            <TaskBoard board={board} searchRef={searchRef} />
          )
        ) : (
          <>
            <TasksToolbar searchRef={searchRef} />
            {kind === "loading" ? (
              <TasksLoading />
            ) : kind ? (
              <TasksStateView kind={kind} data={data} onAddFirst={addFirst} />
            ) : (
              <TaskList addRef={addRef} />
            )}
            {/* In these states the add row stays reachable ("Add first task" focuses it). */}
            {kind === "empty" || kind === "today-clear" ? <AddTaskRow ref={addRef} /> : null}
          </>
        )}
      </div>
      <BulkBar />
      <RescheduleSheet ids={rescheduleIds} onClose={() => setRescheduleIds(null)} />
    </ListContext.Provider>
  );
}
