import { isLiveApi } from "@/api/runtime";

/*
 * Which Task fields the active data source can store. The mock adapter keeps
 * everything; the Phase 0/1 API has no Task energy, area, project or non-personal
 * scope ("repeat weekly" is a WEEKLY recurrence since Phase 02), goal links need the Goals integration (Phase 06) and
 * manual order is the server Day plan (Phase 03, dated tasks only). The UI disables or marks these in
 * live mode instead of pretending to save them.
 */
export interface TaskFieldSupport {
  energy: boolean;
  area: boolean;
  project: boolean;
  scope: boolean;
  goal: boolean;
  recurring: boolean;
  manualOrder: boolean;
}

const ALL: TaskFieldSupport = { energy: true, area: true, project: true, scope: true, goal: true, recurring: true, manualOrder: true };
const LIVE: TaskFieldSupport = { energy: false, area: false, project: false, scope: false, goal: false, recurring: true, manualOrder: true };

export function taskFieldSupport(): TaskFieldSupport {
  return isLiveApi() ? LIVE : ALL;
}

/** Same value on server and client (NEXT_PUBLIC env), so it is safe during render. */
export const useTaskFieldSupport = taskFieldSupport;
