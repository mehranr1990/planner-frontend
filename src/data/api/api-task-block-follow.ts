import { ApiHttpError } from "@/api/errors";
import type { Task } from "../domain";
import { RepositoryError, type TaskPatch } from "../repositories";
import type { ApiTasksRepository } from "./api-tasks-repository";

/*
 * Task ⇄ block follow (Phase 04b, decision D5). The API never moves a time
 * block for a Task write, so a task rescheduled outside the timeline (Task
 * detail, Tasks list, bulk, Reschedule) would leave its block behind (STALE).
 * This wraps the tasks repository the UI gets: after a write that names the
 * day, time or length, the task's own linked block follows. The blocks adapter
 * keeps the unwrapped repository, so its Task writes never come back here.
 * A block that could not follow is "partial" ("time"): the task is saved.
 */

const SCHEDULE_KEYS = ["date", "time", "durationMinutes"] as const satisfies readonly (keyof TaskPatch)[];

const touchesSchedule = (patch: TaskPatch) => SCHEDULE_KEYS.some((key) => key in patch);

export function withBlockFollow(tasks: ApiTasksRepository, followTask: (task: Task) => Promise<void>): ApiTasksRepository {
  /** True when the block followed (or there was none). */
  async function follow(task: Task): Promise<boolean> {
    try {
      await followTask(task);
      return true;
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) throw error;
      return false;
    }
  }

  return {
    ...tasks,

    async update(id, patch) {
      const task = await tasks.update(id, patch);
      if (touchesSchedule(patch) && !(await follow(task))) {
        throw new RepositoryError("partial", "Task saved, its time block did not follow", { task, failed: ["time"] });
      }
      return task;
    },

    async bulkUpdate(ids, patch) {
      if (!touchesSchedule(patch)) return tasks.bulkUpdate(ids, patch);
      let saved: Task[];
      let failure: RepositoryError | null = null;
      try {
        saved = await tasks.bulkUpdate(ids, patch);
      } catch (error) {
        // Some tasks saved: their blocks still follow, then the original refusal is reported.
        if (!(error instanceof RepositoryError && error.code === "partial" && error.failedIds)) throw error;
        failure = error;
        const failed = new Set(error.failedIds);
        saved = ids.filter((id) => !failed.has(id)).flatMap((id) => tasks.peek(id) ?? []);
      }
      const behind: string[] = [];
      for (const task of saved) if (!(await follow(task))) behind.push(task.id);
      if (failure) throw failure;
      if (behind.length) {
        throw new RepositoryError("partial", "Tasks saved, some time blocks did not follow", { failed: ["time"], failedIds: behind });
      }
      return saved;
    },
  };
}
