/*
 * SAMPLE DATA — the P02 My Day demo states (spec tab "States"), as fixture
 * sets for createMockRepositories({ fixtures }). The styleguide's "My Day ·
 * states" harness builds one isolated store per state; production My Day
 * reads the normal fixtures. Every state is the sample day (Tue 13 Oct 2026,
 * 14:35) and deterministic: the numbers the boards print — "9h 40m of 8h",
 * "1 overlap", "Move 2 to tomorrow", "3 tasks fit" — fall out of the data
 * through the domain maths, they are not typed in.
 *
 *   normal      the default sample day
 *   empty       no blocks, five open tasks waiting
 *   partial     Deep work + Lunch, a long free afternoon, three tasks that fit
 *   overloaded  580 planned minutes on an 8h day, one 30m overlap, two movable blocks
 *   no-current  14:35 falls between blocks: nothing is running
 *   after-hours 19:30, every block is over
 */

import type { Task, TimeBlock } from "@/data/domain";
import type { MockFixtures } from "@/data/mock/mock-repositories";
import { personalFixtures } from ".";
import { SAMPLE_DAY, SAMPLE_NOW, sampleInstant } from "./sample-day";

/** Marks every export in this module as sample content. */
export const isSampleData = true;

export const MY_DAY_STATES = ["normal", "empty", "partial", "overloaded", "no-current", "after-hours"] as const;

export type MyDayState = (typeof MY_DAY_STATES)[number];

const day = SAMPLE_DAY;

/** An instant on the sample day from "HH:mm". */
function at(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return sampleInstant(day, hours, minutes);
}

function minutesBetween(start: string, end: string): number {
  const toMinutes = (time: string) => {
    const [hours = 0, minutes = 0] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(end) - toMinutes(start);
}

function task(id: string, title: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title,
    scope: "personal",
    priority: "medium",
    energy: "medium",
    durationMinutes: 30,
    date: day,
    time: null,
    status: "open",
    ...patch,
  };
}

/** An open task that sits on the timeline: its block and the task agree. */
function scheduled(
  id: string,
  title: string,
  start: string,
  end: string,
  patch: Partial<Task> = {},
): { task: Task; block: TimeBlock } {
  const scope = patch.scope ?? "personal";
  return {
    task: task(id, title, { time: start, durationMinutes: minutesBetween(start, end), ...patch }),
    block: {
      id: `blk-${id}`,
      title,
      start: at(start),
      end: at(end),
      scope,
      kind: "task",
      taskId: id,
    },
  };
}

const sampleTask = (id: string): Task => {
  const found = personalFixtures.tasks.find((item) => item.id === id);
  if (!found) throw new Error(`Sample task "${id}" is missing`);
  return structuredClone(found) as Task;
};

/** The four tasks the board's Unscheduled card lists for today (one overdue). */
const UNSCHEDULED_IDS = [
  "t-pay-electricity-bill",
  "t-review-october-expenses",
  "t-reply-katy-brief",
  "t-plan-weekend-trip",
] as const;

function emptyDay(): Partial<MockFixtures> {
  return {
    blocks: [],
    tasks: [
      ...UNSCHEDULED_IDS.map(sampleTask),
      task("t-book-dentist", "Book a dentist appointment", { energy: "low", priority: "medium", durationMinutes: 15 }),
    ],
    priorities: {},
    focus: {},
  };
}

function partialDay(): Partial<MockFixtures> {
  const deepWork = scheduled("t-pd-deep-work", "Deep work", "09:00", "10:30", {
    priority: "high",
    energy: "high",
  });
  const lunch: TimeBlock = {
    id: "pd-lunch",
    title: "Lunch",
    start: at("12:00"),
    end: at("12:45"),
    scope: "personal",
    kind: "break",
  };
  return {
    blocks: [deepWork.block, lunch],
    tasks: [
      deepWork.task,
      sampleTask("t-pay-electricity-bill"),
      sampleTask("t-review-october-expenses"),
      sampleTask("t-reply-katy-brief"),
      // Longer than any free stretch of the workday, so it never counts as "fits".
      task("t-pd-taxes", "Prepare quarterly taxes", { priority: "high", energy: "high", durationMinutes: 300 }),
    ],
    priorities: { [day]: [{ kind: "task", id: "t-pd-deep-work" }] },
  };
}

function overloadedDay(): Partial<MockFixtures> {
  const deepWork = scheduled("t-od-deep-work", "Deep work", "09:00", "11:00", { priority: "high", energy: "high" });
  const report = scheduled("t-od-report", "Report", "11:30", "13:00", { priority: "medium" });
  const clientPrep = scheduled("t-od-client-prep", "Client prep", "13:00", "14:30", {
    scope: "project",
    project: "Website redesign",
    priority: "low",
  });
  const planning = scheduled("t-od-planning", "Quarterly planning", "14:30", "16:30", {
    priority: "high",
    energy: "high",
  });
  const wrapUp = scheduled("t-od-wrap-up", "Wrap-up and handover", "16:30", "17:40", { priority: "low", energy: "low" });
  const inboxZero = scheduled("t-od-inbox-zero", "Inbox zero", "17:40", "18:10", { priority: "low", energy: "low" });
  // Starts half an hour before Deep work ends: the board's "overlaps 30m".
  const designReview: TimeBlock = {
    id: "od-design-review",
    title: "Design review",
    start: at("10:30"),
    end: at("11:30"),
    scope: "team",
    kind: "event",
    energy: "medium",
  };
  const stack = [deepWork, report, clientPrep, planning, wrapUp, inboxZero];
  return {
    blocks: [deepWork.block, designReview, ...stack.slice(1).map((entry) => entry.block)],
    tasks: [...stack.map((entry) => entry.task), ...UNSCHEDULED_IDS.map(sampleTask)],
    priorities: { [day]: [{ kind: "task", id: "t-od-deep-work" }] },
  };
}

/** Same day as the default, but the UI design block starts at 15:00: 14:35 falls in the gap after Lunch. */
function noCurrentDay(): Partial<MockFixtures> {
  return {
    blocks: personalFixtures.blocks.map((block) =>
      block.id === "ui-design" ? { ...block, start: at("15:00"), end: at("16:30") } : block,
    ),
    tasks: personalFixtures.tasks.map((item) =>
      item.id === "t-ui-design" ? { ...item, time: "15:00", durationMinutes: 90 } : item,
    ),
  };
}

/** Builds the fixture overrides of a demo state for createMockRepositories({ fixtures }). */
export function myDayStateFixtures(state: MyDayState): Partial<MockFixtures> {
  switch (state) {
    case "normal":
      return {};
    case "empty":
      return emptyDay();
    case "partial":
      return partialDay();
    case "overloaded":
      return overloadedDay();
    case "no-current":
      return { ...noCurrentDay(), now: SAMPLE_NOW };
    case "after-hours":
      return { now: at("19:30") };
  }
}

/**
 * The instant a state assumes for "now". The screen reads the planner clock
 * (14:35); a harness that can override it passes this for "after-hours".
 */
export function myDayStateNow(state: MyDayState): string {
  return state === "after-hours" ? at("19:30") : SAMPLE_NOW;
}
