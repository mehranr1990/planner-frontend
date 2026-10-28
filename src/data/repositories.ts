import type {
  Area,
  BrainDumpDestination,
  BrainDumpLine,
  BrainDumpPage,
  BrainDumpPageSummary,
  DayPriority,
  DayPriorityRef,
  EnergyLevel,
  FinanceMonth,
  FinanceMonthSummary,
  FocusSummary,
  Goal,
  GoalLifecycle,
  GoalMeasure,
  Habit,
  HabitIcon,
  HabitReminder,
  HabitTarget,
  HabitTimeOfDay,
  InboxItem,
  InsightHighlight,
  InsightPatternId,
  InsightPatternOf,
  InsightPatternResult,
  InsightsPeriod,
  InsightsSummary,
  JournalEntry,
  MoodEntry,
  MoodLevel,
  InboxSource,
  InboxState,
  Scope,
  Subtask,
  Task,
  TaskFilters,
  TaskPriority,
  TaskSort,
  TaskStatus,
  TimeBlock,
  Transaction,
  UpcomingBill,
  WeeklyReview,
} from "./domain";
import type { WeekConfig } from "@/lib/dates/week";

/*
 * The data seam. UI reaches data only through these interfaces (via the
 * React Query hooks in queries.ts); the mock adapter implements them today,
 * a typed API client or an offline store can implement them later without
 * touching a component. Every method is async so any of those fits.
 *
 * Filtering and ordering are the adapter's job, never the UI's.
 */

/** Why a repository call was refused; the UI maps codes to copy, never message text. */
export type RepositoryErrorCode = "not-found" | "invalid" | "forbidden";

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
  }
}

export type TaskView = "today" | "upcoming" | "all" | "completed";

export interface TaskQuery {
  /**
   * - today: tasks dated `day` (any status) plus open overdue tasks
   * - upcoming: open tasks dated after `day`
   * - all: every task, dated or not
   * - completed: done tasks, most recently completed first
   *
   * Without a view, `day` alone returns the tasks dated on that day; with
   * neither, every task (as "all").
   */
  view?: TaskView;
  /** Calendar day "YYYY-MM-DD": "today" for the views; defaults to the adapter's today. */
  day?: string;
  status?: TaskStatus;
  /** Narrows the view; see TaskFilters (AND across fields, OR within one). */
  filters?: TaskFilters;
  /**
   * Case-insensitive match on title, project, area and labels. Every
   * whitespace-separated term must match; Persian and Arabic digits and the
   * Arabic yeh/kaf are treated as their Persian forms (see data/task-query.ts).
   */
  search?: string;
  /**
   * Without a sort the view's legacy order applies (day, time, priority;
   * completed by completion time). "smart" is the Tasks list order: overdue,
   * day, time, manual order, priority; for the completed view, newest first.
   */
  sort?: TaskSort;
}

/** The Tasks tabs' badges: tasks per view, after the active filters and search. */
export type TaskCounts = Record<TaskView, number>;

export interface TaskCountsQuery {
  /** "today" for the views; defaults to the adapter's today. */
  day?: string;
  filters?: TaskFilters;
  search?: string;
}

/** What a new task needs: only the title is required. Dates are "YYYY-MM-DD", times "HH:mm". */
export interface NewTaskInput {
  title: string;
  date?: string | null;
  /** Needs a date. A time alone never creates a timeline block: that is blocks.schedule. */
  time?: string | null;
  durationMinutes?: number | null;
  priority?: TaskPriority | null;
  energy?: EnergyLevel | null;
  /** Default "personal". */
  scope?: Scope;
  area?: Area | null;
  project?: string | null;
  labels?: string[];
  recurring?: boolean;
  deadline?: string | null;
  /** Where it was captured; recorded as the "created" line in Activity (P07: "from Inbox"). */
  source?: "inbox-voice" | "inbox" | "quick-add" | "manual";
  /** Links the task to a goal (P11 "Plan next step"); the data layer resolves `goalTitle`. */
  goalId?: string | null;
}

/**
 * A partial edit. Absent keys stay; `null` clears a nullable field. Clearing
 * the date also clears the time. A task with a timeline block keeps it in step:
 * a new date or time moves the block, a new duration resizes it, no time or
 * no date removes it.
 */
