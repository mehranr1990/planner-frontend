"use client";

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useIsClient } from "@/hooks/use-is-client";
import type { WeekConfig } from "@/lib/dates/week";
import type {
  DayPriorityRef,
  FinanceMonth,
  FocusSummary,
  Goal,
  GoalLifecycle,
  Habit,
  InboxItem,
  InboxSource,
  InboxState,
  InsightPatternId,
  InsightsPeriod,
  JournalEntry,
  MoodEntry,
  Task,
  TimeBlock,
  Transaction,
  WeeklyReview,
} from "./domain";
import { useRepositories } from "./provider";
import { blockKeys, brainDumpKeys, financeKeys, goalKeys, inboxKeys, moduleKeys, planKeys, reviewKeys, taskKeys } from "./query-keys";
import type {
  GoalInput,
  GoalPatch,
  HabitDayMark,
  HabitInput,
  HabitPatch,
  BlockPlacement,
  BrainDumpClearMode,
  BrainDumpLineInput,
  BrainDumpSnapshot,
  BrainDumpSortOutcome,
  NewTaskInput,
  JournalChange,
  JournalCheckInInput,
  JournalEntryPatch,
  ReflectionInput,
  Repositories,
  TaskCountsQuery,
  TaskPatch,
  TaskQuery,
  TaskSnapshot,
  TransactionInput,
  TransactionPatch,
  UnscheduledRange,
  WeeklyReviewPatch,
} from "./repositories";

/*
 * Read hooks over the repositories. They only wire keys to repository calls;
 * filtering lives in the adapter and freshness in the app QueryClient
 * (staleTime 60s), so components never hold data rules.
 *
 * Hydration: the server renders every query as pending (nothing is prefetched
 * yet). A query that resolves on the client before a later streamed boundary
 * hydrates would otherwise render data where the server rendered "loading" —
 * a hydration mismatch. So each hook reports pending until hydration is over;
 * server prefetch (HydrationBoundary) replaces this when the API client lands.
 */

function afterHydration<TData, TError>(
  result: UseQueryResult<TData, TError>,
  hydrated: boolean,
): UseQueryResult<TData, TError> {
  if (hydrated) return result;
  return {
    ...result,
    data: undefined,
    status: "pending",
    isPending: true,
    isLoading: true,
    isSuccess: false,
    isError: false,
    error: null,
  } as UseQueryResult<TData, TError>;
}

export { blockKeys, goalKeys, inboxKeys, moduleKeys, planKeys, taskKeys } from "./query-keys";

export interface KeepPreviousOption {
  /** While a changed query loads, keep showing the last result (a typing search, a filter click) instead of going pending. */
  keepPrevious?: boolean;
}

export function useTasks(query: TaskQuery = {}, { keepPrevious = false }: KeepPreviousOption = {}) {
  const { tasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: taskKeys.list(query),
      queryFn: () => tasks.list(query),
      ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
    }),
    hydrated,
  );
}

/** Badge counts for the Tasks tabs; they follow the same filters and search as `useTasks`. */
export function useTaskCounts(query: TaskCountsQuery = {}, { keepPrevious = false }: KeepPreviousOption = {}) {
  const { tasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: taskKeys.counts(query),
      queryFn: () => tasks.counts(query),
      ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
    }),
    hydrated,
  );
}

/** Every area a task can be filed under (the Area filter and picker). */
export function useAreas() {
  const { tasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: taskKeys.areas(), queryFn: () => tasks.listAreas() }), hydrated);
}

/** One task; idle while `id` is null (no drawer open). */
export function useTask(id: string | null) {
  const { tasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: taskKeys.detail(id ?? ""),
      queryFn: () => tasks.get(id!),
      enabled: id !== null,
    }),
    hydrated,
  );
}

export function useBlocks(day: string) {
  const { blocks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: blockKeys.day(day), queryFn: () => blocks.listForDay(day) }), hydrated);
}

export interface BlocksForDays {
  /** Each day's blocks, in the order of `days`; empty while pending or failed. */
  data: readonly (readonly TimeBlock[])[];
  isPending: boolean;
  isError: boolean;
  refetch(): void;
}

