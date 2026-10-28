"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPlannerToday } from "@/data/clock";
import type { TaskFilters, TaskSort } from "@/data/domain";
import { NO_FILTERS } from "./domain/filters";
import {
  clearSelection as clearSelectionState,
  EMPTY_SELECTION,
  isSelected as isSelectedIn,
  pruneSelection as pruneSelectionState,
  select as selectIn,
  selectAll as selectAllIn,
  toggle as toggleIn,
  type SelectionState,
  type SelectModifiers,
} from "./domain/selection";
import type { TasksGroup, TasksLayout, TasksTab } from "./domain/types";
import {
  DEFAULT_TASKS_STATE,
  effectiveGroup,
  parseTasksUrlState,
  writeTasksUrlState,
  type TasksUrlState,
} from "./domain/url-state";

/*
 * UI state of the Tasks screen. The view of the list (layout, tab, group,
 * sort, search, filters) is mirrored to the URL with router.replace, only
 * values that differ from the defaults (see domain/url-state.ts for the
 * contract, including the older ?view=board&group=horizon link). Everything
 * else (selection, the row being edited, the focused row, collapsed groups)
 * is local. Server data lives in the repositories; the screen's query is
 * built by useTasksQuery (use-tasks-query.ts).
 *
 * The local state updates instantly and follows the URL whenever it changes
 * under us (links, back/forward). Typing in search is written to the URL
 * after a short pause, so each keystroke is not a navigation. The URL-synced
 * provider reads useSearchParams(): mount it inside <Suspense>. Tests, demo
 * pages and the styleguide pass `syncUrl={false}`.
 */

/** How long typing pauses before the search text is written to the URL. */
export const SEARCH_URL_DEBOUNCE_MS = 300;

export interface TasksContextValue {
  /** The planner's today. */
  today: string;

  // ── The view (URL-synced) ──
  layout: TasksLayout;
  tab: TasksTab;
  /** The grouping the person chose; null while the default applies. */
  group: TasksGroup | null;
  /** The grouping in effect: the chosen one, else the default for the layout and tab. */
  effectiveGroup: TasksGroup;
  sort: TaskSort;
  /** Search text as typed (the URL follows after a pause). */
  q: string;
  filters: TaskFilters;
  setLayout(layout: TasksLayout): void;
  /** Also clears the selection and the row being edited. */
  setTab(tab: TasksTab): void;
  /** null returns to the default grouping. */
  setGroup(group: TasksGroup | null): void;
  setSort(sort: TaskSort): void;
  setQ(q: string): void;
  setFilters(filters: TaskFilters | ((current: TaskFilters) => TaskFilters)): void;
  clearFilters(): void;

  // ── Selection ──
  selection: SelectionState;
  /** Selected ids, in the order they were picked. */
  selectedIds: readonly string[];
  isSelected(id: string): boolean;
  /** Pointer rule: ⇧ extends a range over `visibleIds`, anything else toggles. */
  select(id: string, visibleIds: readonly string[], modifiers?: SelectModifiers): void;
  toggleSelected(id: string): void;
  /** ⌘A: adds all of `ids` (a group's tasks). */
  selectAll(ids: readonly string[]): void;
  clearSelection(): void;
  /** Drops selected ids that are no longer in the data. */
  pruneSelection(existingIds: ReadonlySet<string> | readonly string[]): void;

  // ── Rows ──
  /** The row with its inline editor open. */
  expandedId: string | null;
  setExpandedId(id: string | null): void;
  /** The row keyboard navigation is on (J / K). */
  focusedId: string | null;
  setFocusedId(id: string | null): void;

