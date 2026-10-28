import { describe, expect, expectTypeOf, it } from "vitest";
import type { Scope as DomainScope } from "@/data/domain";
import type { Scope } from "@/design-system/tokens/colors";
import { sampleNow, sampleScheduleBlocks } from "@/fixtures/shell";
import { personalFixtures, SAMPLE_DAY, SAMPLE_NOW, sampleBlocks, sampleInboxItems, sampleInstant, sampleTasks } from ".";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+03:30$/;
const URL_SAFE_ID = /^[a-z0-9-]+$/;

describe("personal fixtures", () => {
  it("share the shell's sample day and now", () => {
    expect(SAMPLE_DAY).toBe("2026-10-13");
    expect(Date.parse(SAMPLE_NOW)).toBe(sampleNow.getTime());
    expect(sampleInstant(SAMPLE_DAY, 9, 5)).toBe("2026-10-13T09:05:00+03:30");
    expect(personalFixtures).toMatchObject({ today: SAMPLE_DAY, tasks: sampleTasks, blocks: sampleBlocks, inbox: sampleInboxItems });
  });

  it("use unique, URL-safe ids per collection", () => {
    for (const collection of [sampleTasks, sampleBlocks, sampleInboxItems]) {
      const ids = collection.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(URL_SAFE_ID);
    }
  });

  it("domain scopes match the design-system scopes", () => {
    expectTypeOf<DomainScope>().toEqualTypeOf<Scope>();
  });
});

describe("sample tasks", () => {
  it("use calendar days, HH:mm times and +03:30 instants", () => {
    for (const task of sampleTasks) {
      if (task.date !== null) expect(task.date).toMatch(DAY);
      if (task.time !== null) {
        expect(task.time).toMatch(TIME);
        expect(task.date).not.toBeNull();
      }
      if (task.deadline) expect(task.deadline).toMatch(DAY);
      expect(task.completedAt === undefined).toBe(task.status === "open");
      if (task.completedAt) expect(task.completedAt).toMatch(INSTANT);
    }
  });

  it("put the P03 Today list on the sample day", () => {
    const today = sampleTasks.filter((task) => task.date === SAMPLE_DAY);
    expect(today.map((task) => task.title)).toEqual(
      expect.arrayContaining(["UI design · My Day screen", "Reply to Katy’s brief", "Review October expenses"]),
    );
    expect(sampleTasks.find((task) => task.id === "t-pay-electricity-bill")?.date).toBe("2026-10-12");
  });

  it("only link blocks to tasks that exist", () => {
    const taskIds = new Set(sampleTasks.map((task) => task.id));
    for (const block of sampleBlocks) if (block.taskId) expect(taskIds.has(block.taskId)).toBe(true);
  });
});

describe("sample blocks", () => {
  it("carry +03:30 instants and end after they start", () => {
    for (const block of sampleBlocks) {
      expect(block.start).toMatch(INSTANT);
      expect(block.end).toMatch(INSTANT);
      expect(Date.parse(block.end)).toBeGreaterThan(Date.parse(block.start));
    }
  });

  it("match the shell schedule's times for the sample day", () => {
    for (const shellBlock of sampleScheduleBlocks) {
      const block = sampleBlocks.find((item) => item.id === shellBlock.id);
      expect(block, shellBlock.id).toBeDefined();
      expect(Date.parse(block!.start)).toBe(shellBlock.start.getTime());
      expect(Date.parse(block!.end)).toBe(shellBlock.end.getTime());
    }
  });
});

describe("P02 My Day alignment", () => {
  it("makes lunch and the morning routine neutral breaks, and gives events and the gym their energy", () => {
    const block = (id: string) => sampleBlocks.find((item) => item.id === id);
    expect(block("lunch")?.kind).toBe("break");
    expect(block("morning-routine")?.kind).toBe("break");
    for (const id of ["design-review", "client-call", "gym"]) expect(block(id)?.energy, id).toBe("medium");
  });

  it("carries the effort spent on the current task (35m left of 2h)", () => {
    const ui = sampleTasks.find((task) => task.id === "t-ui-design");
    expect(ui?.spentMinutes).toBe(85);
    expect((ui?.durationMinutes ?? 0) - (ui?.spentMinutes ?? 0)).toBe(35);
  });

  it("leaves the board's four unscheduled rows (2h 05m) and Thursday's insurance for the week", () => {
    const task = (id: string) => sampleTasks.find((item) => item.id === id);
    expect(task("t-reply-katy-brief")?.time).toBeNull();
    expect(task("t-plan-weekend-trip")?.durationMinutes).toBe(65);
    expect(task("t-renew-car-insurance")).toMatchObject({ date: "2026-10-15", deadline: "2026-10-16" });
  });

  it("has priorities and focus sessions that point at real tasks and blocks", () => {
    const refs = personalFixtures.priorities[SAMPLE_DAY]!;
    expect(refs).toHaveLength(3);
    for (const ref of refs) {
      const exists = (ref.kind === "task" ? sampleTasks : sampleBlocks).some((item) => item.id === ref.id);
      expect(exists, ref.id).toBe(true);
    }
    expect(personalFixtures.focus[SAMPLE_DAY]).toEqual({ sessionsCompleted: 2, cycle: 1 });
  });
});

describe("sample inbox", () => {
  it("has six untriaged items (the rail badge), snoozed and archived ones", () => {
    const byState = (state: string) => sampleInboxItems.filter((item) => item.state === state);
    expect(byState("untriaged")).toHaveLength(6);
    expect(byState("snoozed")).toHaveLength(2);
    expect(byState("archived").length).toBeGreaterThan(0);
  });

  it("snoozes only into the future, with +03:30 instants", () => {
    for (const item of sampleInboxItems) {
      expect(item.capturedAt).toMatch(INSTANT);
      expect(Date.parse(item.capturedAt)).toBeLessThanOrEqual(Date.parse(SAMPLE_NOW));
      expect(item.snoozedUntil === undefined).toBe(item.state !== "snoozed");
      if (item.snoozedUntil) {
        expect(item.snoozedUntil).toMatch(INSTANT);
        expect(Date.parse(item.snoozedUntil)).toBeGreaterThan(Date.parse(SAMPLE_NOW));
      }
    }
  });
});