const NO_BLOCKS: readonly TimeBlock[] = [];

function combineBlocks(results: UseQueryResult<TimeBlock[], Error>[]): BlocksForDays {
  return {
    data: results.map((result) => result.data ?? NO_BLOCKS),
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
    refetch: () => results.forEach((result) => void result.refetch()),
  };
}

/** Several days' blocks (Calendar week, month, agenda), sharing useBlocks' per-day cache entries. */
export function useBlocksForDays(days: readonly string[]): BlocksForDays {
  const { blocks } = useRepositories();
  const hydrated = useIsClient();
  const result = useQueries({
    queries: days.map((day) => ({ queryKey: blockKeys.day(day), queryFn: () => blocks.listForDay(day) })),
    combine: combineBlocks,
  });
  return hydrated ? result : { ...result, data: [], isPending: true, isError: false };
}

/** Untriaged Inbox items — the rail and More badge. */
export function useInboxCount() {
  const { inbox } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: inboxKeys.count(), queryFn: () => inbox.count() }), hydrated);
}

/** Open tasks with no time for My Day's Unscheduled card. Pass the planner settings' week for the "week" range. */
export function useUnscheduledTasks(day: string, range: UnscheduledRange, week?: WeekConfig) {
  const { tasks } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: taskKeys.unscheduled(day, range, week?.weekStartsOn ?? null),
      queryFn: () => tasks.listUnscheduled({ day, range, week }),
    }),
    hydrated,
  );
}

/** The day's ranked priorities (at most three). */
export function usePriorities(day: string) {
  const { plan } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: planKeys.priorities(day), queryFn: () => plan.priorities(day) }), hydrated);
}

/** Focus sessions done on the day, for the Focus card. */
export function useFocusToday(day: string) {
  const { plan } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: planKeys.focus(day), queryFn: () => plan.focusToday(day) }), hydrated);
}

/** P09: writes finished focus cycles, so useFocusToday (My Day, Overview) reflects them. */
export function useRecordFocusSessions() {
  const { plan } = useRepositories();
  const client = useQueryClient();
  return useMutation<FocusSummary, Error, { day: string; count: number; cycle: number }>({
    mutationFn: ({ day, ...input }) => plan.recordFocusSessions(day, input),
    onSuccess: (_summary, { day }) => client.invalidateQueries({ queryKey: planKeys.focus(day) }),
  });
}

/*
 * Mutations. Each resolves to the changed TimeBlock (unschedule: nothing), so
 * a caller can build "Undo" from the placement it held beforehand. Every one
 * invalidates the families a schedule change can touch: blocks, tasks (the
 * Unscheduled lists and task rows) and plan (priorities show times).
 */

function invalidateSchedule(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: blockKeys.all }),
    client.invalidateQueries({ queryKey: taskKeys.all }),
    client.invalidateQueries({ queryKey: planKeys.all }),
  ]);
}

export interface ScheduleTaskInput extends BlockPlacement {
  taskId: string;
}

export interface MoveBlockInput extends BlockPlacement {
  blockId: string;
}

export function useScheduleTask() {
  const { blocks } = useRepositories();
  const client = useQueryClient();
  return useMutation<TimeBlock, Error, ScheduleTaskInput>({
    mutationFn: ({ taskId, ...placement }) => blocks.schedule(taskId, placement),
    onSuccess: () => invalidateSchedule(client),
  });
}

export function useMoveBlock() {
  const { blocks } = useRepositories();
  const client = useQueryClient();
  return useMutation<TimeBlock, Error, MoveBlockInput>({
    mutationFn: ({ blockId, ...placement }) => blocks.move(blockId, placement),
    onSuccess: () => invalidateSchedule(client),
  });
}

export function useUnscheduleBlock() {
  const { blocks } = useRepositories();
  const client = useQueryClient();
  return useMutation<void, Error, { blockId: string }>({
    mutationFn: ({ blockId }) => blocks.unschedule(blockId),
    onSuccess: () => invalidateSchedule(client),
  });
}

