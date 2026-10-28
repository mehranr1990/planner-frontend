import { parseClockTime, parseDay } from "@/lib/dates/clock-time";
import type { Habit, HabitReminder, HabitTarget } from "../domain";
import { RepositoryError, type HabitDayMark, type HabitInput, type HabitPatch, type HabitsRepository } from "../repositories";

/*
 * In-memory Habits (P12) over the adapter's habit store. A day is in at most
 * one of done / skipped / rested; logging the full target marks it done.
 * Reminders are data only (no notifications yet).
 */

interface MockHabitsOptions {
  habits: Habit[];
  today: string;
  respond<T>(value: T): Promise<T>;
}

function checkDay(day: string): void {
  if (parseDay(day) === null) throw new RepositoryError("invalid", `Bad day "${day}"`);
}

function checkTime(time: string | null | undefined): void {
  if (time && parseClockTime(time) === null) throw new RepositoryError("invalid", `Bad time "${time}"`);
}

function checkWeekdays(days: readonly number[] | undefined): void {
  if (!days) return;
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new RepositoryError("invalid", "Weekdays are 0–6");
  // A habit rests some days, never every day.
  if (new Set(days).size >= 7) throw new RepositoryError("invalid", "A habit needs at least one day");
}

function checkTarget(target: HabitTarget | null | undefined): void {
  if (target && !(target.amount > 0)) throw new RepositoryError("invalid", "A target needs a positive amount");
}

function checkReminder(reminder: HabitReminder | null | undefined): void {
  if (reminder) checkTime(reminder.time);
}

function without(list: readonly string[] | undefined, day: string): string[] {
  return (list ?? []).filter((item) => item !== day);
}

function applyPatch(habit: Habit, patch: HabitPatch): void {
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new RepositoryError("invalid", "A habit needs a name");
    habit.title = patch.title.trim();
  }
  checkWeekdays(patch.restWeekdays);
  checkTarget(patch.target);
  checkTime(patch.preferredTime);
  checkReminder(patch.reminder);
  if (patch.icon !== undefined) habit.icon = patch.icon;
  if (patch.area !== undefined) habit.area = patch.area?.trim() || undefined;
  if (patch.restWeekdays !== undefined) habit.restWeekdays = [...new Set(patch.restWeekdays)].sort();
  if (patch.target !== undefined) habit.target = patch.target ? { amount: patch.target.amount, unit: patch.target.unit.trim() } : null;
  if (patch.timeOfDay !== undefined) habit.timeOfDay = patch.timeOfDay;
  if (patch.preferredTime !== undefined) habit.preferredTime = patch.preferredTime;
  if (patch.reminder !== undefined) habit.reminder = patch.reminder;
}

export function createMockHabits({ habits, today, respond }: MockHabitsOptions): HabitsRepository {
  let counter = 0;

  function habitOrThrow(id: string): Habit {
    const habit = habits.find((item) => item.id === id);
    if (!habit) throw new RepositoryError("not-found", `No habit "${id}"`);
    return habit;
  }

  function clearDay(habit: Habit, day: string): void {
    habit.doneDays = without(habit.doneDays, day);
    if (habit.skippedDays) habit.skippedDays = without(habit.skippedDays, day);
    if (habit.restDays) habit.restDays = without(habit.restDays, day);
  }

  return {
    list() {
      return respond(habits.filter((habit) => !habit.archived));
    },
    async setDone(id, day, done) {
      const habit = habitOrThrow(id);
      checkDay(day);
      clearDay(habit, day);
      if (done) habit.doneDays.push(day);
      else if (habit.amounts) delete habit.amounts[day];
      return respond(habit);
    },
    async create(input: HabitInput) {
      if (!input.title.trim()) throw new RepositoryError("invalid", "A habit needs a name");
      const habit: Habit = { id: `h-new-${(counter += 1)}`, title: "", pinned: false, doneDays: [], restWeekdays: [], startDay: today };
      applyPatch(habit, input);
      habits.push(habit);
      return respond(habit);
    },
    async update(id, patch) {
      const habit = habitOrThrow(id);
      // Validate on a copy so a bad patch leaves the habit untouched.
      const draft = structuredClone(habit);
      applyPatch(draft, patch);
      Object.assign(habit, draft);
      return respond(habit);
    },
    async setArchived(id, archived) {
      const habit = habitOrThrow(id);
      habit.archived = archived;
      return respond(habit);
    },
    async setDayMark(id, day: string, mark: HabitDayMark) {
      const habit = habitOrThrow(id);
      checkDay(day);
      clearDay(habit, day);
      if (habit.amounts) delete habit.amounts[day];
      if (mark === "skip") habit.skippedDays = [...(habit.skippedDays ?? []), day];
      if (mark === "rest") habit.restDays = [...(habit.restDays ?? []), day];
      return respond(habit);
    },
    async logAmount(id, day, amount) {
      const habit = habitOrThrow(id);
      checkDay(day);
      if (!habit.target) throw new RepositoryError("invalid", "This habit has no target");
      if (!(amount >= 0)) throw new RepositoryError("invalid", "An amount cannot be negative");
      clearDay(habit, day);
      habit.amounts = { ...habit.amounts, [day]: amount };
      if (amount >= habit.target.amount) habit.doneDays.push(day);
      return respond(habit);
    },
  };
}
