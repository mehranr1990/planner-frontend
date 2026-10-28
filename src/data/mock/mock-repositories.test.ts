import { describe, expect, it } from "vitest";
import type { Task } from "@/data/domain";
import { personalFixtures, sampleDays } from "@/fixtures/personal";
import { createMockRepositories } from "./mock-repositories";

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

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

describe("mock tasks repository", () => {
  const { tasks } = createMockRepositories();

  it("today: tasks dated today (done included) plus open overdue, overdue → timed → unscheduled", async () => {
    expect(ids(await tasks.list({ view: "today" }))).toEqual([
      "t-pay-electricity-bill",
      "t-deep-work",
      "t-water-plants",
      "t-ui-design",
      "t-check-in-notes",
      "t-read-30-pages",
      "t-reply-katy-brief",
      "t-review-october-expenses",
      "t-plan-weekend-trip",
    ]);
  });

  it("today never pulls in done tasks from earlier days", async () => {
    expect(ids(await tasks.list({ view: "today" }))).not.toContain("t-weekly-groceries");
  });

  it("today narrows by status", async () => {
    expect(ids(await tasks.list({ view: "today", status: "done" }))).toEqual(["t-deep-work", "t-water-plants"]);
  });

  it("upcoming: open tasks after the reference day", async () => {
    expect(ids(await tasks.list({ view: "upcoming" }))).toEqual([
      "t-5km-run",
      "t-finish-finance-report",
      "t-reply-to-client",
      "t-call-dentist",
      "t-haircut",
      "t-renew-car-insurance",
      "t-monthly-budget-review",
    ]);
  });

  it("views are relative to `day`", async () => {
    const tomorrow = await tasks.list({ view: "today", day: sampleDays.tomorrow });
    // Yesterday's and today's open tasks are overdue from tomorrow; today's done tasks are not.
    expect(ids(tomorrow)).toContain("t-ui-design");
    expect(ids(tomorrow)).not.toContain("t-deep-work");
    // Thursday's two tasks and next Saturday's review are still ahead of tomorrow.
    expect(ids(await tasks.list({ view: "upcoming", day: sampleDays.tomorrow }))).toEqual([
      "t-haircut",
      "t-renew-car-insurance",
      "t-monthly-budget-review",
    ]);
  });

  it("all: every task, undated last; status filters", async () => {
    const all = await tasks.list({ view: "all" });
    expect(all).toHaveLength(personalFixtures.tasks.length);
    expect(all.at(-1)?.id).toBe("t-sort-photo-backups");
    expect(await tasks.list()).toEqual(all);
    expect((await tasks.list({ view: "all", status: "open" })).every((item) => item.status === "open")).toBe(true);
  });

  it("completed: done tasks, most recently completed first", async () => {
    expect(ids(await tasks.list({ view: "completed" }))).toEqual([
      "t-deep-work",
      "t-water-plants",
      "t-weekly-groceries",
      "t-review-weekly-notes",
      "t-pay-phone-bill",
      "t-clean-kitchen",
      "t-meal-prep",
      "t-call-grandma",
      "t-submit-tax-documents",
    ]);
  });

  it("day without a view: tasks dated on that day", async () => {
    expect(ids(await tasks.list({ day: sampleDays.yesterday }))).toEqual([
      "t-weekly-groceries",
      "t-pay-electricity-bill",
    ]);
  });

  it("get returns the task, or null for an unknown id", async () => {
    expect((await tasks.get("t-ui-design"))?.title).toBe("UI design · My Day screen");
    expect(await tasks.get("t-missing")).toBeNull();
  });

  it("sorts by priority within the same slot", async () => {
    const repo = createMockRepositories({
      fixtures: {
        today: "2026-01-01",
        tasks: [task("low", { date: "2026-01-01", priority: "low" }), task("urgent", { date: "2026-01-01", priority: "urgent" })],
      },
    });
    expect(ids(await repo.tasks.list({ view: "today" }))).toEqual(["urgent", "low"]);
  });
});

describe("mock blocks repository", () => {
  const { blocks } = createMockRepositories();

  it("lists the sample day's blocks in start order", async () => {
    expect(ids(await blocks.listForDay(sampleDays.today))).toEqual([
      "morning-routine",
      "deep-work",
      "design-review",
      "lunch",
      "ui-design",
      "client-call",
      "gym",
    ]);
  });

  it("separates days and returns nothing for an empty day", async () => {
    expect(ids(await blocks.listForDay(sampleDays.tomorrow))).toEqual(["finish-finance-report", "design-review-wed"]);
    expect(await blocks.listForDay("2026-10-17")).toEqual([]);
  });

  it("uses Tehran calendar days for any offset, and keeps a midnight end on its own day", async () => {
    const repo = createMockRepositories({
      fixtures: {
        blocks: [
          // 23:00–24:00 Tehran, given in UTC.
          { id: "late", title: "Late", start: "2026-10-13T19:30:00Z", end: "2026-10-13T20:30:00Z", scope: "personal", kind: "event" },
          // 23:30 → 00:30 Tehran: on both days.
          { id: "span", title: "Span", start: "2026-10-13T23:30:00+03:30", end: "2026-10-14T00:30:00+03:30", scope: "personal", kind: "event" },
        ],
      },
    });
    expect(ids(await repo.blocks.listForDay("2026-10-13"))).toEqual(["late", "span"]);
    expect(ids(await repo.blocks.listForDay("2026-10-14"))).toEqual(["span"]);
  });
});

describe("mock inbox repository", () => {
  const { inbox } = createMockRepositories();

  it("counts untriaged items only (the rail badge)", async () => {
    expect(await inbox.count()).toBe(6);
  });

  it("lists by state, newest capture first", async () => {
    const untriaged = await inbox.list("untriaged");
    expect(untriaged).toHaveLength(6);
    expect(untriaged[0]?.id).toBe("i-call-ali-lease");
    expect(untriaged.at(-1)?.id).toBe("i-renew-passport");
    expect(ids(await inbox.list("snoozed"))).toEqual(["i-dentist", "i-standing-desk"]);
    expect(ids(await inbox.list("archived"))).toEqual(["i-darband-hike"]);
    expect(await inbox.list()).toHaveLength(personalFixtures.inbox.length);
  });
});

describe("createMockRepositories", () => {
  it("returns clones: mutating a result changes neither the fixtures nor later reads", async () => {
    const { tasks } = createMockRepositories();
    const first = await tasks.get("t-ui-design");
    first!.title = "Changed";
    first!.subtasks!.done = 5;
    expect((await tasks.get("t-ui-design"))?.title).toBe("UI design · My Day screen");
    expect(personalFixtures.tasks.find((item) => item.id === "t-ui-design")?.subtasks?.done).toBe(3);

    const list = await tasks.list({ view: "today" });
    list.reverse();
    list[0]!.area!.name = "Changed";
    expect(personalFixtures.tasks[0]?.id).toBe("t-pay-electricity-bill");
    expect(personalFixtures.tasks.every((item) => item.area?.name !== "Changed")).toBe(true);
  });

  it("replaces only the fixtures it is given", async () => {
    const repo = createMockRepositories({ fixtures: { inbox: [] } });
    expect(await repo.inbox.count()).toBe(0);
    expect(await repo.tasks.get("t-ui-design")).not.toBeNull();
  });

  it("waits latencyMs before resolving", async () => {
    const { inbox } = createMockRepositories({ latencyMs: 20 });
    const started = performance.now();
    await inbox.count();
    expect(performance.now() - started).toBeGreaterThanOrEqual(15);
  });
});