export function useSetBlockDone() {
  const { blocks } = useRepositories();
  const client = useQueryClient();
  return useMutation<TimeBlock, Error, { blockId: string; done: boolean }>({
    mutationFn: ({ blockId, done }) => blocks.setDone(blockId, done),
    onSuccess: () => invalidateSchedule(client),
  });
}

export function useSetPriorities() {
  const { plan } = useRepositories();
  const client = useQueryClient();
  return useMutation<unknown, Error, { day: string; refs: readonly DayPriorityRef[] }>({
    mutationFn: ({ day, refs }) => plan.setPriorities(day, refs),
    onSuccess: () => invalidateSchedule(client),
  });
}

/*
 * Task mutations (P03). Same invalidation as the schedule mutations: a task
 * change can move, resize or remove its block and changes the plan's rows.
 */

export function useCreateTask() {
  const { tasks } = useRepositories();
  const client = useQueryClient();
  return useMutation<Task, Error, NewTaskInput>({
    mutationFn: (input) => tasks.create(input),
    onSuccess: () => invalidateSchedule(client),
  });
}

export function useUpdateTask() {
  const { tasks } = useRepositories();
  const client = useQueryClient();
  return useMutation<Task, Error, { id: string; patch: TaskPatch }>({
    mutationFn: ({ id, patch }) => tasks.update(id, patch),
    onSuccess: () => invalidateSchedule(client),
  });
}

export function useSetTaskDone() {
  const { tasks } = useRepositories();
  const client = useQueryClient();
  return useMutation<Task, Error, { id: string; done: boolean }>({
    mutationFn: ({ id, done }) => tasks.setDone(id, done),
    onSuccess: () => invalidateSchedule(client),
  });
}

export function useReorderTasks() {
  const { tasks } = useRepositories();
  const client = useQueryClient();
  return useMutation<void, Error, { ids: readonly string[] }>({
    mutationFn: ({ ids }) => tasks.reorder({ ids }),
    onSuccess: () => invalidateSchedule(client),
  });
}

/** Resolves to `{ restore }`: pass it to `useRestoreTasks` for the Undo toast. */
export function useRemoveTasks() {
  const { tasks } = useRepositories();
  const client = useQueryClient();
  return useMutation<{ restore: TaskSnapshot }, Error, { ids: readonly string[] }>({
    mutationFn: ({ ids }) => tasks.remove(ids),
    onSuccess: () => invalidateSchedule(client),
  });
}

export function useRestoreTasks() {
  const { tasks } = useRepositories();
  const client = useQueryClient();
  return useMutation<void, Error, TaskSnapshot>({
    mutationFn: (snapshot) => tasks.restore(snapshot),
    onSuccess: () => invalidateSchedule(client),
  });
}

/** P06 Notes tab: appends a note (no schedule effect, so only the task families refresh). */
export function useAddTaskNote() {
  const { tasks } = useRepositories();
  const client = useQueryClient();
  return useMutation<Task, Error, { id: string; body: string }>({
    mutationFn: ({ id, body }) => tasks.addNote(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useBulkUpdateTasks() {
  const { tasks } = useRepositories();
  const client = useQueryClient();
  return useMutation<Task[], Error, { ids: readonly string[]; patch: TaskPatch }>({
    mutationFn: ({ ids, patch }) => tasks.bulkUpdate(ids, patch),
    onSuccess: () => invalidateSchedule(client),
  });
}

/** Focus sessions per day for several days (Weekly review), sharing useFocusToday's cache entries. */
export function useFocusForDays(days: readonly string[]) {
  const { plan } = useRepositories();
  const hydrated = useIsClient();
  const result = useQueries({
    queries: days.map((day) => ({ queryKey: planKeys.focus(day), queryFn: () => plan.focusToday(day) })),
    combine: (results: UseQueryResult<FocusSummary, Error>[]) => ({
      data: results.map((item) => item.data ?? null),
      isPending: results.some((item) => item.isPending),
    }),
  });
  return hydrated ? result : { data: days.map(() => null), isPending: true };
}

// ── Weekly review (P16) ──────────────────────────────────────────────────

/** The week's review progress (week = its first day), or null before it was started. */
export function useWeeklyReview(week: string) {
  const { review } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: reviewKeys.week(week), queryFn: () => review.get(week) }), hydrated);
}

/** Field-level save of the week's review (Save & exit, Finish). */
export function useSaveWeeklyReview() {
  const { review } = useRepositories();
  const client = useQueryClient();
  return useMutation<WeeklyReview, Error, { week: string; patch: WeeklyReviewPatch }>({
    mutationFn: ({ week, patch }) => review.save(week, patch),
    onSuccess: (saved) => client.setQueryData(reviewKeys.week(saved.week), saved),
  });
}

// ── Module reads (Overview P01) ──────────────────────────────────────────

export function useHabits() {
  const { habits } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: moduleKeys.habits, queryFn: () => habits.list() }), hydrated);
}

