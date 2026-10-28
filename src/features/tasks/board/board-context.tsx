"use client";

import { createContext, useContext } from "react";
import type { BoardDropTarget } from "../domain/board";
import type { BoardData } from "./use-board";

/* What the board's columns read: the model, the drag in progress and the Done rail state. */

export interface BoardContextValue extends BoardData {
  /** The card being dragged. */
  activeId: string | null;
  /** Where it would land (the hatched ghost). */
  target: BoardDropTarget | null;
  doneExpanded: boolean;
  setDoneExpanded(expanded: boolean): void;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useBoardContext must be used inside the task board.");
  return value;
}

export const columnDropId = (columnId: string) => `column:${columnId}`;
