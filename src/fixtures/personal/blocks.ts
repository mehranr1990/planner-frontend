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
    kind: "routine",
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
    done: true,
  },
  {
    id: "lunch",
    title: "Lunch",
    start: sampleInstant(today, 13),
    end: sampleInstant(today, 13, 45),
    scope: "personal",
    kind: "routine",
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
  },
  {
    id: "gym",
    title: "Gym",
    start: sampleInstant(today, 17, 15),
    end: sampleInstant(today, 18, 15),
    scope: "personal",
    kind: "routine",
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
];