/** Checks a habit on a day, in place (Overview Habits card). */
export function useSetHabitDone() {
  const { habits } = useRepositories();
  const client = useQueryClient();
  return useMutation<Habit, Error, { id: string; day: string; done: boolean }>({
    mutationFn: ({ id, day, done }) => habits.setDone(id, day, done),
    onSuccess: () => client.invalidateQueries({ queryKey: moduleKeys.habits }),
  });
}

/** A habit write (P12) refreshes the habit list (Overview, Habits, Goals → Linked). */
function useHabitMutation<V>(run: (repo: Repositories["habits"], vars: V) => Promise<Habit>) {
  const { habits } = useRepositories();
  const client = useQueryClient();
  return useMutation<Habit, Error, V>({
    mutationFn: (vars) => run(habits, vars),
    onSuccess: () => client.invalidateQueries({ queryKey: moduleKeys.habits }),
  });
}

export function useCreateHabit() {
  return useHabitMutation<HabitInput>((repo, input) => repo.create(input));
}

export function useUpdateHabit() {
  return useHabitMutation<{ id: string; patch: HabitPatch }>((repo, { id, patch }) => repo.update(id, patch));
}

export function useSetHabitArchived() {
  return useHabitMutation<{ id: string; archived: boolean }>((repo, { id, archived }) => repo.setArchived(id, archived));
}

/** Long-press on a habit: skip or rest the day (null clears). */
export function useSetHabitDayMark() {
  return useHabitMutation<{ id: string; day: string; mark: HabitDayMark }>((repo, { id, day, mark }) => repo.setDayMark(id, day, mark));
}

export function useLogHabitAmount() {
  return useHabitMutation<{ id: string; day: string; amount: number }>((repo, { id, day, amount }) => repo.logAmount(id, day, amount));
}

export function useGoals() {
  const { goals } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: moduleKeys.goals, queryFn: () => goals.list() }), hydrated);
}

// ── Goals (P11) ──────────────────────────────────────────────────────────

/** Goals in one lifecycle (the P11 list tabs). */
export function useGoalList(lifecycle: GoalLifecycle) {
  const { goals } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: goalKeys.list(lifecycle), queryFn: () => goals.list(lifecycle) }), hydrated);
}

export function useGoal(id: string | null) {
  const { goals } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: goalKeys.detail(id ?? ""), queryFn: () => goals.get(id!), enabled: id !== null }),
    hydrated,
  );
}

/** Tasks linked to a goal, open first. */
export function useGoalTasks(id: string | null) {
  const { goals } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: goalKeys.tasks(id ?? ""), queryFn: () => goals.tasks(id!), enabled: id !== null }),
    hydrated,
  );
}

/** A goal write refreshes every goal read and (titles, links) the task reads. */
function invalidateGoals(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: goalKeys.all }),
    client.invalidateQueries({ queryKey: taskKeys.all }),
  ]);
}

export function useCreateGoal() {
  const { goals } = useRepositories();
  const client = useQueryClient();
  return useMutation<Goal, Error, GoalInput>({ mutationFn: (input) => goals.create(input), onSuccess: () => invalidateGoals(client) });
}

export function useUpdateGoal() {
  const { goals } = useRepositories();
  const client = useQueryClient();
  return useMutation<Goal, Error, { id: string; patch: GoalPatch }>({
    mutationFn: ({ id, patch }) => goals.update(id, patch),
    onSuccess: () => invalidateGoals(client),
  });
}

