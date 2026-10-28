import type { Task, TaskFilters, TaskPriority, TaskSort } from "./domain";
import type { TaskCounts, TaskQuery, TaskView } from "./repositories";

/*
 * Pure filtering, searching, sorting and counting of tasks. The mock adapter
 * runs it over its store; a real API adapter can run the same rules over a
 * fetched page (or be replaced by the server's own). No Date objects, no
 * clock: callers pass the planner's "today".
 */

export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Rank of a task's priority; no priority sorts after "low". */
export function priorityRank(task: Pick<Task, "priority">): number {
  return task.priority ? PRIORITY_RANK[task.priority] : 4;
}

// ── Views ────────────────────────────────────────────────────────────────

/**
 * today = dated `day` (any status) plus open overdue; upcoming = open and
 * dated after `day`; completed = done; all = everything. No view: the tasks
 * dated `day`.
 */
export function matchesView(task: Task, view: TaskView | undefined, day: string): boolean {
  switch (view) {
    case "today":
      return task.date === day || (task.status === "open" && task.date !== null && task.date < day);
    case "upcoming":
      return task.status === "open" && task.date !== null && task.date > day;
    case "completed":
      return task.status === "done";
    case "all":
      return true;
    default:
      return task.date === day;
  }
}

/** An open task dated before `day`. */
export function isOverdue(task: Pick<Task, "status" | "date">, day: string): boolean {
  return task.status === "open" && task.date !== null && task.date < day;
}

// ── Search ───────────────────────────────────────────────────────────────

const ch = (code: number) => String.fromCharCode(code);
const charClass = (...codes: number[]) => new RegExp(`[${codes.map(ch).join("")}]`, "g");

const ARABIC_YEH = charClass(0x064a, 0x0649); // Arabic yeh, alef maksura
const ARABIC_KAF = charClass(0x0643);
const ARABIC_HEH = charClass(0x06c0, 0x0629); // heh with yeh above, teh marbuta
const PERSIAN_DIGIT = charClass(...Array.from({ length: 10 }, (_, i) => 0x06f0 + i));
const ARABIC_DIGIT = charClass(...Array.from({ length: 10 }, (_, i) => 0x0660 + i));
/** Harakat and dagger alef, tatweel, ZWNJ / ZWJ and the bidi marks. */
const IGNORABLE = charClass(
  ...Array.from({ length: 0x065f - 0x064b + 1 }, (_, i) => 0x064b + i),
  0x0670,
  0x0640,
  0x200c,
  0x200d,
  0x200e,
  0x200f,
);

/**
 * Search-folds text: lower case, Latin digits, Persian yeh/kaf for the Arabic
 * forms, no diacritics, tatweel or zero-width joiners (so a search for
 * the Persian word without its half-space finds the one with it), single spaces.
 */