export interface TaskPatch {
  title?: string;
  date?: string | null;
  time?: string | null;
  durationMinutes?: number | null;
  priority?: TaskPriority | null;
  energy?: EnergyLevel | null;
  scope?: Scope;
  area?: Area | null;
  project?: string | null;
  labels?: string[];
  recurring?: boolean;
  deadline?: string | null;
  /** An empty string clears it. */
  description?: string;
  /** Links (null: unlinks) a goal; `goalTitle` follows. */
  goalId?: string | null;
  /** Replaces the subtask items (and so the `subtasks` summary); items without an id get one. */
  checklist?: (Omit<Subtask, "id"> & { id?: string })[];
}

/** Everything a delete removed, so `restore` can put it back exactly (tasks, their blocks, their positions). */
export interface TaskSnapshot {
  tasks: Task[];
  blocks: TimeBlock[];
  /** Store positions of `tasks`, ascending; keeps tie order stable after a restore. */
  positions: number[];
}

/** The three pills of My Day's Unscheduled card. */
export type UnscheduledRange = "today" | "overdue" | "week";

export interface UnscheduledQuery {
  day: string;
  range: UnscheduledRange;
  /** Only the "week" range reads it: the week ends where this config's week ends. Default IRAN_WEEK. */
  week?: WeekConfig;
}

export interface TasksRepository {
  list(query?: TaskQuery): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
  /**
   * Open tasks with no block on `day` and no time, for the range:
   * today = dated `day` plus open overdue (the "today" view), overdue = dated
   * before `day`, week = dated after `day` up to the end of the week.
   * Sorted by priority, then deadline, then title.
   */
  listUnscheduled(query: UnscheduledQuery): Promise<Task[]>;
  /** Task counts per view, honouring the same filters and search as `list`. */
  counts(query?: TaskCountsQuery): Promise<TaskCounts>;
  /** Every area a task can be filed under, by name. */
  listAreas(): Promise<Area[]>;
  /** Rejects "invalid" for an empty title, a bad date, time or duration, or a time without a date. */
  create(input: NewTaskInput): Promise<Task>;
  /** Applies a patch (see TaskPatch); rejects "not-found" or "invalid" and then changes nothing. */
  update(id: string, patch: TaskPatch): Promise<Task>;
  /**
   * Completes or reopens a task. Its timeline block follows (done flag);
   * completedAt comes from the planner clock and is cleared when reopened.
   */
  setDone(id: string, done: boolean): Promise<Task>;
  /**
   * Manual order: the ids get ascending `order` in the given sequence. When
   * every id already has a distinct order the same set of values is reused (so
   * the tasks keep their place among tasks not listed); otherwise the ids move
   * after every ordered task.
   */
  reorder(input: { ids: readonly string[] }): Promise<void>;
  /** Deletes tasks and their blocks; `restore` of the result undoes it. Unknown ids reject "not-found" and delete nothing. */
  remove(ids: readonly string[]): Promise<{ restore: TaskSnapshot }>;
  /** Puts a removed snapshot back (tasks, blocks, positions). Ids that exist again are skipped. */
  restore(snapshot: TaskSnapshot): Promise<void>;
  /** The same patch on several tasks, all or nothing. */
  bulkUpdate(ids: readonly string[], patch: TaskPatch): Promise<Task[]>;
  /** Appends a note stamped with the planner clock; rejects "invalid" for an empty body. */
  addNote(id: string, body: string): Promise<Task>;
}

/** Where a block goes: a day, an "HH:mm" start and optionally a new length. */
export interface BlockPlacement {
  day: string;
  start: string;
  /** Omitted: keep the block's (or the task's) current length. */
  durationMinutes?: number;
}

export interface BlocksRepository {
  /** Blocks overlapping the calendar day, in start order. */
  listForDay(day: string): Promise<TimeBlock[]>;
  /**
   * Puts a task on the timeline: creates its block, or moves the one it has,
   * and syncs the task's date, time and duration. Rejects "not-found" for an
   * unknown task and "invalid" for a placement that leaves its day.
   */
  schedule(taskId: string, placement: BlockPlacement): Promise<TimeBlock>;
  /** Moves and/or resizes ANY block. A task block also syncs its task. */
  move(blockId: string, placement: BlockPlacement): Promise<TimeBlock>;
  /**
   * Takes a task block off the timeline: the block is removed, the task keeps
   * its date and loses its time. Events, routines and breaks cannot be
   * unscheduled ("forbidden").
   */
  unschedule(blockId: string): Promise<void>;
  /** Marks a block done or open; a task block cascades to its task (status, completedAt). */
  setDone(blockId: string, done: boolean): Promise<TimeBlock>;
}

