import type { NavItemId } from "@/features/navigation/types";

/*
 * Route segments under /teams/[id] and the rail item each belongs to (TS-01).
 * Built screens get their own static segment, which wins over [module].
 * Activity is an Overview tab (T3), never a route. Server-safe.
 */
export const teamModuleSegments: Readonly<Record<string, NavItemId>> = {
  work: "work",
  calendar: "calendar",
  planning: "planning",
  projects: "projects",
  goals: "goals",
  people: "people",
  analytics: "analytics",
  "check-ins": "checkins",
  recognition: "recognition",
  files: "files",
  settings: "settings",
};
