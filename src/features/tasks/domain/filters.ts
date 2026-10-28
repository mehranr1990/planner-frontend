import type { EnergyLevel, Scope, TaskFilters, TaskPriority } from "@/data/domain";
import { hasActiveFilters, normalizeFilters } from "@/data/task-query";

/*
 * Filters as the person sees them: URL params (readable, shareable), removable
 * chips ("Area: Personal, Health ×", "Energy: Low–Medium ×") and the count on
 * the Filters button. The words come from messages in the UI; this module
 * only says which filter holds which values.
 *
 *   ?area=home&area=health   (or area=home,health)   area ids
 *   ?context=personal,project                        scopes
 *   ?priority=urgent,high   ?energy=low,medium
 *   ?label=design           ?dated=1 (has a date) | dated=0 (no date)
 *   ?recurring=1
 */

export type FilterKind = "area" | "context" | "priority" | "energy" | "labels" | "hasDate" | "recurring";

/** Filters that hold a list of values. */
export type ListFilterKind = "area" | "context" | "priority" | "energy" | "labels";

export const FILTER_KINDS: readonly FilterKind[] = ["area", "context", "priority", "energy", "labels", "hasDate", "recurring"];

/** The URL param of each filter. */
export const FILTER_PARAMS: Record<FilterKind, string> = {
  area: "area",
  context: "context",
  priority: "priority",
  energy: "energy",
  labels: "label",
  hasDate: "dated",
  recurring: "recurring",
};

export const SCOPES: readonly Scope[] = ["personal", "project", "team", "company"];
export const PRIORITIES: readonly TaskPriority[] = ["urgent", "high", "medium", "low"];
export const ENERGIES: readonly EnergyLevel[] = ["low", "medium", "high"];

const FIELD = {
  area: "areaIds",
  context: "scopes",
  priority: "priorities",
  energy: "energies",
  labels: "labels",
} as const satisfies Record<ListFilterKind, keyof TaskFilters>;

/** What `URLSearchParams` and Next's `useSearchParams()` both offer. */
export interface ParamReader {
  get(name: string): string | null;
  getAll(name: string): string[];
}

export const NO_FILTERS: TaskFilters = {};

