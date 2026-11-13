import type { ExpenseScope } from "@/data/social-domain";

/*
 * Social routes (design/social DECISIONS S1, SCREENS): /social home rail and
 * /social/groups/[id] group rail. Expenses live under their scope: a group
 * (/social/groups/[id]/expenses) or an activity (/social/activities/[id]/expenses).
 */

export const SOCIAL_BASE = "/social";

const enc = encodeURIComponent;

export type GroupSection = "activities" | "calendar" | "chat" | "expenses" | "lending" | "album" | "challenges" | "members" | "settings";

export const socialHref = {
  home: SOCIAL_BASE,
  connections: `${SOCIAL_BASE}/connections`,
  groups: (tab?: "mine" | "discover") => `${SOCIAL_BASE}/groups${tab === "discover" ? "?tab=discover" : ""}`,
  group: (id: string, section?: GroupSection) => `${SOCIAL_BASE}/groups/${enc(id)}${section ? `/${section}` : ""}`,
  album: (groupId: string, albumId: string) => `${SOCIAL_BASE}/groups/${enc(groupId)}/album/${enc(albumId)}`,
  activities: `${SOCIAL_BASE}/activities`,
  activity: (id: string) => `${SOCIAL_BASE}/activities/${enc(id)}`,
  poll: (activityId: string) => `${SOCIAL_BASE}/activities/${enc(activityId)}/poll`,
  balances: `${SOCIAL_BASE}/balances`,
  lending: `${SOCIAL_BASE}/lending`,
  expenses: (scope: ExpenseScope) => `${scope.kind === "group" ? `${SOCIAL_BASE}/groups` : `${SOCIAL_BASE}/activities`}/${enc(scope.id)}/expenses`,
  expense: (scope: ExpenseScope, expenseId: string) => `${socialHref.expenses(scope)}/${enc(expenseId)}`,
  settle: (scope: ExpenseScope) => `${socialHref.expenses(scope)}/settle`,
};

/** The group id in /social/groups/[id]/…, or undefined. */
export function socialGroupIdFromPath(pathname: string): string | undefined {
  const match = /^\/social\/groups\/([^/?#]+)/.exec(pathname);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1];
  }
}
