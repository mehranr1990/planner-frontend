import type { DayPriorityRef, EnergyLevel, Task, TaskPriority } from "@/data/domain";
import type { DayBlock } from "./day-blocks";
import { exceedsEnergy } from "./energy";

const PRIORITY: Record<TaskPriority | "none", number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/**
 * "Pick top 3" for an empty Priorities card: open tasks due on or before
 * `day`, ordered by priority (urgent/high first), nearest deadline, whether
 * they fit the selected energy, whether they are already on the timeline,
 * then title. Returns refs ready for setPriorities.
 */
export function suggestTopThree(
  tasks: readonly Task[],
  blocks: readonly DayBlock[],
  options: { day: string; selectedEnergy: EnergyLevel },
): DayPriorityRef[] {
  const scheduled = new Set(blocks.flatMap((block) => (block.taskId ? [block.taskId] : [])));
  return tasks
    .filter((task) => task.status === "open" && task.date !== null && task.date <= options.day)
    .sort(
      (a, b) =>
        PRIORITY[a.priority ?? "none"] - PRIORITY[b.priority ?? "none"] ||
        (a.deadline ?? "9999-99-99").localeCompare(b.deadline ?? "9999-99-99") ||
        Number(exceedsEnergy(a, options.selectedEnergy)) - Number(exceedsEnergy(b, options.selectedEnergy)) ||
        Number(!scheduled.has(a.id)) - Number(!scheduled.has(b.id)) ||
        a.title.localeCompare(b.title, "en"),
    )
    .slice(0, 3)
    .map((task) => ({ kind: "task", id: task.id }));
}
