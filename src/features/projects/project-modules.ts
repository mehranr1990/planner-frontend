import type { NavItemId } from "@/features/navigation/types";

/*
 * Route segments under /projects/[id] and the rail item each belongs to
 * (Board and Flow are Tasks view modes, D3). Server-safe (no client code).
 */
export const projectModuleSegments: Readonly<Record<string, NavItemId>> = {
  tasks: "tasks",
  board: "tasks",
  flow: "tasks",
  timeline: "timeline",
  gantt: "gantt",
  calendar: "calendar",
  milestones: "milestones",
  risks: "risks",
  workload: "workload",
  members: "members",
  files: "files",
  analytics: "analytics",
  settings: "settings",
};