export interface InboxRepository {
  /** Items in one state (all states when omitted), newest capture first. */
  list(state?: InboxState): Promise<InboxItem[]>;
  /** Untriaged items only — the rail and More badge (P07: "not snoozed"). */
  count(): Promise<number>;
  /** A new capture ("Capture anything… it lands here"); rejects "invalid" for blank text. */
  capture(input: { text: string; source?: InboxSource }): Promise<InboxItem>;
  /** Hides the item until `until` (an instant); it then returns to triage tagged backFromSnooze. */
  snooze(ids: readonly string[], until: string): Promise<InboxItem[]>;
  archive(ids: readonly string[]): Promise<InboxItem[]>;
  /** Marks the item sent to a destination (the caller created the task first and passes its id). */
  process(id: string, outcome: { to: NonNullable<InboxItem["processedTo"]>; taskId?: string }): Promise<InboxItem>;
  /** Drops the item (a tombstone until the API decides; restore undoes it). */
  drop(id: string): Promise<InboxItem>;
  /** Back to untriaged: Undo, un-snooze, un-archive. Clears snooze and destination. */
  restore(ids: readonly string[]): Promise<InboxItem[]>;
}

/** A line as the editor saves it: a new id is a new line. */
export interface BrainDumpLineInput {
  id: string;
  text: string;
}

export interface BrainDumpSortOutcome {
  to: BrainDumpDestination;
  /** The day the destination points at (a task's or event's date; a journal entry's day). */
  day?: string | null;
  /** The task the caller created first ("task" only). */
  taskId?: string;
}

/** What remove / clear took off a page (and the Inbox items it created), so `restore` can put it back. */
export interface BrainDumpSnapshot {
  day: string;
  lines: BrainDumpLine[];
  /** Each line's index on the page before it left, ascending. */
  positions: number[];
  /** Inbox items the call created; restore drops them again. */
  inboxItemIds: string[];
}

/** Clear page: sorted and struck lines are archived; unsorted ones go to the Inbox, stay, or are archived too. */
export type BrainDumpClearMode = "inbox" | "keep" | "archive";

export interface BrainDumpRepository {
  /** Pages with writing, newest first; today's page is always listed (even empty). */
  pages(): Promise<BrainDumpPageSummary[]>;
  /** A day's page; an empty one (savedAt null) when nothing was written. Rejects "invalid" for a bad day. */
  page(day: string): Promise<BrainDumpPage>;
  /**
   * Auto-save: the page's lines in order. A known id keeps its sort tag (and
   * takes the new text); an unknown id is a new line; ids left out are deleted.
   * Trailing blank lines are dropped.
   */
  save(day: string, lines: readonly BrainDumpLineInput[]): Promise<BrainDumpPage>;
  /** Appends one thought (Inbox → Brain Dump); rejects "invalid" for blank text. */
  add(day: string, text: string): Promise<BrainDumpLine>;
  /** Tags lines with a destination; unknown ids reject "not-found" and tag nothing. */
  sort(day: string, ids: readonly string[], outcome: BrainDumpSortOutcome): Promise<BrainDumpPage>;
  strike(day: string, ids: readonly string[], struck: boolean): Promise<BrainDumpPage>;
  /** Undo of sort / send: the lines are unsorted again; an Inbox item a line created is dropped. */
  unsort(day: string, ids: readonly string[]): Promise<BrainDumpPage>;
  /** "Send rest to Inbox": each line becomes an untriaged Inbox item (source "brain-dump"), tagged → Inbox. */
  sendToInbox(day: string, ids: readonly string[]): Promise<BrainDumpPage>;
  /** Archives lines off the page; `restore` of the result undoes it. */
  remove(day: string, ids: readonly string[]): Promise<{ page: BrainDumpPage; restore: BrainDumpSnapshot }>;
  clear(day: string, unsorted: BrainDumpClearMode): Promise<{ page: BrainDumpPage; restore: BrainDumpSnapshot }>;
  /** Puts a snapshot back at its positions (ids already on the page are skipped) and drops the Inbox items it created. */
  restore(snapshot: BrainDumpSnapshot): Promise<BrainDumpPage>;
}

export interface PlanRepository {
  /** The day's ranked priorities (at most three), resolved against current tasks and blocks. */
  priorities(day: string): Promise<DayPriority[]>;
  /** Replaces the day's priorities (max 3, no duplicates; targets must exist). Order is rank. */
  setPriorities(day: string, refs: readonly DayPriorityRef[]): Promise<DayPriority[]>;
  focusToday(day: string): Promise<FocusSummary>;
  /** Records finished focus cycles on the day (P09); `cycle` is the next position in the Pomodoro cycle. Rejects "invalid" for a bad day or count. */
  recordFocusSessions(day: string, input: { count: number; cycle: number }): Promise<FocusSummary>;
}

