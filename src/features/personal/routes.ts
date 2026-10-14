/*
 * Task route helpers (P00PersonalIA Routes): Task Create is a page, Task
 * detail is /personal/tasks/:id (drawer on soft navigation, page otherwise).
 */

export const TASKS_HREF = "/personal/tasks";

/** P05 Task Create (prefilled from Quick Add later). */
export const TASK_CREATE_HREF = "/personal/tasks/create";

/** P06 Task detail. */
export function taskDetailHref(id: string): string {
  return `${TASKS_HREF}/${encodeURIComponent(id)}`;
}