  // ── Groups ──
  isGroupCollapsed(groupId: string, collapsedByDefault?: boolean): boolean;
  toggleGroup(groupId: string, collapsedByDefault?: boolean): void;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function useTasksState(): TasksContextValue {
  const value = useContext(TasksContext);
  if (!value) throw new Error("useTasksState must be used inside <TasksProvider>.");
  return value;
}

// ── View state: URL-synced or local ──────────────────────────────────────

interface ViewState {
  state: TasksUrlState;
  /** The latest state, also between two changes made in the same event. */
  read(): TasksUrlState;
  /** Applies a change to the latest state; `immediate: false` leaves the URL for the debounced write. */
  update(change: (current: TasksUrlState) => TasksUrlState, immediate?: boolean): void;
}

/** Keeps the latest state readable from event handlers (two setters in one event must not overwrite each other). */
function useLatest(state: TasksUrlState): { read(): TasksUrlState; remember(next: TasksUrlState): void } {
  const latestRef = useRef(state);
  useEffect(() => {
    latestRef.current = state;
  }, [state]);
  return useMemo(
    () => ({
      read: () => latestRef.current,
      remember: (next) => {
        latestRef.current = next;
      },
    }),
    [],
  );
}

function useUrlViewState(): ViewState {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const urlState = parseTasksUrlState(params);

  const [state, setState] = useState(urlState);
  // The last search text we wrote or adopted: the URL echoing it back must not undo newer typing.
  const [sentQ, setSentQ] = useState(urlState.q);
  const [seen, setSeen] = useState(search);
  if (seen !== search) {
    setSeen(search);
    const adoptQ = urlState.q !== sentQ;
    setState({ ...urlState, q: adoptQ ? urlState.q : state.q });
    if (adoptQ) setSentQ(urlState.q);
  }

  const write = useCallback(
    (next: TasksUrlState) => {
      const query = writeTasksUrlState(search, next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, search],
  );

  const latest = useLatest(state);
  const update = useCallback(
    (change: (current: TasksUrlState) => TasksUrlState, immediate = true) => {
      const next = change(latest.read());
      latest.remember(next);
      setState(next);
      if (immediate) {
        setSentQ(next.q);
        write(next);
      }
    },
    [write, latest],
  );

  // Typing: write once the person pauses.
  useEffect(() => {
    if (state.q === sentQ) return;
    const timer = setTimeout(() => {
      setSentQ(state.q);
      write(state);
    }, SEARCH_URL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, sentQ, write]);

  return { state, read: latest.read, update };
}

function useLocalViewState(initial: Partial<TasksUrlState> | undefined): ViewState {
  const [state, setState] = useState<TasksUrlState>({ ...DEFAULT_TASKS_STATE, ...initial });
  const latest = useLatest(state);
  const update = useCallback(
    (change: (current: TasksUrlState) => TasksUrlState) => {
      const next = change(latest.read());
      latest.remember(next);
      setState(next);
    },
    [latest],
  );
  return { state, read: latest.read, update };
}

// ── Provider ─────────────────────────────────────────────────────────────

interface ProviderBaseProps {
  children: ReactNode;
  /** Demo harnesses and tests: another "today" than the planner clock's. */
  today?: string;
  initialSelection?: readonly string[];
  initialExpandedId?: string | null;
  initialCollapsedGroups?: Readonly<Record<string, boolean>>;
}

export type TasksProviderProps =
  | (ProviderBaseProps & { syncUrl?: true; initial?: never })
  | (ProviderBaseProps & { syncUrl: false; initial?: Partial<TasksUrlState> });

export function TasksProvider(props: TasksProviderProps) {
  const today = props.today ?? getPlannerToday();
  return props.syncUrl === false ? (
    <LocalProvider {...props} today={today} />
  ) : (
    <UrlProvider {...props} today={today} />
  );
}

type InnerProps = ProviderBaseProps & { today: string };

function UrlProvider(props: InnerProps) {
  const view = useUrlViewState();
  return <StateProvider view={view} {...props} />;
}

function LocalProvider({ initial, ...props }: InnerProps & { initial?: Partial<TasksUrlState> }) {
  const view = useLocalViewState(initial);
  return <StateProvider view={view} {...props} />;
}

function StateProvider({
  children,
  view,
  today,
  initialSelection,
  initialExpandedId = null,
  initialCollapsedGroups,
}: InnerProps & { view: ViewState }) {
  const { state, read, update } = view;
  const [selection, setSelection] = useState<SelectionState>(
    initialSelection?.length ? { ids: [...initialSelection], anchor: initialSelection[initialSelection.length - 1]! } : EMPTY_SELECTION,
  );
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Readonly<Record<string, boolean>>>(initialCollapsedGroups ?? {});

  const value = useMemo<TasksContextValue>(() => {
    const change = (patch: Partial<TasksUrlState>) => update((current) => ({ ...current, ...patch }));
    const clearRows = () => {
      setSelection(EMPTY_SELECTION);
      setExpandedId(null);
    };
    const collapsedNow = (groupId: string, byDefault = false) => collapsed[groupId] ?? byDefault;
    return {
      today,
      layout: state.layout,
      tab: state.tab,
      group: state.group,
      effectiveGroup: effectiveGroup(state),
      sort: state.sort,
      q: state.q,
      filters: state.filters,
      setLayout: (layout) => {
        if (layout === read().layout) return;
        // A group that does not fit the other layout would be dropped from the URL anyway.
        clearRows();
        change({ layout });
      },
      setTab: (tab) => {
        if (tab === read().tab) return;
        clearRows();
        change({ tab });
      },
      setGroup: (group) => change({ group }),
      setSort: (sort) => change({ sort }),
      setQ: (q) => update((current) => ({ ...current, q }), false),
      setFilters: (next) =>
        update((current) => ({ ...current, filters: typeof next === "function" ? next(current.filters) : next })),
      clearFilters: () => change({ filters: NO_FILTERS }),

      selection,
      selectedIds: selection.ids,
      isSelected: (id) => isSelectedIn(selection, id),
      select: (id, visibleIds, modifiers) => setSelection((current) => selectIn(current, id, visibleIds, modifiers)),
      toggleSelected: (id) => setSelection((current) => toggleIn(current, id)),
      selectAll: (ids) => setSelection((current) => selectAllIn(current, ids)),
      clearSelection: () => setSelection((current) => clearSelectionState(current)),
      pruneSelection: (existingIds) => setSelection((current) => pruneSelectionState(current, existingIds)),

      expandedId,
      setExpandedId,
      focusedId,
      setFocusedId,

      isGroupCollapsed: (groupId, byDefault) => collapsedNow(groupId, byDefault),
      toggleGroup: (groupId, byDefault) =>
        setCollapsed((current) => ({ ...current, [groupId]: !(current[groupId] ?? byDefault ?? false) })),
    };
  }, [state, read, update, today, selection, expandedId, focusedId, collapsed]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}