/*
 * Module reads for Overview (P01). Read-only except checking a habit, which
 * Overview does in place; the module screens (P11–P15) extend these.
 */

/** The Habit sheet's fields (P18 · B). Frequency is the scheduled weekdays: rest weekdays are the others. */
export interface HabitInput {
  title: string;
  icon?: HabitIcon;
  area?: string | null;
  restWeekdays?: number[];
  target?: HabitTarget | null;
  timeOfDay?: HabitTimeOfDay;
  preferredTime?: string | null;
  reminder?: HabitReminder | null;
}

/** A partial habit edit: absent keys stay, null clears. */
export type HabitPatch = Partial<HabitInput>;

/** A day marked on purpose: skipped or rested; null clears the mark. */
export type HabitDayMark = "skip" | "rest" | null;

export interface HabitsRepository {
  /** Active habits (not archived), in the user's order. */
  list(): Promise<Habit[]>;
  /** Marks the habit done (or not) on the day and clears a skip / rest mark; rejects "not-found" for an unknown habit. */
  setDone(id: string, day: string, done: boolean): Promise<Habit>;
  /** Rejects "invalid" for a blank title, bad weekdays, target or time. The habit starts today. */
  create(input: HabitInput): Promise<Habit>;
  update(id: string, patch: HabitPatch): Promise<Habit>;
  /** Archive or restore (Undo). */
  setArchived(id: string, archived: boolean): Promise<Habit>;
  /** Skips or rests the day (clears done), or clears the mark. */
  setDayMark(id: string, day: string, mark: HabitDayMark): Promise<Habit>;
  /** Logs an amount for the day (habits with a target); the full target marks the day done. */
  logAmount(id: string, day: string, amount: number): Promise<Habit>;
}

/** The Goal sheet's fields (P18 · C); milestones are titles + due days, in order. */
export interface GoalInput {
  title: string;
  area?: string | null;
  target?: string | null;
  dueDay?: string | null;
  measure?: GoalMeasure | null;
  milestones?: { title: string; dueDay: string | null }[];
  notes?: string;
}

/** A partial goal edit: absent keys stay, null clears. Milestones have their own calls. */
export type GoalPatch = Partial<Omit<GoalInput, "milestones">>;

export interface GoalsRepository {
  /** Goals in one lifecycle (default "active"), in the user's order. */
  list(lifecycle?: GoalLifecycle): Promise<Goal[]>;
  get(id: string): Promise<Goal | null>;
  /** Rejects "invalid" for a blank title. */
  create(input: GoalInput): Promise<Goal>;
  /** Rejects "not-found" / "invalid"; a new title is copied onto linked tasks. */
  update(id: string, patch: GoalPatch): Promise<Goal>;
  /** Archive, restore or complete; Undo sets the previous lifecycle back. */
  setLifecycle(id: string, lifecycle: GoalLifecycle): Promise<Goal>;
  /** Inserts a milestone at `index` (default: last, just before the goal flag). */
  addMilestone(goalId: string, input: { title: string; dueDay: string | null }, index?: number): Promise<Goal>;
  /** Reaches (or reopens) a milestone; progress never drops below the share of milestones reached. */
  setMilestoneDone(goalId: string, milestoneId: string, done: boolean): Promise<Goal>;
  /** Tasks linked to the goal: open first (dated before undated), then done. */
  tasks(goalId: string): Promise<Task[]>;
}

/** Today's reflection (P10 Step 3); blank `wentWell` / `note` are left off. */
export interface ReflectionInput {
  mood: MoodEntry["mood"];
  energy: EnergyLevel;
  wentWell?: string;
  note?: string;
}

