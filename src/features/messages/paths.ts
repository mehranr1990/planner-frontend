import type { MsgSource, MsgSourceKind } from "@/data/messaging-domain";
import { normalizePathname } from "@/features/navigation/paths";

/*
 * Messages routes (MS-01): /messages lives outside the four contexts;
 * workspace channels also live at /projects|teams|companies/[id]/channels/[cid]
 * (same conversation id) and announcements at /…/announcements.
 */

export const MESSAGES_BASE = "/messages";

export const messagesHref = {
  root: MESSAGES_BASE,
  conversation: (cid: string) => `${MESSAGES_BASE}/${encodeURIComponent(cid)}`,
  thread: (cid: string, mid: string) => `${MESSAGES_BASE}/${encodeURIComponent(cid)}/thread/${encodeURIComponent(mid)}`,
  info: (cid: string) => `${MESSAGES_BASE}/${encodeURIComponent(cid)}/info`,
  search: `${MESSAGES_BASE}/search`,
  settings: `${MESSAGES_BASE}/settings`,
  meetings: `${MESSAGES_BASE}/meetings`,
  meeting: (id: string) => `${MESSAGES_BASE}/meetings/${encodeURIComponent(id)}`,
  minutes: (id: string) => `${MESSAGES_BASE}/meetings/${encodeURIComponent(id)}/minutes`,
};

export function isMessagesPath(pathname: string | null | undefined): boolean {
  const path = normalizePathname(pathname);
  return path === MESSAGES_BASE || path.startsWith(`${MESSAGES_BASE}/`);
}

const workspaceBase: Record<Exclude<MsgSourceKind, "personal">, string> = { project: "/projects", team: "/teams", company: "/companies" };

/** /projects/[id] etc. for a workspace source. */
export function workspaceBasePath(source: Pick<MsgSource, "kind" | "workspaceId">): string | null {
  if (source.kind === "personal" || !source.workspaceId) return null;
  return `${workspaceBase[source.kind]}/${encodeURIComponent(source.workspaceId)}`;
}

/** Workspace Channels page, optionally on one channel. */
export function channelsHref(source: Pick<MsgSource, "kind" | "workspaceId">, cid?: string, rest = ""): string {
  const base = workspaceBasePath(source);
  if (!base) return cid ? messagesHref.conversation(cid) : MESSAGES_BASE;
  return `${base}/channels${cid ? `/${encodeURIComponent(cid)}` : ""}${rest}`;
}

export function announcementsHref(source: Pick<MsgSource, "kind" | "workspaceId">): string {
  return `${workspaceBasePath(source) ?? ""}/announcements`;
}

/** Colour scope of a source (owner decision): Personal direct/groups/meetings use the neutral slate. */
export function sourceScope(source: Pick<MsgSource, "kind">): "messages" | "project" | "team" | "company" {
  return source.kind === "personal" ? "messages" : source.kind;
}

/** The workspace source for a channels route, from its URL kind. */
export function sourceFromRoute(kind: Exclude<MsgSourceKind, "personal">, workspaceId: string, name = ""): MsgSource {
  return { kind, workspaceId, name };
}
