import { parseDay } from "@/lib/dates/clock-time";
import type { Goal, GoalLifecycle, GoalMeasure, Task } from "../domain";
import { RepositoryError, type GoalInput, type GoalPatch, type GoalsRepository } from "../repositories";

/*
 * In-memory Goals (P11) over the adapter's goal and task stores. Goals own
 * their milestones; tasks point at goals (Task.goalId), so "linked tasks" is
 * a read over the shared task store and a renamed goal renames `goalTitle`.
 */

interface MockGoalsOptions {
  goals: Goal[];
  tasks: Task[];
  today: string;
  respond<T>(value: T): Promise<T>;
}

const LIFECYCLES: readonly GoalLifecycle[] = ["active", "completed", "archived"];

export const lifecycleOf = (goal: Goal): GoalLifecycle => goal.lifecycle ?? "active";

function checkDay(day: string | null | undefined): void {
  if (day && parseDay(day) === null) throw new RepositoryError("invalid", `Bad day "${day}"`);
}

function checkMeasure(measure: GoalMeasure | null | undefined): void {
  if (!measure) return;
  if (!(measure.target > 0) || !(measure.current >= 0)) throw new RepositoryError("invalid", "A measure needs a positive target");
}

/** Share of milestones reached, 0–1 (0 without milestones). */
function milestoneShare(goal: Goal): number {
  const list = goal.milestones ?? [];
  return list.length ? list.filter((item) => item.doneDay).length / list.length : 0;
}

/** Recomputes the Overview summary fields (progress, next step) from the goal's own data. */
function refresh(goal: Goal): void {
  if (goal.measure) goal.progress = Math.min(1, goal.measure.current / goal.measure.target);
  // "Next" is the milestone after the one in progress (P11: Development in progress → "Next · Beta").
  const open = (goal.milestones ?? []).filter((item) => !item.doneDay);
  const next = open[1] ?? open[0];
  if (goal.milestones?.length) {
    goal.nextStep = next?.title ?? null;
    goal.nextStepDay = next?.dueDay ?? null;
  }
}

export function createMockGoals({ goals, tasks, today, respond }: MockGoalsOptions): GoalsRepository {
  let goalCounter = 0;
  let milestoneCounter = 0;

  function goalOrThrow(id: string): Goal {
    const goal = goals.find((item) => item.id === id);
    if (!goal) throw new RepositoryError("not-found", `No goal "${id}"`);
    return goal;
  }

  const nextMilestoneId = () => `m-new-${(milestoneCounter += 1)}`;

  return {
    list(lifecycle = "active") {
      return respond(goals.filter((goal) => lifecycleOf(goal) === lifecycle));
    },
    get(id) {
      return respond(goals.find((goal) => goal.id === id) ?? null);
    },
    async create(input: GoalInput) {
      const title = input.title.trim();
      if (!title) throw new RepositoryError("invalid", "A goal needs a title");
      checkDay(input.dueDay);
      checkMeasure(input.measure);
      for (const item of input.milestones ?? []) {
        if (!item.title.trim()) throw new RepositoryError("invalid", "A milestone needs a title");
        checkDay(item.dueDay);
      }
      let id: string;
      do id = `g-new-${(goalCounter += 1)}`;
      while (goals.some((goal) => goal.id === id));
      const goal: Goal = { id, title, progress: 0, status: "on-track", nextStep: null, nextStepDay: null, lifecycle: "active" };
      if (input.area?.trim()) goal.area = input.area.trim();
      if (input.target?.trim()) goal.target = input.target.trim();
      if (input.dueDay) goal.dueDay = input.dueDay;
      if (input.measure) goal.measure = { ...input.measure };
      if (input.notes?.trim()) goal.notes = input.notes.trim();
      const milestones = (input.milestones ?? []).map((item) => ({ id: nextMilestoneId(), title: item.title.trim(), dueDay: item.dueDay, doneDay: null }));
      if (milestones.length) goal.milestones = milestones;
      refresh(goal);
      goals.unshift(goal);
      return respond(goal);
    },
    async update(id, patch: GoalPatch) {
      const goal = goalOrThrow(id);
      if (patch.title !== undefined && !patch.title.trim()) throw new RepositoryError("invalid", "A goal needs a title");
      checkDay(patch.dueDay);
      checkMeasure(patch.measure);
      if (patch.title !== undefined) {
        goal.title = patch.title.trim();
        for (const task of tasks) if (task.goalId === id) task.goalTitle = goal.title;
      }
      const text = (key: "area" | "target", value: string | null | undefined) => {
        if (value === undefined) return;
        if (value?.trim()) goal[key] = value.trim();
        else delete goal[key];
      };
      text("area", patch.area);
      text("target", patch.target);
      if (patch.dueDay !== undefined) goal.dueDay = patch.dueDay;
      if (patch.measure !== undefined) {
        if (patch.measure) goal.measure = { ...patch.measure };
        else delete goal.measure;
      }
      if (patch.notes !== undefined) {
        if (patch.notes.trim()) goal.notes = patch.notes.trim();
        else delete goal.notes;
      }
      refresh(goal);
      return respond(goal);
    },
    async setLifecycle(id, lifecycle) {
      if (!LIFECYCLES.includes(lifecycle)) throw new RepositoryError("invalid", `Bad lifecycle "${lifecycle}"`);
      const goal = goalOrThrow(id);
      goal.lifecycle = lifecycle;
      if (lifecycle === "completed") {
        goal.completedDay ??= today;
        goal.progress = 1;
      } else delete goal.completedDay;
      return respond(goal);
    },
    async addMilestone(goalId, input, index) {
      const goal = goalOrThrow(goalId);
      if (!input.title.trim()) throw new RepositoryError("invalid", "A milestone needs a title");
      checkDay(input.dueDay);
      const list = goal.milestones ?? [];
      const at = index === undefined ? list.length : Math.max(0, Math.min(list.length, index));
      list.splice(at, 0, { id: nextMilestoneId(), title: input.title.trim(), dueDay: input.dueDay, doneDay: null });
      goal.milestones = list;
      refresh(goal);
      return respond(goal);
    },
    async setMilestoneDone(goalId, milestoneId, done) {
      const goal = goalOrThrow(goalId);
      const milestone = goal.milestones?.find((item) => item.id === milestoneId);
      if (!milestone) throw new RepositoryError("not-found", `No milestone "${milestoneId}"`);
      milestone.doneDay = done ? (milestone.doneDay ?? today) : null;
      const share = milestoneShare(goal);
      goal.progress = done ? Math.max(goal.progress, share) : Math.min(goal.progress, share);
      refresh(goal);
      return respond(goal);
    },
    async tasks(goalId) {
      goalOrThrow(goalId);
      const linked = tasks.filter((task) => task.goalId === goalId);
      const rank = (task: Task) => (task.status === "done" ? 2 : task.date ? 0 : 1);
      linked.sort((a, b) => rank(a) - rank(b) || (a.date ?? "").localeCompare(b.date ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));
      return respond(linked);
    },
  };
}
