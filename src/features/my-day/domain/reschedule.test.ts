import { describe, expect, it } from "vitest";
import { IRAN_WEEK } from "@/lib/dates/week";
import { rescheduleOptions, type RescheduleInput, type RescheduleOption } from "./reschedule";
import { dayBlock, sampleDayBlocks } from "./test-utils";

const WORK = { start: "09:00", end: "17:00" };

function input(patch: Partial<RescheduleInput> = {}): RescheduleInput {
  return {
    now: "2026-10-13T14:35:00+03:30", // Tue 21 Mehr
    day: "2026-10-13",
    blocks: sampleDayBlocks(),
    task: { durationMinutes: 45, kind: "task" },
    week: IRAN_WEEK,
    workHours: WORK,
    ...patch,
  };
}

const option = <Id extends RescheduleOption["id"]>(options: RescheduleOption[], id: Id) =>
  options.find((item): item is Extract<RescheduleOption, { id: Id }> => item.id === id);

describe("rescheduleOptions", () => {
  it("the board's rows in order, for a 45m task on the sample day", () => {
    const options = rescheduleOptions(input());
    expect(options.map((item) => item.id)).toEqual(["later-today", "tomorrow", "next-working-day", "pick", "unscheduled"]);

    // First free :00/:30 slot from 14:50 that holds 45m: after the gym.
    expect(option(options, "later-today")).toMatchObject({ day: "2026-10-13", start: "18:30", startMinutes: 1110, freeMinutes: 90 });
    expect(option(options, "tomorrow")).toMatchObject({ day: "2026-10-14", start: "09:30", bestFit: true });
  });

  it("Later today skips the busy afternoon and never starts before now + 15m", () => {
    const options = rescheduleOptions(input({ task: { durationMinutes: 20, kind: "task" } }));
    // 16:00 is free for 20m before the 16:30 call.
    expect(option(options, "later-today")).toMatchObject({ start: "16:00", freeMinutes: 30 });
  });

  it("ignores the block being rescheduled when looking for free time", () => {
    const withSelf = rescheduleOptions(input({ task: { durationMinutes: 60, kind: "task" } }));
    const withoutSelf = rescheduleOptions(input({ task: { durationMinutes: 60, kind: "task", blockId: "ui-design" } }));
    expect(option(withSelf, "later-today")?.start).toBe("18:30");
    expect(option(withoutSelf, "later-today")?.start).toBe("15:00");
  });

  it("omits Later today when nothing fits before work ends + 3h", () => {
    const options = rescheduleOptions(input({ now: "2026-10-13T19:30:00+03:30" }));
    expect(options.some((item) => item.id === "later-today")).toBe(false);
    expect(options[0]?.id).toBe("tomorrow");
  });

  it("offers Back to Unscheduled only for task blocks", () => {
    const event = rescheduleOptions(input({ task: { durationMinutes: 30, kind: "event" } }));
    expect(event.some((item) => item.id === "unscheduled")).toBe(false);
    expect(event.at(-1)?.id).toBe("pick");
    for (const kind of ["routine", "break"] as const) {
      expect(rescheduleOptions(input({ task: { durationMinutes: 30, kind } })).some((item) => item.id === "unscheduled")).toBe(false);
    }
  });

  it("Tomorrow takes the first free slot from 09:30 and prefers the lighter day for best fit", () => {
    const tomorrow = [dayBlock("standup", "09:30", "10:30", { kind: "task", taskId: "s" })];
    const options = rescheduleOptions(input({ blocksByDay: { "2026-10-14": tomorrow } }));
    expect(option(options, "tomorrow")).toMatchObject({ start: "10:30" });
  });

  describe("next working day (Iranian week)", () => {
    it("Tuesday: it is Wednesday, the same day as Tomorrow, with no weekend note", () => {
      const next = option(rescheduleOptions(input()), "next-working-day");
      expect(next).toMatchObject({ day: "2026-10-14", weekday: 3, note: null, sameAsTomorrow: true, bestFit: false });
    });

    it("Wednesday: Thursday is a half day, so the slot stays in the first half of the workday", () => {
      const blocks = [dayBlock("busy", "09:30", "12:30", { kind: "task", taskId: "b" })];
      const options = rescheduleOptions(
        input({ now: "2026-10-14T10:00:00+03:30", day: "2026-10-14", blocks: [], task: { durationMinutes: 30, kind: "task" }, blocksByDay: { "2026-10-15": blocks } }),
      );
      const next = option(options, "next-working-day")!;
      expect(next).toMatchObject({ day: "2026-10-15", weekday: 4, note: null });
      // 12:30–13:00 is the last 30m of the half day.
      expect(next.start).toBe("12:30");
      // Too long for what is left of the half day: falls back to the default start.
      const long = option(
        rescheduleOptions(
          input({ now: "2026-10-14T10:00:00+03:30", day: "2026-10-14", blocks: [], task: { durationMinutes: 90, kind: "task" }, blocksByDay: { "2026-10-15": blocks } }),
        ),
        "next-working-day",
      )!;
      expect(long.start).toBe("09:30");
    });

    it("Thursday: Friday is the weekend, so it is Saturday with the note", () => {
      const options = rescheduleOptions(input({ now: "2026-10-15T10:00:00+03:30", day: "2026-10-15", blocks: [] }));
      const next = option(options, "next-working-day")!;
      expect(next).toMatchObject({ day: "2026-10-17", weekday: 6, note: "fri-weekend", sameAsTomorrow: false, start: "09:30" });
      // Tomorrow (Friday) is a weekend: it is offered but never "best fit"; Saturday is.
      expect(option(options, "tomorrow")).toMatchObject({ day: "2026-10-16", bestFit: false });
      expect(next.bestFit).toBe(true);
    });

    it("Friday: it is Saturday, with the note", () => {
      const options = rescheduleOptions(input({ now: "2026-10-16T10:00:00+03:30", day: "2026-10-16", blocks: [] }));
      expect(option(options, "next-working-day")).toMatchObject({ day: "2026-10-17", weekday: 6, note: "fri-weekend", sameAsTomorrow: true });
    });

    it("Saturday starts the Iranian work week: next is Sunday", () => {
      const options = rescheduleOptions(input({ now: "2026-10-17T10:00:00+03:30", day: "2026-10-17", blocks: [] }));
      expect(option(options, "next-working-day")).toMatchObject({ day: "2026-10-18", weekday: 0, note: null });
    });

    it("is omitted when the week has no working days", () => {
      const week = { ...IRAN_WEEK, workDays: [], halfDays: [] };
      expect(rescheduleOptions(input({ week })).some((item) => item.id === "next-working-day")).toBe(false);
    });
  });

  it("a weekend Tomorrow is never best fit, even when the next working day is busy", () => {
    const options = rescheduleOptions(
      input({
        now: "2026-10-15T10:00:00+03:30",
        day: "2026-10-15",
        blocks: [],
        blocksByDay: { "2026-10-17": [dayBlock("heavy", "09:00", "16:00")] },
      }),
    );
    expect(option(options, "next-working-day")?.bestFit).toBe(true);
    expect(option(options, "tomorrow")?.bestFit).toBe(false);
  });

  it("honours custom work hours", () => {
    const options = rescheduleOptions(input({ workHours: { start: "08:00", end: "14:00" }, blocks: [] }));
    expect(option(options, "tomorrow")?.start).toBe("08:30");
    expect(option(options, "later-today")?.start).toBe("15:00");
  });
});

describe("rescheduleOptions · protected focus", () => {
  it("Tomorrow and Later today land outside the protected window", () => {
    const guard = { startMinutes: 540, endMinutes: 720 };
    const plain = rescheduleOptions(input({ now: "2026-10-13T08:00:00+03:30", blocks: [] }));
    expect(option(plain, "tomorrow")).toMatchObject({ start: "09:30" });
    expect(option(plain, "later-today")).toMatchObject({ start: "08:30" });
    const kept = rescheduleOptions(input({ now: "2026-10-13T08:00:00+03:30", blocks: [], protectedFocus: guard, task: { durationMinutes: 45, kind: "task" } }));
    expect(option(kept, "tomorrow")).toMatchObject({ start: "12:00" });
    // 08:30 + 45m would run into 09:00, so Later today moves past the window too.
    expect(option(kept, "later-today")).toMatchObject({ start: "12:00" });
  });
});
