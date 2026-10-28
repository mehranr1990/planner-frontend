/*
 * Minimal Personal domain types, read off the final boards (P02 My Day,
 * P03 Tasks, P07 Inbox). They describe what the client consumes, in the
 * shape a JSON API would send: calendar days and instants are strings, never
 * Date objects, so a typed API client can return them unchanged.
 *
 * - Calendar day: "YYYY-MM-DD", Gregorian ISO, in the planner's time zone.
 *   The Jalali `?date=` URL form is a presentation concern (date-param.ts).
 * - Instant: ISO 8601 with an explicit offset ("2026-10-13T14:00:00+03:30").
 *
 * Deliberately not a backend model: fields arrive as screens need them.
 */

/** Same union as the design-system scopes; Personal aggregates all four. */
export type Scope = "personal" | "project" | "team" | "company";

export type TaskPriority = "urgent" | "high" | "medium" | "low";

export type EnergyLevel = "low" | "medium" | "high";

export type TaskStatus = "open" | "done";

export interface Area {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  title: string;
  scope: Scope;
  area?: Area;
  /** Project (or side project) name shown on the meta line. */
  project?: string;
  priority: TaskPriority | null;
  energy: EnergyLevel | null;
  durationMinutes: number | null;
  /** Planned calendar day; null = no date (All view only). */
  date: string | null;
  /** "HH:mm" on `date`; null = unscheduled within the day. */
  time: string | null;
  /** Hard deadline day, when one exists ("due Fri 24 Mehr"). */
  deadline?: string;
  status: TaskStatus;
  /** Instant the task was completed (status "done" only). */
  completedAt?: string;
  /** Times the task was moved to another day (P10 "3rd time moved" repeat-offender hint). */
  movedCount?: number;
  /** Effort already spent, in minutes (the Now card's "35m left" = duration − spent). */
  spentMinutes?: number;
  subtasks?: { done: number; total: number };
  labels?: string[];
  recurring?: boolean;
  goalId?: string;
  /** Title of the linked goal, resolved by the data layer from `goalId` ("linked goal: Launch Planner v1"). */
  goalTitle?: string;
  /** Manual order (lower first), set by create and drag-reorder; absent on tasks never ordered by hand. */
  order?: number;
  /** Instant the task was created (the "Created" sort). */
  createdAt?: string;
  /** Free text under the properties (P06 "Description"). */
  description?: string;
  /** The subtask items behind `subtasks` (P06 Subtasks tab); the data layer keeps the summary in step. */
  checklist?: Subtask[];
  /** P06 Notes tab, oldest first. */
  notes?: TaskNote[];
  /** P06 Activity tab, newest first. */
  activity?: TaskActivity[];
  /** P06 Links tab: dependencies (soft, never blocking), files and URLs. */
  links?: TaskLink[];
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskNote {
  id: string;
  body: string;
  /** Instant. */
  createdAt: string;
}

/** One line of the Activity tab; the client words it. */
export type TaskActivity = { id: string; /** Instant. */ at: string } & (
  | { kind: "created"; source: "inbox-voice" | "inbox" | "quick-add" | "manual" }
  | { kind: "scheduled"; time: string }
  | { kind: "subtaskDone"; title: string }
  | { kind: "priority"; priority: TaskPriority }
);

/**
 * A dependency names another task; the data layer refreshes `title`, `done`
 * and `date` from that task when it exists. Personal dependencies are soft:
 * an open blocker only warns before completing.
 */
export type TaskLink =
  | { id: string; kind: "blockedBy" | "blocks"; taskId: string; title: string; done: boolean; date?: string | null }
  | { id: string; kind: "file"; name: string; sizeBytes: number }
  | { id: string; kind: "url"; label: string; url: string };

/** The Tasks list sorts. "smart" = overdue, day, time, manual order, then priority. */
export type TaskSort = "smart" | "manual" | "priority" | "duration" | "created";

/**
 * Task filters; every field is optional and an absent or empty field filters
 * nothing. Fields combine with AND, the values inside one field with OR.
 */
export interface TaskFilters {
  areaIds?: string[];
  /** The "Context" filter. */
  scopes?: Scope[];
  priorities?: TaskPriority[];
  energies?: EnergyLevel[];
  labels?: string[];
  /** true = only dated tasks, false = only undated. */
  hasDate?: boolean;
  /** true = only recurring tasks. */
  recurring?: boolean;
}

/** "break" is a neutral block (lunch, morning routine) that never counts toward capacity. */
export type TimeBlockKind = "task" | "event" | "routine" | "break";

export interface TimeBlock {
  id: string;
  title: string;
  /** Instants with offset. */
  start: string;
  end: string;
  scope: Scope;
  kind: TimeBlockKind;
  /** The task this block schedules (kind "task"). */
  taskId?: string;
  done?: boolean;
  /** Events and routines carry their own energy; task blocks derive it from the task. */
  energy?: EnergyLevel;
}

/** A pointer to something a day priority can be: a task or a block. */
export interface DayPriorityRef {
  kind: "task" | "block";
  id: string;
}

/** One of the day's (at most three) ranked priorities, resolved for display. */
export interface DayPriority {
  rank: 1 | 2 | 3;
  kind: "task" | "block";
  id: string;
  title: string;
  scope: Scope;
  /** "HH:mm" when scheduled, else null. */
  time: string | null;
  durationMinutes: number | null;
  energy: EnergyLevel | null;
}

/** Focus sessions so far today, for the Focus card ("2 sessions done today · cycle 1 of 4"). */
export interface FocusSummary {
  sessionsCompleted: number;
  /** Position in the current Pomodoro cycle, 1-based. */
  cycle: number;
}

export type InboxSource = "quick-add" | "voice" | "share" | "note" | "brain-dump";

/** "processed" (sent to a destination) and "dropped" are kept as tombstones so Undo can restore them; list() without a state skips them. */
export type InboxState = "untriaged" | "snoozed" | "archived" | "processed" | "dropped";

export type InboxDestination = "task" | "event" | "note" | "journal" | "reminder";

export interface InboxItem {
  id: string;
  text: string;
  source: InboxSource;
  /** Instant the item was captured. */
  capturedAt: string;
  state: InboxState;
  /** Instant the item returns to triage (state "snoozed" only). */
  snoozedUntil?: string;
  /** Destination pre-selected from parsing. */
  suggested?: InboxDestination;
  /** Woke from a snooze: listed at the top with a "back from snooze" tag. */
  backFromSnooze?: boolean;
  /** Voice captures: recording length. */
  audioSeconds?: number;
  /** Voice capture whose transcript failed (P07 error state); audio is kept until retry or drop. */
  transcriptFailed?: boolean;
  /** Where a processed item went (state "processed"). */
  processedTo?: InboxDestination | "brain-dump";
  /** The task a "task" destination created. */
  taskId?: string;
}

// ── Brain Dump (P08): one free-writing page per day, sorted line by line ──

/** Where a line was sorted (P08 action row; Strike is `struck`, not a destination). */
export type BrainDumpDestination = "task" | "note" | "journal" | "event" | "inbox";

export interface BrainDumpLine {
  id: string;
  /** Raw text; "- " and "[] " / "[x] " prefixes are the only markup (Markdown shortcuts). */
  text: string;
  /** Set once sorted: the line stays, muted, tagged "→ destination". */
  sortedTo?: BrainDumpDestination;
  /** The day the destination points at ("→ Task · Thu"), "YYYY-MM-DD". */
  sortedDay?: string;
  /** The task a "task" sort created. */
  taskId?: string;
  /** The Inbox item an "inbox" sort created. */
  inboxItemId?: string;
  /** Struck through: dismissed without a destination. */
  struck?: boolean;
}

export interface BrainDumpPage {
  /** The page's day, "YYYY-MM-DD" (a new page starts at 04:00). */
  day: string;
  lines: BrainDumpLine[];
  /** Instant of the last save; null for a page nobody wrote on. */
  savedAt: string | null;
}

/** The pages list ("Sun 19 Mehr · 12 lines · 5 left"). Blank lines are not counted. */
export interface BrainDumpPageSummary {
  day: string;
  lineCount: number;
  unsortedCount: number;
}

// ── Modules read by Overview (P01): habits, goals, mood, finance, insights ──

export interface Habit {
  id: string;
  title: string;
  /** The habit Overview shows as a Streak Ribbon (at most one). */
  pinned: boolean;
  /** Calendar days ("YYYY-MM-DD") the habit was done, any order. */
  doneDays: string[];
  /** Weekdays (0 = Sunday … 6 = Saturday) the habit rests; they never break a streak. */
  restWeekdays: number[];
  // ── P12 Habits (optional, so the Overview summary stays valid) ──
  icon?: HabitIcon;
  /** Life area on the meta line ("Learning"). */
  area?: string;
  /** Day the habit started; the Habit Field hides earlier days. Absent = unknown (show all). */
  startDay?: string;
  /** Days skipped on purpose (long-press → Skip); they never break a streak. */
  skippedDays?: string[];
  /** One-off rest days (long-press → Rest); like a scheduled rest weekday. */
  restDays?: string[];
  /** Daily target ("20 pages", "8 glasses"); logging the full amount marks the day done. */
  target?: HabitTarget | null;
  /** Amount logged per day ("YYYY-MM-DD" → amount), for habits with a target. */
  amounts?: Record<string, number>;
  /** Part of the day the habit belongs to. */
  timeOfDay?: HabitTimeOfDay;
  /** Preferred time "HH:mm", or null. */
  preferredTime?: string | null;
  /** Reminder as data only (no notifications yet). */
  reminder?: HabitReminder | null;
  /** Archived habits leave the lists; Undo restores them. */
  archived?: boolean;
}

export type HabitIcon = "book" | "sun" | "dumbbell" | "droplet" | "moon" | "footprints" | "brain" | "pen" | "heart" | "leaf";

export type HabitTimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

export interface HabitTarget {
  amount: number;
  /** Free unit text ("pages", "glasses"). */
  unit: string;
}

export interface HabitReminder {
  /** "HH:mm". */
  time: string;
  /** Only remind when the day is still open. */
  ifNotDone: boolean;
}

export type GoalStatus = "on-track" | "behind";

export interface Goal {
  id: string;
  title: string;
  /** 0–1. */
  progress: number;
  status: GoalStatus;
  /** The next milestone or step ("Beta", "5 km run"), when there is one. */
  nextStep: string | null;
  /** Day of the next step, "YYYY-MM-DD". */
  nextStepDay: string | null;
  /** Days behind plan (status "behind" only). */
  behindDays?: number;
  // ── P11 Goals (optional, so the Overview summary stays valid) ──
  /** "active" when absent. */
  lifecycle?: GoalLifecycle;
  /** Life area / context on the meta line ("side project", "Health"). */
  area?: string;
  /** What "done" means, in the user's words ("public launch with 40 beta users"). */
  target?: string;
  /** Deadline, "YYYY-MM-DD". */
  dueDay?: string | null;
  /** A simple measurable goal ("41 of 100 km"); progress follows it. */
  measure?: GoalMeasure;
  /** The journey, in order; the goal flag is not a milestone. */
  milestones?: GoalMilestone[];
  keyResults?: GoalKeyResult[];
  /** Habits that feed the goal. */
  habitIds?: string[];
  /** Optional financial target (Finance category colour). */
  money?: GoalMoney;
  /** Why / scope (Notes tab). */
  notes?: string;
  /** Day the goal was completed (lifecycle "completed"). */
  completedDay?: string;
}

export type GoalLifecycle = "active" | "completed" | "archived";

export interface GoalMeasure {
  current: number;
  target: number;
  /** Free unit text ("km", "books"). */
  unit: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  /** "YYYY-MM-DD". */
  dueDay: string | null;
  /** Day it was reached; null = not yet. */
  doneDay: string | null;
  /** The next concrete step ("finish API"): shown on the selected node, used by "Plan next step". */
  nextAction?: string;
}

export interface GoalKeyResult {
  id: string;
  title: string;
  current: number;
  target: number;
  /** Shown after the numbers ("%"); absent = plain count. */
  unit?: string;
}

export interface GoalMoney {
  label: string;
  savedToman: number;
  targetToman: number;
}

/** Mood is five levels (1 awful … 5 great); energy stays separate (three levels). */
export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export interface MoodEntry {
  day: string;
  mood: MoodLevel;
  energy: EnergyLevel;
  /** Instant of the check-in. */
  at: string;
  /** Daily shutdown reflection (P10 Step 3): "What went well?", saved on today's Journal entry. */
  wentWell?: string;
  /** Optional short note from the same reflection. */
  note?: string;
}

/** A Journal prompt answered on an entry ("Prompt me", P14). */
export interface JournalPrompt {
  /** Stable prompt id; its question comes from the message catalogue. */
  id: string;
  answer: string;
}

/**
 * The day's Journal entry (P14), one per calendar day. Every source writes
 * here: the composer, the mood check-in (P18 · D), Shutdown's reflection
 * (P10) and lines sent from Inbox / Brain Dump (appended to the text).
 */
export interface JournalEntry {
  day: string;
  mood: MoodLevel | null;
  energy: EnergyLevel | null;
  /** Instant of the latest mood check-in; null without one. */
  checkedInAt: string | null;
  /** "What went well". */
  wentWell: string;
  /** Free text ("Reflection"); appended lines arrive on their own line. */
  text: string;
  prompts: JournalPrompt[];
  /** Lower-case, without "#". */
  tags: string[];
  /** Instant of the last save. */
  updatedAt: string;
}

/** Appends a line to a Journal text on its own line (Inbox / Brain Dump, check-in and Shutdown notes). */
export function appendJournalLine(text: string, line: string): string {
  return text.trim() ? `${text.replace(/\s+$/, "")}\n${line}` : line;
}

/**
 * Rebases an editor's text onto the stored one: `base` is the stored text the
 * editor's `text` grew from, `current` the stored text now. Lines appended
 * after `base` (Inbox / Brain Dump, check-in or Shutdown notes) are appended
 * again to the editor's text, so neither side loses what it wrote. A stored
 * text that no longer extends `base` leaves the editor's text as is.
 */
export function rebaseJournalText(text: string, base: string, current: string): string {
  if (current === base) return text;
  const stem = base.replace(/\s+$/, "");
  const rest = current.slice(stem.length);
  if (!current.startsWith(stem) || (stem && rest && !rest.startsWith("\n"))) return text;
  return rest
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce(appendJournalLine, text);
}

/** Journal tags: "#Calm", " calm " → "calm"; blanks and duplicates dropped. */
export function normalizeJournalTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().replace(/^#+/, "").trim().toLocaleLowerCase();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

export interface UpcomingBill {
  title: string;
  /** Toman, the app's base unit. */
  amountToman: number;
  dueDay: string;
}

// ── Finance (P13) ────────────────────────────────────────────────────────

/** The validated categorical palette's categories, in display order (DataViz `--viz-*`). */
export const FINANCE_CATEGORIES = ["housing", "food", "transport", "lifestyle", "work", "health", "other"] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export type TransactionKind = "expense" | "income";

/** One money movement. Amounts are positive Toman; `kind` gives the sign. */
export interface Transaction {
  id: string;
  kind: TransactionKind;
  amountToman: number;
  /** Expenses carry a category; income has none. */
  category: FinanceCategory | null;
  title: string;
  day: string;
  /** "HH:mm", or null when only the day is known. */
  time: string | null;
  note?: string;
}

export interface CategoryBudget {
  category: FinanceCategory;
  /** Null when the category has no budget. */
  budgetToman: number | null;
  spentToman: number;
}

/** A budget month (a Jalali month): totals, budgets per category and the account balance. */
export interface FinanceMonth {
  /** First day of the month, "YYYY-MM-DD". */
  start: string;
  daysInMonth: number;
  /** The month's budget, or null when none is set. */
  budgetToman: number | null;
  incomeToman: number;
  spentToman: number;
  savedToman: number;
  savingsGoalToman: number | null;
  /** All accounts, now (not per month). */
  balanceToman: number;
  /** Every category, in FINANCE_CATEGORIES order. */
  categories: CategoryBudget[];
  transactionCount: number;
}

/** The budget month that contains a day (Jalali month in the sample data). */
export interface FinanceMonthSummary {
  /** First day of the budget month, "YYYY-MM-DD". */
  monthStart: string;
  spentToman: number;
  budgetToman: number;
  /** 1-based day of the budget month, and its length: the "expected by today" marker. */
  dayOfMonth: number;
  daysInMonth: number;
  nextBill: UpcomingBill | null;
}

/** One referenced pattern Insights surfaces (P15); copy is localised from `kind`. */
export type InsightHighlight = {
  id: string;
  kind: "best-focus-window";
  /** Whole hours, 0–24. */
  startHour: number;
  endHour: number;
  /** Today's deep work already sits in that window. */
  bookedToday: boolean;
};

// ── Insights (P15): patterns over a period, each behind its own threshold ──

export type InsightsPeriod = "4w" | "3m" | "year";
export const insightsPeriods: readonly InsightsPeriod[] = ["4w", "3m", "year"];
export type InsightPatternId = "focus" | "time" | "signals" | "estimates" | "habits";
export const insightPatternIds: readonly InsightPatternId[] = ["focus", "time", "signals", "estimates", "habits"];
/** Focus tab day filter: All days · Work days · Weekend. */
export type InsightDayFilter = "all" | "work" | "weekend";
/** The four contexts plus untracked "other" (Context Ribbon bands). */
export type InsightContext = "personal" | "projects" | "teams" | "companies" | "other";
export const insightContexts: readonly InsightContext[] = ["personal", "projects", "teams", "companies", "other"];
export type EstimateCategory = "design" | "admin" | "writing" | "errands";

export interface InsightsSummary {
  period: InsightsPeriod;
  /** Days with My Day, Focus or check-in activity so far. */
  activeDays: number;
  /** Days needed before any pattern shows ("about 2 weeks"). */
  requiredDays: number;
  /** Best focus window before noon + the habit of the calmest days; null below the threshold. */
  headline: { focusWindow: readonly [number, number]; habitId: string; habitTitle: string } | null;
}

export interface FocusWindowStats {
  /** 24 values: typical focus minutes per hour. */
  minutesByHour: number[];
  totalMinutes: number;
  sessionsCompleted: number;
  sessionsStarted: number;
  averageSessionMinutes: number;
  /** Best window [startHour, endHour) and its share (0–1) of all focused minutes. */
  bestWindow: [number, number];
  bestShare: number;
  /** Hour most sessions were interrupted in. */
  interruptedHour: number;
}

export interface FocusPattern {
  id: "focus";
  byDays: Record<InsightDayFilter, FocusWindowStats>;
}

export interface TimePattern {
  id: "time";
  /** Seven rows in week order (first = week start): tracked minutes per context. */
  days: { weekday: number; minutes: Record<InsightContext, number> }[];
  /** Share per context (0–1) in the previous period, for the delta. */
  previousShare: Record<InsightContext, number>;
  /** The project that took most Projects time (user text). */
  topProject: string;
}

export interface SignalsDay {
  day: string;
  /** Shared 0–10 daily scores. */
  mood: number;
  energy: number;
  focus: number;
}

export interface SignalsPattern {
  id: "signals";
  days: SignalsDay[];
  /** Mood (0–10) on days with ≥ 2h focus vs the rest. */
  moodWithFocus: number;
  moodWithoutFocus: number;
}

export interface EstimatesPattern {
  id: "estimates";
  /** Actual ÷ estimated per category, biggest overrun first. */
  categories: { id: EstimateCategory; ratio: number }[];
  /** The one opt-in suggestion: add +N% duration to new tasks of a category. */
  suggestion: { category: EstimateCategory; bufferPercent: number } | null;
}

export interface HabitsPattern {
  id: "habits";
  /** Avg mood (0–10) on days done vs not done; only habits with ≥ 10 days of data. */
  rows: { habitId: string; title: string; doneMood: number; notDoneMood: number }[];
}

export type InsightPattern = FocusPattern | TimePattern | SignalsPattern | EstimatesPattern | HabitsPattern;
export type InsightPatternOf<Id extends InsightPatternId> = Extract<InsightPattern, { id: Id }>;

/** A pattern, or progress to its own threshold (never a chart from too little data). */
export type InsightPatternResult<P extends InsightPattern = InsightPattern> =
  | { status: "ready"; pattern: P }
  | { status: "collecting"; have: number; need: number };

// ── Weekly review (P16) ──────────────────────────────────────────────────

/** The review's steps, in flow order (Wins → Carry over → Goals → Plan → Reflect). */
export type ReviewStep = "wins" | "carry" | "goals" | "plan" | "reflect";

/** A win the person kept for the week: suggested from a task, milestone or habit, or their own words. */
export interface ReviewWin {
  id: string;
  title: string;
  source: "task" | "milestone" | "habit" | "own";
}

/** One of next week's (at most three) priorities; `taskId` when it is an existing task. */
export interface ReviewPriority {
  id: string;
  title: string;
  taskId?: string;
}

/** A carry-over task's draft route (Daily Shutdown's destinations); `day` for "pick" only. */
export interface ReviewRoute {
  to: string;
  day?: string;
}

/** A week's review, saved as it goes ("Save & exit keeps progress"). */
export interface WeeklyReview {
  /** The week's first day, "YYYY-MM-DD". */
  week: string;
  /** Where the person left off. */
  step: ReviewStep;
  wins: ReviewWin[];
  priorities: ReviewPriority[];
  /** Carry-over routing draft, task id → route; written to Tasks on Finish. */
  routes: Record<string, ReviewRoute>;
  wentWell: string;
  slipped: string;
  change: string;
  /** Instant the review was finished; null while in progress. */
  completedAt: string | null;
  /** Instant of the last save. */
  updatedAt: string;
}
