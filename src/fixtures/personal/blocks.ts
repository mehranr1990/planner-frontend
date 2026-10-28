/*
 * SAMPLE DATA — time blocks from the P02 My Day timeline (and tomorrow's
 * plan from P10 Daily Shutdown). Ids and times match the shell schedule
 * (src/fixtures/shell.ts); scopes follow the final P02 board, where
 * "UI design" is a Personal block on the Planner side project.
 * Replace with the calendar API when the backend lands.
 */

import type { TimeBlock } from "@/data/domain";
import { sampleDays, sampleInstant } from "./sample-day";

/** Marks every export in this module as sample content. */
export const isSampleData = true;

const { today, tomorrow } = sampleDays;

export const sampleBlocks: readonly TimeBlock[] = [
  {
    id: "morning-routine",
    title: "Morning routine",
    start: sampleInstant(today, 8),
    end: sampleInstant(today, 8, 45),
    scope: "personal",
    kind: "break",
    done: true,
  },
  {
    id: "deep-work",
    title: "Deep work · Planner design",
    start: sampleInstant(today, 9),
    end: sampleInstant(today, 11),
    scope: "personal",
    kind: "task",
    taskId: "t-deep-work",
    done: true,
  },
  {
    id: "design-review",
    title: "Design review",
    start: sampleInstant(today, 11),
    end: sampleInstant(today, 11, 45),
    scope: "team",
    kind: "event",
    energy: "medium",
    done: true,
  },
  {
    id: "lunch",
    title: "Lunch",
    start: sampleInstant(today, 13),
    end: sampleInstant(today, 13, 45),
    scope: "personal",
    kind: "break",
  },
  {
    id: "ui-design",
    title: "UI design · My Day screen",
    start: sampleInstant(today, 14),
    end: sampleInstant(today, 16),
    scope: "personal",
    kind: "task",
    taskId: "t-ui-design",
  },
  {
    id: "client-call",
    title: "Client call",
    start: sampleInstant(today, 16, 30),
    end: sampleInstant(today, 17),
    scope: "project",
    kind: "event",
    energy: "medium",
  },
  {
    id: "gym",
    title: "Gym",
    start: sampleInstant(today, 17, 15),
    end: sampleInstant(today, 18, 15),
    scope: "personal",
    kind: "routine",
    energy: "medium",
  },
  // Tomorrow
  {
    id: "finish-finance-report",
    title: "Finish finance report",
    start: sampleInstant(tomorrow, 9),
    end: sampleInstant(tomorrow, 10, 30),
    scope: "personal",
    kind: "task",
    taskId: "t-finish-finance-report",
  },
  {
    id: "design-review-wed",
    title: "Design review",
    start: sampleInstant(tomorrow, 14),
    end: sampleInstant(tomorrow, 14, 45),
    scope: "team",
    kind: "event",
  },
  // The rest of the P04 Calendar week (Sat 18 – Fri 24 Mehr); events only, so no task needs a matching block.
  ...weekBlocks(),
];

function weekBlocks(): TimeBlock[] {
  const { saturday, sunday, yesterday, thursday, friday } = sampleDays;
  const block = (
    id: string,
    title: string,
    day: string,
    [startH, startM]: [number, number],
    [endH, endM]: [number, number],
    scope: TimeBlock["scope"],
    kind: TimeBlock["kind"] = "event",
  ): TimeBlock => ({ id, title, start: sampleInstant(day, startH, startM), end: sampleInstant(day, endH, endM), scope, kind });
  return [
    block("cal-deep-work-sat", "Deep work", saturday, [9, 0], [11, 0], "personal", "routine"),
    block("cal-sprint-planning", "Sprint planning", saturday, [15, 0], [16, 0], "project"),
    block("cal-client-call-sun", "Client call", sunday, [10, 0], [11, 0], "project"),
    block("cal-lunch-sun", "Lunch with Sara", sunday, [13, 0], [14, 0], "personal"),
    block("cal-board-decision", "Board decision", sunday, [16, 0], [18, 0], "company"),
    block("cal-design-review-mon", "Design review", yesterday, [9, 0], [10, 30], "team"),
    block("cal-wireframes", "Wireframes", yesterday, [11, 0], [13, 0], "project"),
    block("cal-gym-mon", "Gym", yesterday, [17, 15], [18, 15], "personal", "routine"),
    block("cal-family-brunch", "Family brunch", thursday, [10, 0], [12, 0], "personal"),
    block("cal-hike", "Hike · Darband", friday, [9, 0], [11, 0], "personal"),
  ];
}