export interface JournalRepository {
  /** Mood check-ins from `from` to `to` (inclusive calendar days), oldest first. */
  moods(from: string, to: string): Promise<MoodEntry[]>;
  /**
   * Shutdown's reflection (P10) on the day's entry: sets mood and energy
   * (stamps the check-in with now), "what went well" when given, and appends
   * the note to the entry's text. Returns the day's mood row.
   */
  saveReflection(day: string, input: ReflectionInput): Promise<MoodEntry>;
  /** Entries from `from` to `to` (inclusive days; a month when listing), newest first. */
  entries(from: string, to: string): Promise<JournalEntry[]>;
  /** The day's entry, or null when nothing was written or checked in. */
  entry(day: string): Promise<JournalEntry | null>;
  /**
   * Field-level upsert of the day's entry (composer auto-save): only the
   * fields present in `patch` are applied over the CURRENT stored entry;
   * every other field keeps its latest value (a mood from the sheet, a line
   * from Inbox). A mood change stamps the check-in. With `text`, `baseText`
   * is the stored text the editor's text grew from: lines appended to the
   * stored text since then are re-appended to the editor's text (see
   * `rebaseJournalText`); without it, `text` replaces the stored text.
   */
  saveEntry(day: string, patch: JournalEntryPatch): Promise<JournalEntry>;
  /** Mood check-in (P18 · D): mood + energy; an optional word is appended to the text. */
  checkIn(day: string, input: JournalCheckInInput): Promise<JournalChange>;
  /** Appends a line (Inbox / Brain Dump → Journal) to the day's text. */
  append(day: string, text: string): Promise<JournalChange>;
  /** Removes and returns the day's entry, so Undo can restore it. */
  removeEntry(day: string): Promise<JournalEntry>;
  /** Puts an entry back exactly as it was (Undo). */
  restoreEntry(entry: JournalEntry): Promise<JournalEntry>;
}

export type JournalEntryPatch = Partial<Pick<JournalEntry, "mood" | "energy" | "wentWell" | "text" | "prompts" | "tags">> & {
  /** The stored text the patch's `text` was edited from (rebase point for appended lines). */
  baseText?: string;
};

export interface JournalCheckInInput {
  mood: MoodLevel;
  energy: EnergyLevel;
  note?: string;
}

/** A write and the entry before it (null: there was none); Undo restores `previous` or removes the entry. */
export interface JournalChange {
  entry: JournalEntry;
  previous: JournalEntry | null;
}

export type TransactionInput = Omit<Transaction, "id">;

export type TransactionPatch = Partial<TransactionInput>;

export interface FinanceRepository {
  /** The budget month containing `day`, or null when no budget is set. */
  monthSummary(day: string): Promise<FinanceMonthSummary | null>;
  /** The month starting on `start` (a Jalali month's first day); empty totals when it has no data. */
  month(start: string): Promise<FinanceMonth>;
  /** Transactions from `from` to `to` (inclusive days), newest first. */
  transactions(from: string, to: string): Promise<Transaction[]>;
  /** Bills due on or after `from`, soonest first. */
  upcomingBills(from: string): Promise<UpcomingBill[]>;
  /** One transaction (Add expense in edit mode). */
  transaction(id: string): Promise<Transaction>;
  addTransaction(input: TransactionInput): Promise<Transaction>;
  updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction>;
  /** Removes and returns the transaction, so Undo can restore it. */
  removeTransaction(id: string): Promise<Transaction>;
  /** Puts a removed transaction back with its id. */
  restoreTransaction(transaction: Transaction): Promise<Transaction>;
  /** Sets the month's budget (Empty state · Set budget). */
  setBudget(start: string, budgetToman: number): Promise<FinanceMonth>;
}

export interface InsightsRepository {
  /** The one pattern worth showing on `day`, or null. */
  highlight(day: string): Promise<InsightHighlight | null>;
  /** P15 header: how much data there is, and the headline once there is enough. */
  summary(day: string, period: InsightsPeriod): Promise<InsightsSummary>;
  /** One tab's pattern or its threshold progress; rejects when it cannot be calculated (per-tab error). */
  pattern<Id extends InsightPatternId>(id: Id, day: string, period: InsightsPeriod): Promise<InsightPatternResult<InsightPatternOf<Id>>>;
}

/** Weekly review (P16) progress. Wins ≤ 5 and priorities ≤ 3, else "invalid". */
export type WeeklyReviewPatch = Partial<Omit<WeeklyReview, "week" | "updatedAt">>;

export interface ReviewRepository {
  /** The week's review (week = its first day), or null before it was started. */
  get(week: string): Promise<WeeklyReview | null>;
  /** Field-level upsert: fields absent from `patch` keep their stored value. */
  save(week: string, patch: WeeklyReviewPatch): Promise<WeeklyReview>;
}

export interface Repositories {
  tasks: TasksRepository;
  blocks: BlocksRepository;
  inbox: InboxRepository;
  plan: PlanRepository;
  habits: HabitsRepository;
  goals: GoalsRepository;
  journal: JournalRepository;
  finance: FinanceRepository;
  insights: InsightsRepository;
  brainDump: BrainDumpRepository;
  review: ReviewRepository;
}
