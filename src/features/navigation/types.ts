import type { LucideIcon } from "lucide-react";
import type { Scope } from "@/design-system/tokens/colors";

/** A planner context. Same values as `data-scope`, so ids double as colour scopes. */
export type ContextId = Scope;

export const navItemIds = [
  "overview",
  "myday",
  "tasks",
  "calendar",
  "goals",
  "habits",
  "finance",
  "journal",
  "insights",
  "board",
  "timeline",
  "gantt",
  "flow",
  "docs",
  "analytics",
  "work",
  "people",
  "checkins",
  "activity",
  "files",
  "departments",
  "projects",
  "assets",
  "approvals",
  "reports",
] as const;

export type NavItemId = (typeof navItemIds)[number];

/**
 * `available` items are real routes and render as links. `planned` items have
 * their final href reserved but render as disabled "Coming soon" entries.
 */
export type NavItemStatus = "available" | "planned";

/** Translation keys are relative to the "Navigation" namespace. */
export type NavItemLabelKey = `items.${NavItemId}`;

export interface NavItem {
  id: NavItemId;
  labelKey: NavItemLabelKey;
  icon: LucideIcon;
  href: string;
  status: NavItemStatus;
  /**
   * Slot in the mobile bottom bar (1–3, ascending). Items without one are
   * reached from the "More" sheet.
   */
  mobileOrder?: number;
}

export interface AppContext {
  id: ContextId;
  /** Route of the context overview; every nav href starts with it. */
  basePath: string;
  labelKey: `contexts.${ContextId}.label`;
  descriptionKey: `contexts.${ContextId}.description`;
  /** "New project" etc. For Personal it is an explanatory note, not an action. */
  addLabelKey: `contexts.${ContextId}.add`;
  /** Whether this context can hold more than one workspace (Personal cannot). */
  canAddWorkspace: boolean;
  icon: LucideIcon;
  nav: readonly NavItem[];
}

/** A workspace inside a context (a project, team or company). Names are data. */
export interface Workspace {
  id: string;
  name: string;
}
