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
  "inbox",
  "braindump",
  "settings",
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
export type NavItemLabelKey = `items.${NavItemId | "today"}`;

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
  /** Other routes that also make this item current (mobile "Today" covers My Day too). */
  alsoActiveOn?: readonly string[];
  /** A live count shown on the item (Personal Inbox: untriaged items, P07). */
  badge?: "inbox";
}

/**
 * Grouped rail (Personal, P00PersonalIA): icon-only groups separated by
 * hairlines plus a footer pinned to the bottom. Contexts without one keep the
 * flat, expandable rail.
 */
export interface RailLayout {
  groups: readonly (readonly NavItemId[])[];
  footer: readonly NavItemId[];
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
  rail?: RailLayout;
  /** Bottom-bar items when they differ from the nav (Personal "Today"). */
  mobileNav?: readonly NavItem[];
}

/** A workspace inside a context (a project, team or company). Names are data. */
export interface Workspace {
  id: string;
  name: string;
}