function listParam(params: ParamReader, name: string): string[] {
  const values = params
    .getAll(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

function onlyKnown<T extends string>(values: string[], known: readonly T[]): T[] {
  return values.filter((value): value is T => (known as readonly string[]).includes(value));
}

function flag(value: string | null): boolean | undefined {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}

/** Reads the filter params; unknown values are ignored. The result is normalised (empty when none). */
export function filtersFromParams(params: ParamReader): TaskFilters {
  const filters: TaskFilters = {
    areaIds: listParam(params, FILTER_PARAMS.area),
    scopes: onlyKnown(listParam(params, FILTER_PARAMS.context), SCOPES),
    priorities: onlyKnown(listParam(params, FILTER_PARAMS.priority), PRIORITIES),
    energies: onlyKnown(listParam(params, FILTER_PARAMS.energy), ENERGIES),
    labels: listParam(params, FILTER_PARAMS.labels),
  };
  const hasDate = flag(params.get(FILTER_PARAMS.hasDate));
  if (hasDate !== undefined) filters.hasDate = hasDate;
  if (flag(params.get(FILTER_PARAMS.recurring))) filters.recurring = true;
  return normalizeFilters(filters) ?? NO_FILTERS;
}

/** Writes the filters into `params` (removing every filter param first). Lists use repeated params. */
export function writeFiltersToParams(params: URLSearchParams, filters: TaskFilters | undefined): void {
  for (const kind of FILTER_KINDS) params.delete(FILTER_PARAMS[kind]);
  const normalized = normalizeFilters(filters);
  if (!normalized) return;
  for (const kind of ["area", "context", "priority", "energy", "labels"] as const) {
    for (const value of normalized[FIELD[kind]] ?? []) params.append(FILTER_PARAMS[kind], value);
  }
  if (normalized.hasDate !== undefined) params.set(FILTER_PARAMS.hasDate, normalized.hasDate ? "1" : "0");
  if (normalized.recurring) params.set(FILTER_PARAMS.recurring, "1");
}

export function isFiltersEmpty(filters: TaskFilters | undefined): boolean {
  return !hasActiveFilters(filters);
}

/** The values chosen for one list filter. */
export function filterValues(filters: TaskFilters, kind: ListFilterKind): readonly string[] {
  return filters[FIELD[kind]] ?? [];
}

/** Adds the value to a list filter, or removes it when present. */
export function toggleFilterValue(filters: TaskFilters, kind: ListFilterKind, value: string): TaskFilters {
  const field = FIELD[kind];
  const current = (filters[field] ?? []) as string[];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return normalizeFilters({ ...filters, [field]: next }) ?? NO_FILTERS;
}

/** Replaces a list filter's values (empty clears it). */
export function setFilterValues(filters: TaskFilters, kind: ListFilterKind, values: readonly string[]): TaskFilters {
  return normalizeFilters({ ...filters, [FIELD[kind]]: [...values] }) ?? NO_FILTERS;
}

/** `hasDate`: true / false / undefined (any). `recurring`: true / undefined. */
export function setFilterFlag(filters: TaskFilters, kind: "hasDate" | "recurring", value: boolean | undefined): TaskFilters {
  const next: TaskFilters = { ...filters };
  if (kind === "hasDate") {
    if (value === undefined) delete next.hasDate;
    else next.hasDate = value;
  } else if (value) next.recurring = true;
  else delete next.recurring;
  return normalizeFilters(next) ?? NO_FILTERS;
}

/** Clears one whole filter (the chip's ×). */
export function removeFilter(filters: TaskFilters, kind: FilterKind): TaskFilters {
  if (kind === "hasDate" || kind === "recurring") return setFilterFlag(filters, kind, undefined);
  return setFilterValues(filters, kind, []);
}

export function clearFilters(): TaskFilters {
  return NO_FILTERS;
}

/** How many filters are on (the badge on "Filters"): one per kind, however many values. */
export function activeFilterCount(filters: TaskFilters | undefined): number {
  const normalized = normalizeFilters(filters);
  if (!normalized) return 0;
  return FILTER_KINDS.filter((kind) => filterIsOn(normalized, kind)).length;
}

function filterIsOn(filters: TaskFilters, kind: FilterKind): boolean {
  if (kind === "hasDate") return filters.hasDate !== undefined;
  if (kind === "recurring") return Boolean(filters.recurring);
  return filterValues(filters, kind).length > 0;
}

export interface FilterChip {
  kind: FilterKind;
  /** Raw values: area ids, scopes, priorities, energies, labels; "yes" / "no" for the date flag, "yes" for recurring. */
  values: readonly string[];
  /** Energy only: the chip reads "Low–Medium" when the values are adjacent levels. */
  range?: readonly [EnergyLevel, EnergyLevel];
}

/** One removable chip per active filter, in the order of the Filters panel. */
export function filterChips(filters: TaskFilters | undefined): FilterChip[] {
  const normalized = normalizeFilters(filters);
  if (!normalized) return [];
  const chips: FilterChip[] = [];
  for (const kind of FILTER_KINDS) {
    if (!filterIsOn(normalized, kind)) continue;
    if (kind === "hasDate") chips.push({ kind, values: [normalized.hasDate ? "yes" : "no"] });
    else if (kind === "recurring") chips.push({ kind, values: ["yes"] });
    else if (kind === "energy") {
      const levels = ENERGIES.filter((level) => normalized.energies?.includes(level));
      const first = ENERGIES.indexOf(levels[0]!);
      const adjacent = levels.length >= 2 && ENERGIES.indexOf(levels[levels.length - 1]!) - first === levels.length - 1;
      chips.push(adjacent ? { kind, values: levels, range: [levels[0]!, levels[levels.length - 1]!] } : { kind, values: levels });
    } else if (kind === "priority") {
      chips.push({ kind, values: PRIORITIES.filter((priority) => normalized.priorities?.includes(priority)) });
    } else if (kind === "context") {
      chips.push({ kind, values: SCOPES.filter((scope) => normalized.scopes?.includes(scope)) });
    } else {
      chips.push({ kind, values: filterValues(normalized, kind) });
    }
  }
  return chips;
}
