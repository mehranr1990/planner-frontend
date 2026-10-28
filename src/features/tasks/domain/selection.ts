/*
 * The selection model of the list: a pure state of ids in the order they were
 * picked plus the anchor a ⇧ range starts from. Every function returns a new
 * state; the same state is returned when nothing changed (cheap equality).
 */

export interface SelectionState {
  /** Selected ids, in selection order. */
  ids: readonly string[];
  /** Where a ⇧ range starts: the last id picked or toggled on. */
  anchor: string | null;
}

export const EMPTY_SELECTION: SelectionState = { ids: [], anchor: null };

export interface SelectModifiers {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export function isSelected(state: SelectionState, id: string): boolean {
  return state.ids.includes(id);
}

export function selectionSize(state: SelectionState): number {
  return state.ids.length;
}

/** ⌘ / Ctrl click, or the row checkbox: adds the id, or removes it when already in. */
export function toggle(state: SelectionState, id: string): SelectionState {
  if (state.ids.includes(id)) {
    const ids = state.ids.filter((item) => item !== id);
    return { ids, anchor: ids.length === 0 ? null : state.anchor === id ? ids[ids.length - 1]! : state.anchor };
  }
  return { ids: [...state.ids, id], anchor: id };
}

/**
 * ⇧ click: selects every visible row between the anchor and `id`, inclusive,
 * in addition to what is selected. Without an anchor (or when the anchor is
 * not visible) it selects `id` alone. The anchor stays, so the range can be
 * stretched again.
 */
export function selectRange(state: SelectionState, id: string, visibleIds: readonly string[]): SelectionState {
  const to = visibleIds.indexOf(id);
  const from = state.anchor === null ? -1 : visibleIds.indexOf(state.anchor);
  if (to < 0) return state;
  if (from < 0) return state.ids.includes(id) ? state : { ids: [...state.ids, id], anchor: id };
  const [low, high] = from <= to ? [from, to] : [to, from];
  const range = visibleIds.slice(low, high + 1);
  const ids = [...state.ids, ...range.filter((item) => !state.ids.includes(item))];
  return { ids, anchor: state.anchor };
}

/** The pointer rule: ⇧ extends a range, anything else (⌘, Ctrl, plain checkbox) toggles. */
export function select(
  state: SelectionState,
  id: string,
  visibleIds: readonly string[],
  modifiers: SelectModifiers = {},
): SelectionState {
  return modifiers.shiftKey ? selectRange(state, id, visibleIds) : toggle(state, id);
}

/** ⌘A inside a group: adds all of its ids. */
export function selectAll(state: SelectionState, ids: readonly string[]): SelectionState {
  const added = ids.filter((id) => !state.ids.includes(id));
  if (added.length === 0) return state;
  return { ids: [...state.ids, ...added], anchor: ids[ids.length - 1] ?? state.anchor };
}

/** Whether every one of `ids` is selected (for the group checkbox state). */
export function allSelected(state: SelectionState, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => state.ids.includes(id));
}

export function clearSelection(state: SelectionState): SelectionState {
  return state.ids.length === 0 && state.anchor === null ? state : EMPTY_SELECTION;
}

/** Drops ids that are no longer in the data (a task completed away, deleted or filtered out). */
export function pruneSelection(state: SelectionState, existingIds: ReadonlySet<string> | readonly string[]): SelectionState {
  const exists = (id: string) => (Array.isArray(existingIds) ? existingIds.includes(id) : (existingIds as ReadonlySet<string>).has(id));
  const ids = state.ids.filter(exists);
  if (ids.length === state.ids.length && (state.anchor === null || exists(state.anchor))) return state;
  if (ids.length === 0) return EMPTY_SELECTION;
  return { ids, anchor: state.anchor !== null && exists(state.anchor) ? state.anchor : ids[ids.length - 1]! };
}
