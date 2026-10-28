import { describe, expect, it } from "vitest";
import type { Task } from "./domain";
import {
  countTasks,
  filterTasks,
  hasActiveFilters,
  matchesFilters,
  matchesSearch,
  matchesView,
  normalizeFilters,
  normalizeSearchText,
  searchTerms,
  sortTasks,
} from "./task-query";

const TODAY = "2026-10-13";
const YESTERDAY = "2026-10-12";
const TOMORROW = "2026-10-14";

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: id,
  scope: "personal",
  priority: null,
  energy: null,
  durationMinutes: null,
  date: null,
  time: null,
  status: "open",
  ...patch,
});

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

describe("normalizeSearchText", () => {
  it("lower-cases, folds digits and collapses spaces", () => {
    expect(normalizeSearchText("  Pay  RENT ۱ ٢ 3 ")).toBe("pay rent 1 2 3");
  });

  it("maps Arabic yeh and kaf to the Persian letters and drops joiners and diacritics", () => {
    const arabic = "كتاب ياد"; // كتاب ياد
    const persian = "کتاب یاد"; // کتاب یاد
    expect(normalizeSearchText(arabic)).toBe(normalizeSearchText(persian));
    // "می‌شود" with and without the half-space
    expect(normalizeSearchText("می‌شود")).toBe(normalizeSearchText("میشود"));
    expect(normalizeSearchText("سلامَ")).toBe(normalizeSearchText("سلام"));
  });

  it("splits a query into terms", () => {
    expect(searchTerms("  ")).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms("Pay  Bill")).toEqual(["pay", "bill"]);
  });
});

describe("matchesSearch", () => {
  const bill = task("bill", {
    title: "Pay electricity bill",
    project: "Bills",
    area: { id: "home", name: "Home" },
    labels: ["urgent-ish"],
  });

  it("matches title, project, area and labels case-insensitively", () => {
    for (const query of ["ELECTRICITY", "bills", "home", "urgent-ish"]) expect(matchesSearch(bill, query), query).toBe(true);
    expect(matchesSearch(bill, "gym")).toBe(false);
  });

  it("requires every term, in any order", () => {
    expect(matchesSearch(bill, "bill pay")).toBe(true);
    expect(matchesSearch(bill, "bill gym")).toBe(false);
    expect(matchesSearch(bill, "   ")).toBe(true);
  });

  it("finds Persian text typed with Latin or Arabic digits and Arabic letters", () => {
    const persian = task("p", { title: "کتاب ۳۰ صفحه" }); // کتاب ۳۰ صفحه
    expect(matchesSearch(persian, "30")).toBe(true);
    expect(matchesSearch(persian, "٣٠")).toBe(true); // ٣٠
    expect(matchesSearch(persian, "كتاب")).toBe(true); // كتاب
  });
});

describe("matchesFilters", () => {
  const read = task("read", {
    scope: "personal",
    area: { id: "learning", name: "Learning" },
    priority: "low",
    energy: "low",
    labels: ["Habit-linked"],
    recurring: true,
    date: TODAY,
  });

  it("is open when empty", () => {
    expect(matchesFilters(read, undefined)).toBe(true);
    expect(matchesFilters(read, { areaIds: [], priorities: [], hasDate: undefined })).toBe(true);
    expect(hasActiveFilters({ areaIds: [], recurring: false })).toBe(false);
  });

  it("ORs values inside a field and ANDs the fields", () => {
    expect(matchesFilters(read, { areaIds: ["home", "learning"] })).toBe(true);
    expect(matchesFilters(read, { areaIds: ["home"] })).toBe(false);
    expect(matchesFilters(read, { areaIds: ["learning"], energies: ["low", "medium"] })).toBe(true);
    expect(matchesFilters(read, { areaIds: ["learning"], energies: ["high"] })).toBe(false);
  });

  it("handles scope, priority, labels, date and recurrence", () => {
    expect(matchesFilters(read, { scopes: ["project"] })).toBe(false);
    expect(matchesFilters(read, { priorities: ["low"] })).toBe(true);
    expect(matchesFilters(task("none"), { priorities: ["low"] })).toBe(false);
    expect(matchesFilters(read, { labels: ["habit-linked"] })).toBe(true);
    expect(matchesFilters(read, { hasDate: true })).toBe(true);
    expect(matchesFilters(read, { hasDate: false })).toBe(false);
    expect(matchesFilters(task("undated"), { hasDate: false })).toBe(true);
    expect(matchesFilters(read, { recurring: true })).toBe(true);
    expect(matchesFilters(task("once"), { recurring: true })).toBe(false);
  });

  it("a task without an area never matches an area filter", () => {
    expect(matchesFilters(task("no-area"), { areaIds: ["home"] })).toBe(false);
  });
});

describe("normalizeFilters", () => {
  it("returns null when nothing is active and sorts and de-duplicates otherwise", () => {
    expect(normalizeFilters(undefined)).toBeNull();
    expect(normalizeFilters({ areaIds: [], recurring: false })).toBeNull();
    expect(normalizeFilters({ areaIds: ["b", "a", "b"], hasDate: false, recurring: true })).toEqual({
      areaIds: ["a", "b"],
      hasDate: false,
      recurring: true,
    });
  });
});