export function normalizeSearchText(text: string): string {
  return text
    .replace(PERSIAN_DIGIT, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(ARABIC_DIGIT, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(ARABIC_YEH, ch(0x06cc))
    .replace(ARABIC_KAF, ch(0x06a9))
    .replace(ARABIC_HEH, ch(0x0647))
    .replace(IGNORABLE, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The folded terms of a query; empty when there is nothing to search for. */
export function searchTerms(search: string | undefined): string[] {
  const folded = normalizeSearchText(search ?? "");
  return folded ? folded.split(" ") : [];
}

function haystack(task: Task): string {
  return normalizeSearchText([task.title, task.project, task.area?.name, ...(task.labels ?? [])].filter(Boolean).join(" "));
}

export function matchesSearch(task: Task, search: string | undefined): boolean {
  const terms = searchTerms(search);
  if (terms.length === 0) return true;
  const text = haystack(task);
  return terms.every((term) => text.includes(term));
}

// ── Filters ──────────────────────────────────────────────────────────────

/** True when the filters would narrow anything. */
export function hasActiveFilters(filters: TaskFilters | undefined): boolean {
  if (!filters) return false;
  return (
    Boolean(filters.areaIds?.length) ||
    Boolean(filters.scopes?.length) ||
    Boolean(filters.priorities?.length) ||
    Boolean(filters.energies?.length) ||
    Boolean(filters.labels?.length) ||
    filters.hasDate !== undefined ||
    Boolean(filters.recurring)
  );
}

export function matchesFilters(task: Task, filters: TaskFilters | undefined): boolean {
  if (!filters) return true;
  if (filters.areaIds?.length && !(task.area && filters.areaIds.includes(task.area.id))) return false;
  if (filters.scopes?.length && !filters.scopes.includes(task.scope)) return false;
  if (filters.priorities?.length && !(task.priority && filters.priorities.includes(task.priority))) return false;
  if (filters.energies?.length && !(task.energy && filters.energies.includes(task.energy))) return false;
  if (filters.labels?.length) {
    const labels = (task.labels ?? []).map(normalizeSearchText);
    if (!filters.labels.some((label) => labels.includes(normalizeSearchText(label)))) return false;
  }
  if (filters.hasDate !== undefined && (task.date !== null) !== filters.hasDate) return false;
  if (filters.recurring && !task.recurring) return false;
  return true;
}

/**
 * A stable form of the filters for cache keys and comparison: empty fields
 * dropped, values de-duplicated and sorted. null when nothing is active.
 */
export function normalizeFilters(filters: TaskFilters | undefined): TaskFilters | null {
  if (!hasActiveFilters(filters)) return null;
  const f = filters!;
  const list = <T extends string>(values: readonly T[] | undefined): T[] | undefined =>
    values?.length ? [...new Set(values)].sort() : undefined;
  const normalized: TaskFilters = {};
  const areaIds = list(f.areaIds);
  const scopes = list(f.scopes);
  const priorities = list(f.priorities);
  const energies = list(f.energies);
  const labels = list(f.labels);
  if (areaIds) normalized.areaIds = areaIds;
  if (scopes) normalized.scopes = scopes;
  if (priorities) normalized.priorities = priorities;
  if (energies) normalized.energies = energies;
  if (labels) normalized.labels = labels;
  if (f.hasDate !== undefined) normalized.hasDate = f.hasDate;
  if (f.recurring) normalized.recurring = true;
  return normalized;
}

// ── Sorting ──────────────────────────────────────────────────────────────

/** Ascending; null and undefined sort last. */
function compareNullable<T extends string | number>(a: T | null | undefined, b: T | null | undefined): number {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Newest first; a missing instant sorts last. */
function compareNewestFirst(a: string | undefined, b: string | undefined): number {
  if (!a || !b) return compareNullable(a || null, b || null);
  return Date.parse(b) - Date.parse(a);
}

/**
 * Smart: overdue first, then day, time (timed before untimed), the manual
 * order where one was set (ordered before unordered), priority, title.
 */
function compareSmart(day: string) {
  return (a: Task, b: Task): number =>
    Number(!isOverdue(a, day)) - Number(!isOverdue(b, day)) ||
    compareNullable(a.date, b.date) ||
    compareNullable(a.time, b.time) ||
    compareNullable(a.order, b.order) ||
    priorityRank(a) - priorityRank(b) ||
    a.title.localeCompare(b.title, "en");
}

function compareManual(day: string) {
  const smart = compareSmart(day);
  return (a: Task, b: Task): number => compareNullable(a.order, b.order) || smart(a, b);
}

/**
 * Sorts a copy. smart = overdue, day, time, manual order, priority; manual =
 * by `order` (unordered after, smart among them); priority = urgent first;
 * duration = shortest first (unknown last); created = newest first. Every
 * sort falls back to smart for ties. In the completed view "smart" means
 * newest completion first.
 */
export function sortTasks(tasks: readonly Task[], sort: TaskSort, day: string, view?: TaskView): Task[] {
  const smart = compareSmart(day);
  const byCompletion = (a: Task, b: Task) => compareNewestFirst(a.completedAt, b.completedAt);
  let compare: (a: Task, b: Task) => number;
  switch (sort) {
    case "manual":
      compare = compareManual(day);
      break;
    case "priority":
      compare = (a, b) => priorityRank(a) - priorityRank(b) || smart(a, b);
      break;
    case "duration":
      compare = (a, b) => compareNullable(a.durationMinutes, b.durationMinutes) || smart(a, b);
      break;
    case "created":
      compare = (a, b) => compareNewestFirst(a.createdAt, b.createdAt) || smart(a, b);
      break;
    default:
      compare = smart;
  }
  if (view === "completed" && sort === "smart") compare = (a, b) => byCompletion(a, b) || smart(a, b);
  return [...tasks].sort(compare);
}

// ── Query ────────────────────────────────────────────────────────────────

export interface TaskQueryContext {
  /** The planner's today. */
  today: string;
}

/** Tasks matching the query's view, status, filters and search (not sorted). */
export function filterTasks(tasks: readonly Task[], query: TaskQuery, { today }: TaskQueryContext): Task[] {
  const day = query.day ?? today;
  // No view and no day: everything (the "all" view).
  const view = query.view ?? (query.day ? undefined : "all");
  return tasks.filter(
    (task) =>
      matchesView(task, view, day) &&
      (!query.status || task.status === query.status) &&
      matchesFilters(task, query.filters) &&
      matchesSearch(task, query.search),
  );
}

/** Badge counts: the tasks of each view after filters and search. */
export function countTasks(
  tasks: readonly Task[],
  query: Pick<TaskQuery, "day" | "filters" | "search">,
  { today }: TaskQueryContext,
): TaskCounts {
  const day = query.day ?? today;
  const narrowed = tasks.filter((task) => matchesFilters(task, query.filters) && matchesSearch(task, query.search));
  const count = (view: TaskView) => narrowed.filter((task) => matchesView(task, view, day)).length;
  return { today: count("today"), upcoming: count("upcoming"), all: narrowed.length, completed: count("completed") };
}
