import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  clearFilters,
  filterChips,
  filtersFromParams,
  isFiltersEmpty,
  removeFilter,
  setFilterFlag,
  setFilterValues,
  toggleFilterValue,
  writeFiltersToParams,
} from "./filters";

const params = (search: string) => new URLSearchParams(search);
const written = (filters: Parameters<typeof writeFiltersToParams>[1]) => {
  const target = new URLSearchParams("sheet=quick-add");
  writeFiltersToParams(target, filters);
  return target.toString();
};

describe("filters ↔ URL", () => {
  it("reads repeated and comma-separated params, ignoring unknown values", () => {
    expect(filtersFromParams(params("area=home&area=health&context=personal,bogus&priority=high&energy=low,medium&label=design"))).toEqual({
      areaIds: ["health", "home"],
      scopes: ["personal"],
      priorities: ["high"],
      energies: ["low", "medium"],
      labels: ["design"],
    });
    expect(filtersFromParams(params("area=home,health"))).toEqual({ areaIds: ["health", "home"] });
  });

  it("reads the date and recurring flags", () => {
    expect(filtersFromParams(params("dated=1&recurring=1"))).toEqual({ hasDate: true, recurring: true });
    expect(filtersFromParams(params("dated=0"))).toEqual({ hasDate: false });
    expect(filtersFromParams(params("dated=maybe&recurring=0"))).toEqual({});
    expect(filtersFromParams(params(""))).toEqual({});
  });

  it("writes readable repeated params, replaces old ones and keeps other params", () => {
    expect(written({ areaIds: ["home", "health"], energies: ["low", "medium"], hasDate: true })).toBe(
      "sheet=quick-add&area=health&area=home&energy=low&energy=medium&dated=1",
    );
    const target = params("area=old&sheet=x&recurring=1");
    writeFiltersToParams(target, { priorities: ["urgent"] });
    expect(target.toString()).toBe("sheet=x&priority=urgent");
    expect(written({})).toBe("sheet=quick-add");
    expect(written(undefined)).toBe("sheet=quick-add");
  });

  it("round-trips", () => {
    const filters = { areaIds: ["home"], scopes: ["project" as const], labels: ["a b", "c,d"], hasDate: false, recurring: true };
    const target = new URLSearchParams();
    writeFiltersToParams(target, filters);
    // Labels with a comma split on reading: only the plain ones round-trip.
    expect(filtersFromParams(new URLSearchParams(target.toString())).labels).toEqual(["a b", "c", "d"]);
    expect(filtersFromParams(new URLSearchParams(target.toString()))).toMatchObject({ areaIds: ["home"], scopes: ["project"], hasDate: false, recurring: true });
  });
});

describe("filter edits", () => {
  it("toggles a value in and out and drops a field that empties", () => {
    const one = toggleFilterValue({}, "area", "home");
    expect(one).toEqual({ areaIds: ["home"] });
    expect(toggleFilterValue(one, "area", "health")).toEqual({ areaIds: ["health", "home"] });
    expect(toggleFilterValue(one, "area", "home")).toEqual({});
  });

  it("sets and removes whole filters", () => {
    const filters = setFilterValues({ recurring: true }, "energy", ["medium", "low"]);
    expect(filters).toEqual({ energies: ["low", "medium"], recurring: true });
    expect(removeFilter(filters, "energy")).toEqual({ recurring: true });
    expect(removeFilter(filters, "recurring")).toEqual({ energies: ["low", "medium"] });
    expect(setFilterFlag({}, "hasDate", true)).toEqual({ hasDate: true });
    expect(setFilterFlag({ hasDate: true }, "hasDate", undefined)).toEqual({});
    expect(clearFilters()).toEqual({});
    expect(isFiltersEmpty(filters)).toBe(false);
    expect(isFiltersEmpty({ areaIds: [] })).toBe(true);
  });

  it("counts one per active filter kind", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ areaIds: ["home", "health"], energies: ["low"] })).toBe(2);
    expect(activeFilterCount({ hasDate: false, recurring: true, labels: ["x"] })).toBe(3);
  });
});

describe("filter chips", () => {
  it("is one chip per active filter in panel order, like “Area: Personal, Health ×  Energy: Low–Medium ×”", () => {
    const chips = filterChips({ energies: ["medium", "low"], areaIds: ["personal", "health"] });
    expect(chips).toEqual([
      { kind: "area", values: ["health", "personal"] },
      { kind: "energy", values: ["low", "medium"], range: ["low", "medium"] },
    ]);
  });

  it("reads an energy range only for adjacent levels", () => {
    expect(filterChips({ energies: ["low", "high"] })[0]).toEqual({ kind: "energy", values: ["low", "high"] });
    expect(filterChips({ energies: ["low", "medium", "high"] })[0]).toMatchObject({ range: ["low", "high"] });
    expect(filterChips({ energies: ["high"] })[0]).toEqual({ kind: "energy", values: ["high"] });
  });

  it("orders priorities and contexts canonically and names the flags", () => {
    expect(filterChips({ priorities: ["low", "urgent"], scopes: ["project", "personal"] })).toEqual([
      { kind: "context", values: ["personal", "project"] },
      { kind: "priority", values: ["urgent", "low"] },
    ]);
    expect(filterChips({ hasDate: false, recurring: true })).toEqual([
      { kind: "hasDate", values: ["no"] },
      { kind: "recurring", values: ["yes"] },
    ]);
    expect(filterChips({})).toEqual([]);
  });
});