describe("matchesView", () => {
  it("follows the view rules relative to the day", () => {
    const overdue = task("o", { date: YESTERDAY });
    const doneEarlier = task("d", { date: YESTERDAY, status: "done" });
    const todays = task("t", { date: TODAY, status: "done" });
    const later = task("l", { date: TOMORROW });
    expect(matchesView(overdue, "today", TODAY)).toBe(true);
    expect(matchesView(doneEarlier, "today", TODAY)).toBe(false);
    expect(matchesView(todays, "today", TODAY)).toBe(true);
    expect(matchesView(later, "upcoming", TODAY)).toBe(true);
    expect(matchesView(todays, "upcoming", TODAY)).toBe(false);
    expect(matchesView(todays, "completed", TODAY)).toBe(true);
    expect(matchesView(later, "all", TODAY)).toBe(true);
    expect(matchesView(todays, undefined, TODAY)).toBe(true);
    expect(matchesView(later, undefined, TODAY)).toBe(false);
  });
});

describe("sortTasks", () => {
  const set = [
    task("late-high", { date: TODAY, time: "16:00", priority: "high" }),
    task("early-low", { date: TODAY, time: "09:00", priority: "low" }),
    task("untimed-urgent", { date: TODAY, priority: "urgent" }),
    task("overdue", { date: YESTERDAY, priority: "low" }),
    task("tomorrow", { date: TOMORROW, time: "08:00" }),
    task("undated"),
  ];

  it("smart: overdue, day, time (untimed after timed), priority", () => {
    expect(ids(sortTasks(set, "smart", TODAY))).toEqual([
      "overdue",
      "early-low",
      "late-high",
      "untimed-urgent",
      "tomorrow",
      "undated",
    ]);
  });

  it("smart: a manual order beats priority within the same slot, ordered before unordered", () => {
    const slot = [
      task("a", { date: TODAY, priority: "low", order: 1 }),
      task("b", { date: TODAY, priority: "urgent" }),
      task("c", { date: TODAY, priority: "high", order: 0 }),
    ];
    expect(ids(sortTasks(slot, "smart", TODAY))).toEqual(["c", "a", "b"]);
  });

  it("manual: by order across slots, unordered after in smart order", () => {
    const list = [
      task("x", { date: TOMORROW, order: 0 }),
      task("y", { date: TODAY, time: "09:00" }),
      task("z", { date: TODAY, order: 1 }),
    ];
    expect(ids(sortTasks(list, "manual", TODAY))).toEqual(["x", "z", "y"]);
  });

  it("priority, duration (shortest first, unknown last) and created (newest first)", () => {
    expect(ids(sortTasks(set, "priority", TODAY)).slice(0, 2)).toEqual(["untimed-urgent", "late-high"]);
    const durations = [
      task("long", { durationMinutes: 120 }),
      task("unknown"),
      task("short", { durationMinutes: 5 }),
    ];
    expect(ids(sortTasks(durations, "duration", TODAY))).toEqual(["short", "long", "unknown"]);
    const created = [
      task("old", { createdAt: "2026-10-01T09:00:00+03:30" }),
      task("new", { createdAt: "2026-10-12T09:00:00+03:30" }),
      task("never"),
    ];
    expect(ids(sortTasks(created, "created", TODAY))).toEqual(["new", "old", "never"]);
  });

  it("does not mutate its input, and completed + smart means newest completion first", () => {
    const input = [
      task("a", { status: "done", completedAt: "2026-10-12T10:00:00+03:30" }),
      task("b", { status: "done", completedAt: "2026-10-13T10:00:00+03:30" }),
    ];
    const before = ids(input);
    expect(ids(sortTasks(input, "smart", TODAY, "completed"))).toEqual(["b", "a"]);
    expect(ids(input)).toEqual(before);
  });
});

describe("filterTasks and countTasks", () => {
  const all = [
    task("today-open", { date: TODAY, area: { id: "home", name: "Home" } }),
    task("today-done", { date: TODAY, status: "done", completedAt: "2026-10-13T09:00:00+03:30" }),
    task("overdue", { date: YESTERDAY }),
    task("later", { date: TOMORROW, area: { id: "home", name: "Home" }, title: "Call mum" }),
    task("undated"),
  ];

  it("filters by view, status, filters and search together", () => {
    expect(ids(filterTasks(all, { view: "today" }, { today: TODAY }))).toEqual(["today-open", "today-done", "overdue"]);
    expect(ids(filterTasks(all, { view: "today", status: "open" }, { today: TODAY }))).toEqual(["today-open", "overdue"]);
    expect(ids(filterTasks(all, { view: "all", filters: { areaIds: ["home"] } }, { today: TODAY }))).toEqual(["today-open", "later"]);
    expect(ids(filterTasks(all, { view: "all", search: "mum" }, { today: TODAY }))).toEqual(["later"]);
    expect(ids(filterTasks(all, {}, { today: TODAY }))).toHaveLength(5);
    expect(ids(filterTasks(all, { day: TOMORROW }, { today: TODAY }))).toEqual(["later"]);
  });

  it("counts every view after the same filters and search", () => {
    expect(countTasks(all, {}, { today: TODAY })).toEqual({ today: 3, upcoming: 1, all: 5, completed: 1 });
    expect(countTasks(all, { filters: { areaIds: ["home"] } }, { today: TODAY })).toEqual({
      today: 1,
      upcoming: 1,
      all: 2,
      completed: 0,
    });
    expect(countTasks(all, { search: "nothing" }, { today: TODAY })).toEqual({ today: 0, upcoming: 0, all: 0, completed: 0 });
  });
});
