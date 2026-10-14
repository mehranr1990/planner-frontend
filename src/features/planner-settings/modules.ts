import { normalizePathname } from "@/features/navigation/paths";
import type { SheetId } from "@/features/sheets/sheet-params";

/*
 * The Personal modules (P00 IA). Ids equal the Personal nav item ids, so the
 * rail, the More sheet and the hidden-module gate all key off one list.
 * Core modules can never be hidden (P00 · P17); optional modules are on by
 * default and can be hidden in Settings. Pure data, safe on server and client.
 */

export const PERSONAL_BASE_PATH = "/personal";

export const coreModuleIds = ["overview", "myday", "tasks", "calendar", "inbox", "settings"] as const;
export const optionalModuleIds = ["goals", "habits", "finance", "journal", "insights", "braindump"] as const;

export type CoreModuleId = (typeof coreModuleIds)[number];
export type OptionalModuleId = (typeof optionalModuleIds)[number];
export type PersonalModuleId = CoreModuleId | OptionalModuleId;

export type ModuleKind = "core" | "optional";

export interface PersonalModule {
  id: PersonalModuleId;
  kind: ModuleKind;
  /** First path segment under /personal ("" is the overview itself). */
  segment: string;
}

/** IA order: Today group, optional group, capture group, then Settings. */
export const PERSONAL_MODULES: readonly PersonalModule[] = [
  { id: "overview", kind: "core", segment: "" },
  { id: "myday", kind: "core", segment: "my-day" },
  { id: "tasks", kind: "core", segment: "tasks" },
  { id: "calendar", kind: "core", segment: "calendar" },
  { id: "goals", kind: "optional", segment: "goals" },
  { id: "habits", kind: "optional", segment: "habits" },
  { id: "finance", kind: "optional", segment: "finance" },
  { id: "journal", kind: "optional", segment: "journal" },
  { id: "insights", kind: "optional", segment: "insights" },
  { id: "inbox", kind: "core", segment: "inbox" },
  { id: "braindump", kind: "optional", segment: "brain-dump" },
  { id: "settings", kind: "core", segment: "settings" },
];

export function isOptionalModule(id: unknown): id is OptionalModuleId {
  return typeof id === "string" && (optionalModuleIds as readonly string[]).includes(id);
}

export function isCoreModule(id: unknown): id is CoreModuleId {
  return typeof id === "string" && (coreModuleIds as readonly string[]).includes(id);
}

export function getPersonalModule(id: PersonalModuleId): PersonalModule {
  return PERSONAL_MODULES.find((module) => module.id === id)!;
}

/** `/personal` for the overview, `/personal/<segment>` otherwise. */
export function personalModuleHref(id: PersonalModuleId): string {
  const { segment } = getPersonalModule(id);
  return segment ? `${PERSONAL_BASE_PATH}/${segment}` : PERSONAL_BASE_PATH;
}

/**
 * The module that owns a Personal pathname, nested routes included
 * (/personal/goals/42 → goals, /personal/tasks/create → tasks). Contextual
 * flows without a nav item (focus, shutdown, review) and paths outside
 * /personal return null.
 */
export function moduleForPathname(pathname: string | null | undefined): PersonalModuleId | null {
  const path = normalizePathname(pathname);
  if (path === PERSONAL_BASE_PATH) return "overview";
  if (!path.startsWith(`${PERSONAL_BASE_PATH}/`)) return null;
  const segment = path.slice(PERSONAL_BASE_PATH.length + 1).split("/", 1)[0]!;
  return PERSONAL_MODULES.find((module) => module.segment === segment)?.id ?? null;
}

/**
 * Sheets that belong to an optional module. When the module is hidden the
 * sheet is gated too (P00: hidden modules leave the Quick Add destinations).
 */
export const SHEET_MODULE = {
  expense: "finance",
  habit: "habits",
  goal: "goals",
} as const satisfies Partial<Record<SheetId, OptionalModuleId>>;

/** The optional module a sheet belongs to, or null for module-free sheets. */
export function moduleForSheet(id: SheetId): OptionalModuleId | null {
  return (SHEET_MODULE as Partial<Record<SheetId, OptionalModuleId>>)[id] ?? null;
}