export function useSetGoalLifecycle() {
  const { goals } = useRepositories();
  const client = useQueryClient();
  return useMutation<Goal, Error, { id: string; lifecycle: GoalLifecycle }>({
    mutationFn: ({ id, lifecycle }) => goals.setLifecycle(id, lifecycle),
    onSuccess: () => invalidateGoals(client),
  });
}

export function useAddMilestone() {
  const { goals } = useRepositories();
  const client = useQueryClient();
  return useMutation<Goal, Error, { goalId: string; title: string; dueDay: string | null; index?: number }>({
    mutationFn: ({ goalId, title, dueDay, index }) => goals.addMilestone(goalId, { title, dueDay }, index),
    onSuccess: () => invalidateGoals(client),
  });
}

export function useSetMilestoneDone() {
  const { goals } = useRepositories();
  const client = useQueryClient();
  return useMutation<Goal, Error, { goalId: string; milestoneId: string; done: boolean }>({
    mutationFn: ({ goalId, milestoneId, done }) => goals.setMilestoneDone(goalId, milestoneId, done),
    onSuccess: () => invalidateGoals(client),
  });
}

/** Mood check-ins from `from` to `to`, inclusive, oldest first. */
export function useMoods(from: string, to: string) {
  const { journal } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: moduleKeys.moods(from, to), queryFn: () => journal.moods(from, to) }), hydrated);
}

/** Saves today's reflection (P10) as the day's Journal entry; refreshes every mood read. */
export function useSaveReflection() {
  const { journal } = useRepositories();
  const client = useQueryClient();
  return useMutation<MoodEntry, Error, { day: string } & ReflectionInput>({
    mutationFn: ({ day, ...input }) => journal.saveReflection(day, input),
    onSuccess: () => client.invalidateQueries({ queryKey: moduleKeys.journal }),
  });
}

/** Journal entries from `from` to `to` (a month when listing), newest first (P14). */
export function useJournalEntries(from: string, to: string) {
  const { journal } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: moduleKeys.journalEntries(from, to), queryFn: () => journal.entries(from, to), placeholderData: keepPreviousData }),
    hydrated,
  );
}

/** The day's entry, or null (P14 composer). */
export function useJournalEntry(day: string) {
  const { journal } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: moduleKeys.journalEntry(day), queryFn: () => journal.entry(day) }), hydrated);
}

/** Composer auto-save; refreshes every Journal and mood read. */
export function useSaveJournalEntry() {
  const { journal } = useRepositories();
  const client = useQueryClient();
  return useMutation<JournalEntry, Error, { day: string; patch: JournalEntryPatch }>({
    mutationFn: ({ day, patch }) => journal.saveEntry(day, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: moduleKeys.journal }),
  });
}

/** Mood check-in (P18 · D) on the day's entry. */
export function useJournalCheckIn() {
  const { journal } = useRepositories();
  const client = useQueryClient();
  return useMutation<JournalChange, Error, { day: string } & JournalCheckInInput>({
    mutationFn: ({ day, ...input }) => journal.checkIn(day, input),
    onSuccess: () => client.invalidateQueries({ queryKey: moduleKeys.journal }),
  });
}

/** Inbox / Brain Dump → Journal: appends a line to the day's entry. */
export function useAppendJournal() {
  const { journal } = useRepositories();
  const client = useQueryClient();
  return useMutation<JournalChange, Error, { day: string; text: string }>({
    mutationFn: ({ day, text }) => journal.append(day, text),
    onSuccess: () => client.invalidateQueries({ queryKey: moduleKeys.journal }),
  });
}

/**
 * Undo for any Journal write: puts `previous` back, or removes the day's
 * entry when there was none before. Also deletes an entry (Undo restores it).
 */
export function useRevertJournal() {
  const { journal } = useRepositories();
  const client = useQueryClient();
  return useMutation<JournalEntry | null, Error, { day: string; previous: JournalEntry | null }>({
    mutationFn: ({ day, previous }) => (previous ? journal.restoreEntry(previous) : journal.removeEntry(day)),
    onSuccess: () => client.invalidateQueries({ queryKey: moduleKeys.journal }),
  });
}

