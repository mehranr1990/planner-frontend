import type { EnergyLevel, TaskPriority } from "@/data/domain";

/*
 * Energy filter: the selected level reorders the Unscheduled list so work
 * that fits the energy comes first. Nothing is hidden.
 */

const LEVEL: Record<EnergyLevel, number> = { low: 0, medium: 1, high: 2 };
const PRIORITY: Record<TaskPriority | "none", number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

interface EnergyTask {
  energy: EnergyLevel | null;
  priority: TaskPriority | null;
}

/** True for a task that needs more energy than the selected level (a null energy never does). */
export function exceedsEnergy(task: Pick<EnergyTask, "energy">, selected: EnergyLevel): boolean {
  return task.energy !== null && LEVEL[task.energy] > LEVEL[selected];
}

/**
 * Stable order: tasks that fit the selected energy (or have none) first,
 * tasks above it after; each group by priority, input order on ties.
 */
export function orderByEnergy<T extends EnergyTask>(tasks: readonly T[], selected: EnergyLevel): T[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (a, b) =>
        Number(exceedsEnergy(a.task, selected)) - Number(exceedsEnergy(b.task, selected)) ||
        PRIORITY[a.task.priority ?? "none"] - PRIORITY[b.task.priority ?? "none"] ||
        a.index - b.index,
    )
    .map(({ task }) => task);
}
