import { describe, expect, it } from "vitest";
import { buildCountsQuery, buildTasksQuery } from "./query";
import { defaultGroup } from "./types";
import {
  DEFAULT_TASKS_STATE,
  effectiveGroup,
  parseTasksUrlState,
  sameTasksUrlState,
  writeTasksUrlState,
  type TasksUrlState,
} from "./url-state";

const read = (search: string) => parseTasksUrlState(new URLSearchParams(search));
const state = (patch: Partial<TasksUrlState>): TasksUrlState => ({ ...DEFAULT_TASKS_STATE, ...patch });

describe("parseTasksUrlState", () => {
  it("defaults: list, today, smart, no group chosen, no search, no filters", () => {
    expect(read("")).toEqual(DEFAULT_TASKS_STATE);
  });

  it("reads every documented param", () => {
    expect(read("view=board&tab=upcoming&group=status&sort=priority&q=pay%20rent&area=home&priority=high")).toEqual({
      layout: "board",
      tab: "upcoming",
      group: "status",
      sort: "priority",
      q: "pay rent",
      filters: { areaIds: ["home"], priorities: ["high"] },
    });
  });

  it("keeps the older board link working", () => {
    expect(read("view=board&group=horizon")).toMatchObject({ layout: "board", group: "horizon" });
  });

  it("ignores unknown values and groups the layout does not offer", () => {
    expect(read("view=grid&tab=soon&sort=random&group=nope")).toEqual(DEFAULT_TASKS_STATE);
    expect(read("group=horizon").group).toBeNull();
    expect(read("view=board&group=area").group).toBeNull();
    expect(read("view=board&group=time").group).toBe("time");
    expect(read("group=time").group).toBe("time");
  });
});

describe("writeTasksUrlState", () => {
  it("writes nothing for the defaults and drops params that return to default", () => {
    expect(writeTasksUrlState("", DEFAULT_TASKS_STATE)).toBe("");
    expect(writeTasksUrlState("view=board&tab=all&sort=manual&q=x&area=a", DEFAULT_TASKS_STATE)).toBe("");
  });

  it("writes only what differs, keeping unrelated params", () => {
    expect(writeTasksUrlState("sheet=quick-add", state({ tab: "upcoming", sort: "manual" }))).toBe("sheet=quick-add&tab=upcoming&sort=manual");
    expect(writeTasksUrlState("", state({ layout: "board", group: "horizon" }))).toBe("view=board&group=horizon");
    expect(writeTasksUrlState("", state({ q: "  ", filters: { energies: ["low", "medium"] } }))).toBe("energy=low&energy=medium");
  });

  it("does not write a group the layout does not offer", () => {
    expect(writeTasksUrlState("", state({ layout: "board", group: "area" }))).toBe("view=board");
    expect(writeTasksUrlState("", state({ group: "horizon" }))).toBe("");
  });

  it("round-trips a full state", () => {
    const full = state({ layout: "list", tab: "completed", group: "priority", sort: "duration", q: "Bill ۱", filters: { areaIds: ["home"], hasDate: true } });
    expect(read(writeTasksUrlState("", full))).toEqual(full);
    expect(sameTasksUrlState(full, read(writeTasksUrlState("", full)))).toBe(true);
    expect(sameTasksUrlState(full, DEFAULT_TASKS_STATE)).toBe(false);
  });
});

describe("grouping defaults", () => {
  it("Today by time of day, Upcoming by date, All by area, Completed by day, board by horizon", () => {
    expect(defaultGroup("list", "today")).toBe("time");
    expect(defaultGroup("list", "upcoming")).toBe("date");
    expect(defaultGroup("list", "all")).toBe("area");
    expect(defaultGroup("list", "completed")).toBe("date");
    expect(defaultGroup("board", "today")).toBe("horizon");
  });

  it("a chosen group overrides the default when the layout offers it", () => {
    expect(effectiveGroup({ layout: "list", tab: "today", group: null })).toBe("time");
    expect(effectiveGroup({ layout: "list", tab: "today", group: "priority" })).toBe("priority");
    expect(effectiveGroup({ layout: "list", tab: "all", group: "horizon" })).toBe("area");
    expect(effectiveGroup({ layout: "board", tab: "today", group: "status" })).toBe("status");
  });
});

describe("queries from state", () => {
  const input = { tab: "today" as const, sort: "smart" as const, q: "  rent ", filters: { areaIds: ["b", "a"] }, today: "2026-10-13" };

  it("builds the list query with trimmed search and normalised filters", () => {
    expect(buildTasksQuery(input)).toEqual({ view: "today", day: "2026-10-13", sort: "smart", search: "rent", filters: { areaIds: ["a", "b"] } });
    expect(buildTasksQuery({ ...input, q: "", filters: {} })).toEqual({ view: "today", day: "2026-10-13", sort: "smart" });
  });

  it("builds the counts query from the same filters and search", () => {
    expect(buildCountsQuery(input)).toEqual({ day: "2026-10-13", search: "rent", filters: { areaIds: ["a", "b"] } });
    expect(buildCountsQuery({ q: "", filters: {}, today: "2026-10-13" })).toEqual({ day: "2026-10-13" });
  });
});