export function useFinanceMonth(day: string) {
  const { finance } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: moduleKeys.finance(day), queryFn: () => finance.monthSummary(day) }), hydrated);
}

// ── Finance (P13) ────────────────────────────────────────────────────────

/** A budget month with totals and category budgets; keeps the previous month while switching. */
export function useFinanceMonthDetail(start: string) {
  const { finance } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: financeKeys.month(start), queryFn: () => finance.month(start), placeholderData: keepPreviousData }),
    hydrated,
  );
}

/** Transactions from `from` to `to`, newest first. */
export function useTransactions(from: string, to: string) {
  const { finance } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: financeKeys.transactions(from, to), queryFn: () => finance.transactions(from, to), placeholderData: keepPreviousData }),
    hydrated,
  );
}

export function useUpcomingBills(from: string) {
  const { finance } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: financeKeys.bills(from), queryFn: () => finance.upcomingBills(from) }), hydrated);
}

export function useTransaction(id: string | null) {
  const { finance } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: financeKeys.transaction(id ?? ""), queryFn: () => finance.transaction(id!), enabled: id !== null }),
    hydrated,
  );
}

/** A finance write refreshes every finance read (and Overview's summary, which sits under the same root). */
function useFinanceMutation<T, V>(run: (repo: Repositories["finance"], vars: V) => Promise<T>) {
  const { finance } = useRepositories();
  const client = useQueryClient();
  return useMutation<T, Error, V>({
    mutationFn: (vars) => run(finance, vars),
    onSuccess: () => client.invalidateQueries({ queryKey: financeKeys.all }),
  });
}

export function useAddTransaction() {
  return useFinanceMutation<Transaction, TransactionInput>((repo, input) => repo.addTransaction(input));
}

export function useUpdateTransaction() {
  return useFinanceMutation<Transaction, { id: string; patch: TransactionPatch }>((repo, { id, patch }) => repo.updateTransaction(id, patch));
}

export function useRemoveTransaction() {
  return useFinanceMutation<Transaction, string>((repo, id) => repo.removeTransaction(id));
}

export function useRestoreTransaction() {
  return useFinanceMutation<Transaction, Transaction>((repo, tx) => repo.restoreTransaction(tx));
}

export function useSetBudget() {
  return useFinanceMutation<FinanceMonth, { start: string; budgetToman: number }>((repo, { start, budgetToman }) => repo.setBudget(start, budgetToman));
}

export function useInsightHighlight(day: string) {
  const { insights } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: moduleKeys.insight(day), queryFn: () => insights.highlight(day) }), hydrated);
}

/** P15: data volume + headline for a period. */
export function useInsightsSummary(day: string, period: InsightsPeriod) {
  const { insights } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({ queryKey: moduleKeys.insightsSummary(day, period), queryFn: () => insights.summary(day, period), placeholderData: keepPreviousData }),
    hydrated,
  );
}

/** P15: one tab's pattern; each tab loads and fails on its own (no retry: the tab offers Retry). */
export function useInsightPattern<Id extends InsightPatternId>(id: Id, day: string, period: InsightsPeriod) {
  const { insights } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(
    useQuery({
      queryKey: moduleKeys.insightPattern(id, day, period),
      queryFn: () => insights.pattern(id, day, period),
      placeholderData: keepPreviousData,
      retry: false,
    }),
    hydrated,
  );
}

// ── Inbox (P07) ──────────────────────────────────────────────────────────

/** One Inbox tab: "untriaged" (Triage), "snoozed" or "archived". */
export function useInboxItems(state: InboxState) {
  const { inbox } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: inboxKeys.list(state), queryFn: () => inbox.list(state) }), hydrated);
}

/**
 * Inbox mutations. Every one refreshes the whole inbox family, so the tab
 * lists and the rail / More badge (untriaged count) always agree.
 */
