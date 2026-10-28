"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type RefObject } from "react";
import { TASK_CREATE_HREF, taskDetailHref } from "@/features/personal/routes";
import { isTypingTarget, nextFocusIndex, resolveShortcut, type TasksAction } from "../domain/keyboard";
import { useTasksState } from "../tasks-context";
import type { ListContextValue } from "./list-context";
import { rowTitleId } from "./task-row";

/*
 * The list's keyboard map (domain/keyboard.ts) on the document: N new · /
 * search · J K move · X select · E edit · D / S Reschedule (shared) · 1–4 priority · ⌘↵ complete ·
 * B Board · Space detail · ⌘A select the group · Esc clear. Nothing fires
 * over a dialog, sheet or menu, or while typing (⌘↵ excepted).
 */

const OVERLAY = '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

export function useListKeyboard(
  list: ListContextValue,
  searchRef: RefObject<HTMLInputElement | null>,
  desktop: boolean,
) {
  const state = useTasksState();
  const router = useRouter();
  // The handler reads the latest values without re-subscribing on every render.
  const latest = useRef({ state, list, desktop });
  useEffect(() => {
    latest.current = { state, list, desktop };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { state: s, list: l, desktop: isDesktop } = latest.current;
      const action = resolveShortcut(event, {
        typing: isTypingTarget(event.target as HTMLElement | null),
        hasSelection: s.selectedIds.length > 0,
        overlayOpen: document.querySelector(OVERLAY) !== null,
      });
      if (!action) return;
      if (run(action, s, l, isDesktop)) event.preventDefault();
    };

    const focusRow = (id: string) => document.getElementById(rowTitleId(id))?.focus();

    const run = (action: TasksAction, s: typeof state, l: ListContextValue, isDesktop: boolean): boolean => {
      const focused = s.focusedId && l.byId.get(s.focusedId) ? s.focusedId : null;
      const targets = s.selectedIds.length ? s.selectedIds : focused ? [focused] : [];
      const targetTasks = targets.map((id) => l.byId.get(id)).filter((task) => task !== undefined);
      switch (action.type) {
        case "new":
          if (isDesktop && s.tab !== "completed") l.focusAdd();
          else router.push(TASK_CREATE_HREF);
          return true;
        case "search":
          searchRef.current?.focus();
          return Boolean(searchRef.current);
        case "move": {
          const ids = l.visibleIds;
          const index = nextFocusIndex(focused ? ids.indexOf(focused) : -1, ids.length, action.delta);
          const id = ids[index];
          if (!id) return false;
          s.setFocusedId(id);
          focusRow(id);
          return true;
        }
        case "select":
          if (!focused) return false;
          s.toggleSelected(focused);
          return true;
        case "edit":
          if (!focused || !isDesktop) return false;
          s.setExpandedId(focused);
          return true;
        case "date":
        case "schedule":
          if (!targets.length) return false;
          l.openReschedule(targets, focused ? document.getElementById(rowTitleId(focused)) : null);
          return true;
        case "priority":
          if (!targetTasks.length) return false;
          l.actions.updateMany(targetTasks, { priority: action.priority });
          return true;
        case "complete":
          if (!targetTasks.length) return false;
          l.actions.completeMany(targetTasks);
          s.clearSelection();
          return true;
        case "toggle-layout":
          s.setLayout(s.layout === "list" ? "board" : "list");
          return true;
        case "open-detail":
          if (!focused) return false;
          router.push(taskDetailHref(focused));
          return true;
        case "select-all": {
          const group = l.data.groups.find((item) => item.tasks.some((task) => task.id === focused));
          s.selectAll(group ? group.tasks.map((task) => task.id) : l.visibleIds);
          return true;
        }
        case "clear":
          s.clearSelection();
          return true;
        default:
          return false;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, searchRef]);
}
