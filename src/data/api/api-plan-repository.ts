import type { DayPriority } from "../domain";
import { RepositoryError, type PlanRepository } from "../repositories";
import type { DayPlans } from "./api-day-plans";
import type { ApiTasksRepository } from "./api-tasks-repository";

/*
 * My Day priorities on the server Day plan (Phase 03): the day's top three
 * are its first three task items in plan order. Setting them selects any
 * missing task into the Day (Day If-Match + task revision) and reorders the
 * Day with them first; other planned items keep their order after them.
 * Block priorities (TimeBlocks) wait for the Calendar integration (Phase 04).
 * Focus stats come from the Focus adapter (Phase 07, api-focus.ts).
 */

const MAX_PRIORITIES = 3;

export function createApiPlanRepository(
  dayPlans: DayPlans,
  tasks: ApiTasksRepository,
  focus: Pick<PlanRepository, "focusToday" | "recordFocusSessions">,
): PlanRepository {
  // Always a fresh read (one request): item status changes elsewhere must not show stale priorities.
  async function priorities(day: string): Promise<DayPriority[]> {
    const plan = await dayPlans.get(day, true);
    const items = [...(plan?.items ?? [])]
      .filter((item) => item.task && !item.task.deleted && item.task.status !== "CANCELED")
      .sort((a, b) => a.position - b.position)
      .slice(0, MAX_PRIORITIES);
    const out: DayPriority[] = [];
    for (const [index, item] of items.entries()) {
      const task = tasks.peek(item.taskId) ?? (await tasks.get(item.taskId));
      out.push({
        rank: (index + 1) as DayPriority["rank"],
        kind: "task",
        id: item.taskId,
        title: task?.title ?? item.task?.title ?? "",
        scope: "personal",
        time: task?.time ?? null,
        durationMinutes: item.plannedMinutes ?? task?.durationMinutes ?? null,
        energy: null,
      });
    }
    return out;
  }

  return {
    priorities: (day) => priorities(day),
    async setPriorities(day, refs) {
      if (refs.length > MAX_PRIORITIES || new Set(refs.map((ref) => ref.id)).size !== refs.length) {
        throw new RepositoryError("invalid", "At most three distinct priorities");
      }
      if (refs.some((ref) => ref.kind !== "task")) throw new RepositoryError("unsupported", "Block priorities need the Calendar integration");
      const first = [];
      for (const ref of refs) {
        // Detail read: the freshest Task revision for the item selection.
        const task = await tasks.get(ref.id);
        if (!task) throw new RepositoryError("not-found", "Task not found");
        first.push({ taskId: task.id, taskRevision: tasks.revisionOf(task.id), plannedMinutes: task.durationMinutes });
      }
      await dayPlans.order(day, first);
      return priorities(day);
    },
    focusToday: (day) => focus.focusToday(day),
    recordFocusSessions: (day, input) => focus.recordFocusSessions(day, input),
  };
}