function useInboxMutation<TVariables, TData>(run: (inbox: Repositories["inbox"], variables: TVariables) => Promise<TData>) {
  const { inbox } = useRepositories();
  const client = useQueryClient();
  return useMutation<TData, Error, TVariables>({
    mutationFn: (variables) => run(inbox, variables),
    onSuccess: () => client.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export const useCaptureInbox = () =>
  useInboxMutation((inbox, input: { text: string; source?: InboxSource }) => inbox.capture(input));
export const useSnoozeInbox = () =>
  useInboxMutation((inbox, { ids, until }: { ids: readonly string[]; until: string }) => inbox.snooze(ids, until));
export const useArchiveInbox = () => useInboxMutation((inbox, { ids }: { ids: readonly string[] }) => inbox.archive(ids));
export const useProcessInbox = () =>
  useInboxMutation((inbox, { id, ...outcome }: { id: string; to: NonNullable<InboxItem["processedTo"]>; taskId?: string }) =>
    inbox.process(id, outcome),
  );
export const useDropInbox = () => useInboxMutation((inbox, { id }: { id: string }) => inbox.drop(id));
export const useRestoreInbox = () => useInboxMutation((inbox, { ids }: { ids: readonly string[] }) => inbox.restore(ids));

// ── Brain Dump (P08) ─────────────────────────────────────────────────────

/** The pages list (newest first, today always there). */
export function useBrainDumpPages() {
  const { brainDump } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: brainDumpKeys.pages(), queryFn: () => brainDump.pages() }), hydrated);
}

/** One day's page. */
export function useBrainDumpPage(day: string) {
  const { brainDump } = useRepositories();
  const hydrated = useIsClient();
  return afterHydration(useQuery({ queryKey: brainDumpKeys.page(day), queryFn: () => brainDump.page(day) }), hydrated);
}

/** Auto-save: writes the page into the cache (no refetch under the editor) and refreshes the counts. */
export function useSaveBrainDump() {
  const { brainDump } = useRepositories();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ day, lines }: { day: string; lines: readonly BrainDumpLineInput[] }) => brainDump.save(day, lines),
    onSuccess: (page) => {
      client.setQueryData(brainDumpKeys.page(page.day), page);
      return client.invalidateQueries({ queryKey: brainDumpKeys.pages() });
    },
  });
}

/** Sorting mutations. Sending and its Undo touch the Inbox too, so both families refresh. */
function useBrainDumpMutation<TVariables, TData>(run: (brainDump: Repositories["brainDump"], variables: TVariables) => Promise<TData>) {
  const { brainDump } = useRepositories();
  const client = useQueryClient();
  return useMutation<TData, Error, TVariables>({
    mutationFn: (variables) => run(brainDump, variables),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: brainDumpKeys.all }),
        client.invalidateQueries({ queryKey: inboxKeys.all }),
      ]),
  });
}

type LinesOn = { day: string; ids: readonly string[] };

export const useAddBrainDumpLine = () =>
  useBrainDumpMutation((brainDump, { day, text }: { day: string; text: string }) => brainDump.add(day, text));
export const useSortBrainDump = () =>
  useBrainDumpMutation((brainDump, { day, ids, outcome }: LinesOn & { outcome: BrainDumpSortOutcome }) => brainDump.sort(day, ids, outcome));
export const useStrikeBrainDump = () =>
  useBrainDumpMutation((brainDump, { day, ids, struck }: LinesOn & { struck: boolean }) => brainDump.strike(day, ids, struck));
export const useUnsortBrainDump = () => useBrainDumpMutation((brainDump, { day, ids }: LinesOn) => brainDump.unsort(day, ids));
export const useSendBrainDumpToInbox = () =>
  useBrainDumpMutation((brainDump, { day, ids }: LinesOn) => brainDump.sendToInbox(day, ids));
export const useRemoveBrainDumpLines = () => useBrainDumpMutation((brainDump, { day, ids }: LinesOn) => brainDump.remove(day, ids));
export const useClearBrainDump = () =>
  useBrainDumpMutation((brainDump, { day, unsorted }: { day: string; unsorted: BrainDumpClearMode }) => brainDump.clear(day, unsorted));
export const useRestoreBrainDump = () =>
  useBrainDumpMutation((brainDump, { snapshot }: { snapshot: BrainDumpSnapshot }) => brainDump.restore(snapshot));
