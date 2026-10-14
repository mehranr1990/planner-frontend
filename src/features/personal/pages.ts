import type { PersonalModuleId } from "@/features/planner-settings/modules";

/*
 * The Personal route skeleton (P00PersonalIA · Routes). Each page names its
 * final board and the implementation step that replaces the skeleton (the
 * approved order: My Day → Tasks → Task detail → Task create → Calendar →
 * Overview → Inbox → Brain Dump → Focus → Shutdown → Goals → Habits →
 * Finance → Journal → Insights → Weekly review → Settings). `module` gates
 * the page when an optional module is hidden (P17).
 */

export type PersonalPageId =
  | "overview"
  | "myday"
  | "tasks"
  | "taskNew"
  | "taskDetail"
  | "calendar"
  | "inbox"
  | "braindump"
  | "focus"
  | "shutdown"
  | "goals"
  | "habits"
  | "finance"
  | "journal"
  | "insights"
  | "review"
  | "settings";

export interface PersonalPageSpec {
  board: string;
  step: number;
  module: PersonalModuleId | null;
}

export const personalPages: Record<PersonalPageId, PersonalPageSpec> = {
  myday: { board: "P02", step: 2, module: "myday" },
  tasks: { board: "P03", step: 3, module: "tasks" },
  taskDetail: { board: "P06", step: 4, module: "tasks" },
  taskNew: { board: "P05", step: 5, module: "tasks" },
  calendar: { board: "P04", step: 6, module: "calendar" },
  overview: { board: "P01", step: 7, module: "overview" },
  inbox: { board: "P07", step: 8, module: "inbox" },
  braindump: { board: "P08", step: 9, module: "braindump" },
  focus: { board: "P09", step: 10, module: null },
  shutdown: { board: "P10", step: 11, module: null },
  goals: { board: "P11", step: 12, module: "goals" },
  habits: { board: "P12", step: 13, module: "habits" },
  finance: { board: "P13", step: 14, module: "finance" },
  journal: { board: "P14", step: 15, module: "journal" },
  insights: { board: "P15", step: 16, module: "insights" },
  review: { board: "P16", step: 17, module: null },
  settings: { board: "P17", step: 18, module: "settings" },
};

/** Supporting-flow sheets arrive with their first consumer (Quick Add with Task create, Reschedule with My Day…). */
export const sheetSteps = {
  "quick-add": 5,
  expense: 14,
  habit: 13,
  goal: 12,
  mood: 7,
  reschedule: 2,
  note: 19,
  voice: 19,
} as const;
