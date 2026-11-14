import {
  msgAnnouncements,
  msgConnections,
  msgConversations,
  msgMeetings,
  msgMessages,
  msgPeople,
  msgWorkspaces,
  type SeedConversation,
  type SeedMeeting,
} from "@/fixtures/messaging";
import { SAMPLE_NOW } from "@/fixtures/personal/sample-day";
import type {
  ActionItem,
  Announcement,
  Attachment,
  ChannelPolicy,
  ConversationDetail,
  ConversationKind,
  ConversationSummary,
  Decision,
  Invitee,
  MeetingDetail,
  MeetingSummary,
  Message,
  MessageCapabilities,
  MessagingEvent,
  MessagingSettings,
  Minutes,
  MinutesStatus,
  MinutesVersion,
  MsgPerson,
  MsgSource,
  Participant,
  PolicyKey,
  PresenceView,
  Rsvp,
} from "../messaging-domain";
import { MessagingError, type MessagingRepository } from "../messaging-repositories";

/*
 * Mock Messages & Meetings "server" (Phase 5 not built). It owns every rule
 * the backend will enforce, evaluated per actor and per command:
 *  - 48h window from the server-committed createdAt: allowed while
 *    now <= createdAt + 48h (13_MESSAGING_DELETE_POLICY_FINAL).
 *  - visibility: current members only, history from join where the rule says
 *    so, delete-for-me hidden for that user only, delete-for-everyone as a
 *    tombstone everywhere (list, replies, search, previews).
 *  - receipts reciprocal and direct-only; presence after privacy and blocks.
 *  - idempotent client op ids (send, create, publish, forward).
 * `createMessagingServer().as(userId)` gives one user's repository; the app
 * uses `createMockMessaging()` (= as "me"). The clock runs from the sample
 * "now" so fixtures line up; tests inject `now`.
 */

export const EDIT_WINDOW_MS = 48 * 3600_000;
export const VOICE_MAX_SECONDS = 120;
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;
/** Mock-only server limit for images/files (real limit comes from the server config). */
export const FILE_MAX_BYTES = 25 * 1024 * 1024;

interface Member {
  id: string;
  joinedAt: number;
  role: "member" | "admin";
  removedAt: number | null;
  lastReadAt: number;
  deliveredAt: number;
  muted: boolean;
  collapseBlocked: boolean;
  threadReadAt: Map<string, number>;
}

interface StoredConversation {
  id: string;
  kind: ConversationKind;
  name: string;
  source: MsgSource;
  members: Map<string, Member>;
  policyOverride: Partial<Pick<ChannelPolicy, PolicyKey | "adminsOnlyPost" | "mandatory">>;
  newcomerHistory: "from-join" | "full";
  linkPreviews: boolean;
  createdAt: number;
  clientOpId: string | null;
}

interface StoredMessage {
  id: string;
  cid: string;
  authorId: string;
  createdAt: number;
  editedAt: number | null;
  body: string;
  state: "visible" | "deleted" | "removed";
  replyToId: string | null;
  attachments: Attachment[];
  reactions: Map<string, Set<string>>;
  forwarded: boolean;
  pinned: boolean;
  parentId: string | null;
  alsoInConversation: boolean;
  hiddenFor: Set<string>;
  revisions: string[];
  clientOpId: string | null;
  task: { workspaceId: string; taskId: string; title?: string; status?: string; due?: string | null; readers?: string[] } | null;
}

interface StoredMeeting extends Omit<SeedMeeting, "minutes" | "start" | "end"> {
  start: number;
  end: number;
  clientOpId: string | null;
  minutes: {
    status: MinutesStatus;
    summary: string;
    decisions: { id: string; text: string; by: string }[];
    actions: { id: string; text: string; assignee: string | null; due: string | null; task: ActionItem["task"] }[];
    reviewers: Map<string, { state: "pending" | "approved" | "changes"; comment: string | null }>;
    version: number;
    versions: { version: number; status: MinutesStatus; at: number; by: string; note: string | null }[];
    changesComment: string | null;
  } | null;
}

interface StoredAnnouncement {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  author: string;
  publishedAt: number | null;
  scheduledFor: number | null;
  audience: { kind: "workspace" | "subset"; label: string; memberIds: string[] };
  pinnedUntil: number | null;
  requireAck: boolean;
  acks: Set<string>;
  lastReminderAt: number | null;
  clientOpId: string | null;
}

export interface MessagingServerOptions {
  /** Server clock (ms). Defaults to the sample "now" advancing in real time. */
  now?: () => number;
  /** Simulated delivery / reads after a send (mock live events). Pass `false` to disable. */
  simulate?: boolean;
  /** Delay between upload progress steps (ms). */
  uploadStepMs?: number;
  /** Start without fixtures (empty states). */
  empty?: boolean;
}

const ms = (iso: string) => new Date(iso).getTime();
const iso = (t: number) => new Date(t).toISOString();
const DAY_MS = 24 * 3600_000;
const MENTION = /@\[([^\]]+)\]\(([^)]+)\)/g;
const LINK = /https?:\/\/\S+/;
const TASK_URL = /\/(projects|teams)\/([^/\s]+)\/tasks\/([^/\s?#]+)/;

function defaultSettings(): MessagingSettings {
  return {
    receiptsDirect: true,
    lastSeen: "everyone",
    online: "everyone",
    typing: true,
    whoCanDm: "connections-and-workspaces",
    notifyDirect: true,
    notifyMentions: true,
    notifyOther: "badge",
    quietHours: { enabled: false, from: "22:00", to: "07:00" },
    linkPreviewsDefault: false,
  };
}

/** Plain text of a bounded rich-text body (previews, search). */
export function plainText(body: string): string {
  return body.replace(MENTION, "@$1").replace(/\*\*|__|`/g, "").replace(/(^|\s)_([^_]+)_/g, "$1$2").trim();
}

export function createMessagingServer({ now: clock, simulate = true, uploadStepMs = 120, empty = false }: MessagingServerOptions = {}) {
  const startedAt = Date.now();
  const base = ms(SAMPLE_NOW);
  const now = clock ?? (() => base + (Date.now() - startedAt));
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${(++seq).toString(36)}-${Math.floor(now()).toString(36)}`;

  const people = new Map<string, MsgPerson>(Object.values(msgPeople).map((p) => [p.id, { ...p }]));
  const settings = new Map<string, MessagingSettings>();
  const blocks = new Map<string, Set<string>>([["me", new Set(["reza"])]]);
  const presence = new Map<string, PresenceView>([
    ["nazanin", { kind: "last-seen", at: iso(base - 10 * 60_000) }],
    ["sara", { kind: "online" }],
    ["kian", { kind: "online" }],
    ["harry", { kind: "last-seen", at: iso(base - 3 * 3600_000) }],
  ]);
  const othersHideLastSeen = new Set(["leila"]);
  const reports: { by: string; target: string; reason: string }[] = [];
  const lookups = new Map<string, number[]>();
  const listeners = new Set<(event: MessagingEvent) => void>();
  const emit = (event: MessagingEvent) => listeners.forEach((listener) => listener(event));
  const later = (fn: () => void, delay: number) => {
    if (simulate) setTimeout(fn, delay);
  };

  const settingsOf = (id: string) => {
    let value = settings.get(id);
    if (!value) {
      value = defaultSettings();
      if (othersHideLastSeen.has(id)) value.lastSeen = "nobody";
      settings.set(id, value);
    }
    return value;
  };
  const blockSet = (id: string) => {
    let set = blocks.get(id);
    if (!set) blocks.set(id, (set = new Set()));
    return set;
  };
  const blocked = (a: string, b: string) => blockSet(a).has(b) || blockSet(b).has(a);

  /* ── seed ── */
  const conversations = new Map<string, StoredConversation>();
  const messages = new Map<string, StoredMessage>();
  const meetings = new Map<string, StoredMeeting>();
  const announcements = new Map<string, StoredAnnouncement>();

  function addConversation(seed: SeedConversation) {
    const members = new Map<string, Member>();
    for (const m of seed.members) {
      const joined = ms(m.joinedAt);
      members.set(m.id, {
        id: m.id,
        joinedAt: joined,
        role: m.role ?? "member",
        removedAt: m.removedAt ? ms(m.removedAt) : null,
        lastReadAt: m.lastReadAt ? ms(m.lastReadAt) : base,
        deliveredAt: base,
        muted: m.muted ?? false,
        collapseBlocked: false,
        threadReadAt: new Map(),
      });
    }
    conversations.set(seed.id, {
      id: seed.id,
      kind: seed.kind,
      name: seed.name ?? "",
      source: { ...seed.source },
      members,
      policyOverride: { ...(seed.policy ?? {}) },
      newcomerHistory: seed.newcomerHistory ?? (seed.kind === "group" ? "from-join" : "full"),
      linkPreviews: seed.linkPreviews ?? false,
      createdAt: Math.min(...[...members.values()].map((m) => m.joinedAt)),
      clientOpId: null,
    });
  }

  if (!empty) {
    msgConversations.forEach(addConversation);
    for (const seed of msgMessages) {
      messages.set(seed.id, {
        id: seed.id,
        cid: seed.cid,
        authorId: seed.author,
        createdAt: ms(seed.at),
        editedAt: seed.editedAt ? ms(seed.editedAt) : null,
        body: seed.deleted ? "" : seed.body,
        state: seed.deleted ? "deleted" : "visible",
        replyToId: seed.replyTo ?? null,
        attachments: (seed.attachments ?? []).map((a, i) => ({ id: `${seed.id}-a${i}`, shareable: a.shareable ?? true, ...a })),
        reactions: new Map(Object.entries(seed.reactions ?? {}).map(([emoji, ids]) => [emoji, new Set(ids)])),
        forwarded: false,
        pinned: seed.pinned ?? false,
        parentId: seed.parentId ?? null,
        alsoInConversation: false,
        hiddenFor: new Set(seed.hiddenFor ?? []),
        revisions: [],
        clientOpId: null,
        task: seed.task ?? null,
      });
    }
    for (const seed of msgMeetings) {
      meetings.set(seed.id, {
        ...seed,
        start: ms(seed.start),
        end: ms(seed.end),
        invitees: { ...seed.invitees },
        agenda: seed.agenda.map((a) => ({ ...a })),
        files: seed.files.map((f) => ({ ...f })),
        clientOpId: null,
        minutes: seed.minutes
          ? {
              status: seed.minutes.status,
              summary: seed.minutes.summary,
              decisions: seed.minutes.decisions.map((d) => ({ ...d })),
              actions: seed.minutes.actions.map((a) => ({ ...a, task: null })),
              reviewers: new Map(Object.entries(seed.minutes.reviewers).map(([id, state]) => [id, { state, comment: null }])),
              version: seed.minutes.version,
              versions: Array.from({ length: seed.minutes.version }, (_, i) => ({
                version: i + 1,
                status: i + 1 === seed.minutes!.version ? seed.minutes!.status : ("draft" as MinutesStatus),
                at: ms(seed.end) + (i + 1) * 3600_000,
                by: seed.minuteTaker ?? seed.organizer,
                note: null,
              })),
              changesComment: null,
            }
          : null,
      });
    }
    for (const seed of msgAnnouncements) {
      announcements.set(seed.id, {
        ...seed,
        publishedAt: seed.publishedAt ? ms(seed.publishedAt) : null,
        scheduledFor: seed.scheduledFor ? ms(seed.scheduledFor) : null,
        pinnedUntil: seed.pinnedUntil ? ms(seed.pinnedUntil) : null,
        acks: new Set(seed.acks),
        lastReminderAt: seed.lastReminderAt ? ms(seed.lastReminderAt) : null,
        clientOpId: null,
      });
    }
  }

  /* ── shared rules ── */
  const workspaceOf = (workspaceId: string | null) => msgWorkspaces.find((w) => w.source.workspaceId === workspaceId) ?? null;
  const isWorkspaceAdmin = (actor: string, source: MsgSource) => workspaceOf(source.workspaceId)?.admins.includes(actor) ?? false;
  const isWorkspaceMember = (actor: string, workspaceId: string | null) => workspaceOf(workspaceId)?.members.includes(actor) ?? false;
  const shareWorkspace = (a: string, b: string) => msgWorkspaces.some((w) => w.members.includes(a) && w.members.includes(b));
  const isConnection = (a: string, b: string) => (msgConnections[a] ?? []).includes(b) || (msgConnections[b] ?? []).includes(a);

  function policyOf(c: StoredConversation): ChannelPolicy | null {
    if (c.kind !== "channel") return null;
    const ws = workspaceOf(c.source.workspaceId);
    const defaults = ws?.defaults ?? { authorDeleteForEveryone: false, newcomerHistory: "from-join", membersCanPin: false, mandatory: false, setBy: null, adminsOnlyPost: false };
    const keys: PolicyKey[] = ["authorDeleteForEveryone", "newcomerHistory", "membersCanPin"];
    return { ...defaults, ...c.policyOverride, inherited: keys.filter((k) => !(k in c.policyOverride)) };
  }

  const activeMember = (c: StoredConversation, actor: string) => {
    const m = c.members.get(actor);
    return m && m.removedAt === null ? m : null;
  };
  const historyFromJoin = (c: StoredConversation) =>
    c.kind === "direct" ? false : c.kind === "group" ? c.newcomerHistory === "from-join" : policyOf(c)!.newcomerHistory === "from-join";

  /** Whether the actor may see this message at all (membership, join rule, delete-for-me). */
  function visibleTo(m: StoredMessage, actor: string): boolean {
    const c = conversations.get(m.cid);
    if (!c) return false;
    const member = activeMember(c, actor);
    if (!member) return false;
    if (m.hiddenFor.has(actor)) return false;
    if (historyFromJoin(c) && m.createdAt < member.joinedAt) return false;
    return true;
  }

  const inMainList = (m: StoredMessage) => m.parentId === null || m.alsoInConversation;

  function canPost(c: StoredConversation, actor: string): boolean {
    if (!activeMember(c, actor)) return false;
    if (c.kind === "direct") {
      const other = [...c.members.keys()].find((id) => id !== actor);
      if (other && (blocked(actor, other) || people.get(other)?.deleted)) return false;
    }
    if (c.kind === "channel" && policyOf(c)!.adminsOnlyPost) return c.members.get(actor)!.role === "admin" || isWorkspaceAdmin(actor, c.source);
    return true;
  }

  function canPin(c: StoredConversation, actor: string): boolean {
    if (!activeMember(c, actor)) return false;
    if (c.kind !== "channel") return true;
    return c.members.get(actor)!.role === "admin" || isWorkspaceAdmin(actor, c.source) || policyOf(c)!.membersCanPin;
  }

  const isAdminHere = (c: StoredConversation, actor: string) =>
    c.members.get(actor)?.role === "admin" || (c.kind === "channel" && isWorkspaceAdmin(actor, c.source));

  /** Server decision for the actor on one message; re-evaluated on every command. */
  function capabilities(m: StoredMessage, actor: string): MessageCapabilities {
    const c = conversations.get(m.cid)!;
    const member = activeMember(c, actor);
    const author = m.authorId === actor;
    const left = m.createdAt + EDIT_WINDOW_MS - now();
    const inWindow = left >= 0;
    const hoursLeft = Math.max(0, Math.ceil(left / 3600_000));
    const live = m.state === "visible" && member !== null;
    const policy = policyOf(c);
    const deleteForEveryone: MessageCapabilities["deleteForEveryone"] =
      !author || !live
        ? { allowed: false, reason: "not-author" }
        : !inWindow
          ? { allowed: false, reason: "window" }
          : policy && !policy.authorDeleteForEveryone
            ? { allowed: false, reason: "policy" }
            : { allowed: true, hoursLeft };
    return {
      editHoursLeft: author && live && inWindow && m.attachments.every((a) => a.kind !== "voice") ? hoursLeft : null,
      deleteForEveryone,
      pin: live && canPin(c, actor),
      moderate: live && !author && c.kind === "channel" && isAdminHere(c, actor),
    };
  }

  const personView = (id: string): MsgPerson => {
    const p = people.get(id) ?? { id, name: id, initials: "?" };
    return p.deleted ? { id: p.id, name: "", initials: "?", deleted: true } : { ...p };
  };

  function receiptFor(m: StoredMessage, c: StoredConversation, actor: string): Message["receipt"] {
    if (m.authorId !== actor || m.state !== "visible") return null;
    const others = [...c.members.values()].filter((x) => x.id !== actor && x.removedAt === null);
    if (c.kind === "direct") {
      const other = others[0];
      if (!other) return "sent";
      const reciprocal = settingsOf(actor).receiptsDirect && settingsOf(other.id).receiptsDirect && !blocked(actor, other.id);
      if (reciprocal && other.lastReadAt >= m.createdAt) return "seen";
      return other.deliveredAt >= m.createdAt || other.lastReadAt >= m.createdAt ? "delivered" : "sent";
    }
    // Groups and channels: no "Seen by" (owner decision), only Delivered.
    return others.some((x) => x.deliveredAt >= m.createdAt || x.lastReadAt >= m.createdAt) ? "delivered" : "sent";
  }

  function view(m: StoredMessage, actor: string): Message {
    const c = conversations.get(m.cid)!;
    const hidden = m.state !== "visible";
    const replyTo = m.replyToId ? messages.get(m.replyToId) : undefined;
    const replyVisible = replyTo && visibleTo(replyTo, actor);
    const replies = [...messages.values()].filter((r) => r.parentId === m.id && visibleTo(r, actor));
    const member = c.members.get(actor);
    const threadRead = member?.threadReadAt.get(m.id) ?? member?.joinedAt ?? 0;
    const participates = m.authorId === actor || replies.some((r) => r.authorId === actor);
    const blockRelation = m.authorId !== actor && blocked(actor, m.authorId);
    const readers = m.task?.readers ?? (m.task ? (workspaceOf(m.task.workspaceId)?.members ?? []) : []);
    return {
      id: m.id,
      conversationId: m.cid,
      author: personView(m.authorId),
      mine: m.authorId === actor,
      createdAt: iso(m.createdAt),
      editedAt: m.editedAt && !hidden ? iso(m.editedAt) : null,
      state: m.state,
      body: hidden ? "" : m.body,
      replyTo: replyTo
        ? replyVisible
          ? { id: replyTo.id, author: personView(replyTo.authorId).name, excerpt: replyTo.state === "visible" ? plainText(replyTo.body).slice(0, 120) : "", deleted: replyTo.state !== "visible" }
          : { id: replyTo.id, author: "", excerpt: "", deleted: true }
        : null,
      attachments: hidden ? [] : m.attachments.map((a) => ({ ...a })),
      reactions: hidden ? [] : [...m.reactions].filter(([, ids]) => ids.size > 0).map(([emoji, ids]) => ({ emoji, count: ids.size, mine: ids.has(actor) })),
      forwarded: m.forwarded,
      pinned: m.pinned && !hidden,
      mentionsMe: !hidden && !blockRelation && m.authorId !== actor && m.body.includes(`](${actor})`),
      taskLink: m.task && !hidden ? (readers.includes(actor) ? { readable: true, title: m.task.title, status: m.task.status, due: m.task.due ?? null } : { readable: false }) : null,
      thread: replies.length
        ? { count: replies.length, lastAt: iso(Math.max(...replies.map((r) => r.createdAt))), unread: participates ? replies.filter((r) => r.authorId !== actor && r.createdAt > threadRead).length : 0 }
        : null,
      parentId: m.parentId,
      alsoInConversation: m.alsoInConversation,
      receipt: receiptFor(m, c, actor),
      clientOpId: m.authorId === actor ? m.clientOpId : null,
      fromBlocked: c.kind !== "direct" && blockRelation && blockSet(actor).has(m.authorId),
      can: capabilities(m, actor),
    };
  }

  const titleFor = (c: StoredConversation, actor: string) => {
    if (c.kind !== "direct") return c.name;
    const other = [...c.members.keys()].find((id) => id !== actor);
    return other ? personView(other).name : "";
  };
  const initialsOf = (title: string) =>
    title
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");

  function summary(c: StoredConversation, actor: string): ConversationSummary {
    const member = c.members.get(actor)!;
    const visible = [...messages.values()].filter((m) => m.cid === c.id && inMainList(m) && visibleTo(m, actor)).sort((a, b) => a.createdAt - b.createdAt);
    const last = visible.at(-1);
    const unreadMsgs = visible.filter((m) => m.authorId !== actor && m.state === "visible" && m.createdAt > member.lastReadAt);
    const other = c.kind === "direct" ? [...c.members.keys()].find((id) => id !== actor) : undefined;
    const title = titleFor(c, actor);
    const lastKind = (m: StoredMessage) =>
      m.state !== "visible" ? "deleted" : m.body.trim() ? "text" : (m.attachments[0]?.kind ?? "text");
    return {
      id: c.id,
      kind: c.kind,
      title,
      initials: other ? personView(other).initials : c.kind === "group" ? initialsOf(title) : initialsOf(title),
      source: { ...c.source },
      lastMessage: last
        ? { author: personView(last.authorId).name, mine: last.authorId === actor, preview: last.state === "visible" ? plainText(last.body).slice(0, 90) : "", kind: lastKind(last), at: iso(last.createdAt) }
        : null,
      unread: unreadMsgs.length,
      mentions: unreadMsgs.filter((m) => m.body.includes(`](${actor})`) && !blocked(actor, m.authorId)).length,
      muted: member.muted,
      blocked: other ? blocked(actor, other) : false,
    };
  }

  const lastActivity = (c: StoredConversation, actor: string) =>
    Math.max(c.createdAt, ...[...messages.values()].filter((m) => m.cid === c.id && visibleTo(m, actor)).map((m) => m.createdAt));

  function requireMember(cid: string, actor: string) {
    const c = conversations.get(cid);
    if (!c || !c.members.has(actor)) throw new MessagingError("not-found");
    if (!activeMember(c, actor)) throw new MessagingError("removed");
    return c;
  }
  function requireMessage(mid: string, actor: string) {
    const m = messages.get(mid);
    if (!m || !visibleTo(m, actor)) throw new MessagingError("not-found");
    return { m, c: conversations.get(m.cid)! };
  }

  function presenceFor(actor: string, otherId: string): PresenceView {
    const other = people.get(otherId);
    if (!other || other.deleted || blocked(actor, otherId)) return { kind: "hidden" };
    const mine = settingsOf(actor);
    const theirs = settingsOf(otherId);
    const allows = (rule: MessagingSettings["lastSeen"], a: string, b: string) => rule === "everyone" || (rule === "contacts" && (isConnection(a, b) || shareWorkspace(a, b)));
    const p = presence.get(otherId) ?? { kind: "hidden" };
    // Reciprocal: if you hide yours you don't see others'.
    if (p.kind === "online") return allows(mine.online, actor, otherId) && allows(theirs.online, otherId, actor) ? p : lastSeenOnly();
    return p.kind === "last-seen" && allows(mine.lastSeen, actor, otherId) && allows(theirs.lastSeen, otherId, actor) ? p : { kind: "hidden" };
    function lastSeenOnly(): PresenceView {
      return allows(mine.lastSeen, actor, otherId) && allows(theirs.lastSeen, otherId, actor) ? { kind: "last-seen", at: iso(now() - 60_000) } : { kind: "hidden" };
    }
  }

  function canDm(actor: string, target: string): boolean {
    if (actor === target) return false;
    const p = people.get(target);
    if (!p || p.deleted || blocked(actor, target)) return false;
    const rule = settingsOf(target).whoCanDm;
    if (rule === "nobody") return false;
    if (rule === "workspaces") return shareWorkspace(actor, target);
    return shareWorkspace(actor, target) || isConnection(actor, target);
  }

  function simulateDelivery(c: StoredConversation, actor: string) {
    later(() => {
      for (const m of c.members.values()) if (m.id !== actor && m.removedAt === null) m.deliveredAt = now();
      emit({ type: "receipt", conversationId: c.id });
    }, 700);
    if (c.kind === "direct")
      later(() => {
        for (const m of c.members.values()) if (m.id !== actor && m.removedAt === null && presence.get(m.id)?.kind === "online") m.lastReadAt = now();
        emit({ type: "receipt", conversationId: c.id });
      }, 2600);
  }

  /* ── meetings ── */
  const inviteeRole = (mt: StoredMeeting, actor: string): Invitee["role"] => (mt.organizer === actor ? "organizer" : mt.minuteTaker === actor ? "minute-taker" : "attendee");
  const canSeeMeeting = (mt: StoredMeeting, actor: string) => actor in mt.invitees || (mt.source.kind !== "personal" && isWorkspaceAdmin(actor, mt.source));
  const canEditMeeting = (mt: StoredMeeting, actor: string) => mt.organizer === actor || (mt.source.kind !== "personal" && isWorkspaceAdmin(actor, mt.source));
  const canEditAgenda = (mt: StoredMeeting, actor: string) =>
    canEditMeeting(mt, actor) || mt.minuteTaker === actor || (actor in mt.invitees && (mt.source.kind === "personal" || (workspaceOf(mt.source.workspaceId)?.attendeesEditAgenda ?? false)));

  function meetingSummary(mt: StoredMeeting, actor: string): MeetingSummary {
    const status = mt.minutes?.status ?? null;
    return {
      id: mt.id,
      title: mt.title,
      source: { ...mt.source },
      start: iso(mt.start),
      end: iso(mt.end),
      link: mt.link,
      location: mt.location,
      myRsvp: mt.invitees[actor] ?? "none",
      organizer: personView(mt.organizer),
      inviteeCount: Object.keys(mt.invitees).length,
      minutesStatus: status,
      needsMyMinutes: mt.end <= now() && mt.minuteTaker === actor && status !== "final" && mt.source.kind !== "personal",
    };
  }
  function requireMeeting(id: string, actor: string) {
    const mt = meetings.get(id);
    if (!mt || !canSeeMeeting(mt, actor)) throw new MessagingError("not-found");
    return mt;
  }
  function ensureMinutes(mt: StoredMeeting) {
    mt.minutes ??= { status: "draft", summary: mt.notes, decisions: [], actions: [], reviewers: new Map(), version: 1, versions: [], changesComment: null };
    return mt.minutes;
  }
  const pushVersion = (min: NonNullable<StoredMeeting["minutes"]>, by: string, note: string | null = null) =>
    min.versions.push({ version: min.version, status: min.status, at: now(), by, note });

  /* ── announcements ── */
  const isPublisher = (actor: string, workspaceId: string) => workspaceOf(workspaceId)?.publishers.includes(actor) ?? false;
  const audienceIds = (a: StoredAnnouncement) => (a.audience.kind === "workspace" ? (workspaceOf(a.workspaceId)?.members ?? []) : a.audience.memberIds).filter((id) => !people.get(id)?.deleted);
  const canRemind = (a: StoredAnnouncement, actor: string) =>
    (a.author === actor || isPublisher(actor, a.workspaceId)) &&
    a.requireAck &&
    a.publishedAt !== null &&
    audienceIds(a).some((id) => !a.acks.has(id)) &&
    (a.lastReminderAt === null || now() - a.lastReminderAt >= DAY_MS);

  function announcementView(a: StoredAnnouncement, actor: string): Announcement {
    const ws = workspaceOf(a.workspaceId)!;
    const ids = audienceIds(a);
    const manager = a.author === actor || isPublisher(actor, a.workspaceId);
    return {
      id: a.id,
      workspace: { ...ws.source },
      title: a.title,
      body: a.body,
      author: personView(a.author),
      publishedAt: a.publishedAt !== null ? iso(a.publishedAt) : null,
      scheduledFor: a.scheduledFor !== null ? iso(a.scheduledFor) : null,
      audience: { kind: a.audience.kind, label: a.audience.label, size: ids.length },
      pinnedUntil: a.pinnedUntil !== null && a.pinnedUntil > now() ? iso(a.pinnedUntil) : null,
      pinned: a.pinnedUntil !== null && a.pinnedUntil > now(),
      requireAck: a.requireAck,
      acked: a.acks.has(actor),
      ack:
        manager && a.requireAck
          ? { done: ids.filter((id) => a.acks.has(id)).length, total: ids.length, pending: ids.filter((id) => !a.acks.has(id)).map(personView), lastReminderAt: a.lastReminderAt !== null ? iso(a.lastReminderAt) : null }
          : null,
      canRemind: canRemind(a, actor),
    };
  }

  function invitableFor(actor: string, source: MsgSource): MsgPerson[] {
    if (source.kind === "personal") return [...people.values()].filter((p) => p.id !== actor && canDm(actor, p.id)).map((p) => personView(p.id));
    const ws = workspaceOf(source.workspaceId);
    if (!ws || !ws.members.includes(actor)) return [];
    return ws.members.filter((id) => id !== actor && !people.get(id)?.deleted).map(personView);
  }
  const sourcesFor = (actor: string): MsgSource[] => [{ kind: "personal", workspaceId: null, name: "" }, ...msgWorkspaces.filter((w) => w.members.includes(actor)).map((w) => ({ ...w.source }))];

  async function wait(delay: number) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /* ── one user's repository ── */
  function as(actor: string): MessagingRepository {
    const done = async <T,>(value: T): Promise<T> => value;

    return {
      me: personView(actor),
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },

      conversations: {
        async list(tab) {
          const kinds: Record<typeof tab, ConversationKind[]> = { all: ["direct", "group", "channel"], direct: ["direct"], groups: ["group"], channels: ["channel"] };
          return [...conversations.values()]
            .filter((c) => activeMember(c, actor) && kinds[tab].includes(c.kind))
            .sort((a, b) => lastActivity(b, actor) - lastActivity(a, actor))
            .map((c) => summary(c, actor));
        },
        async get(id) {
          const c = conversations.get(id);
          if (!c || !c.members.has(actor)) return { access: "not-found" as const };
          const member = activeMember(c, actor);
          if (!member) return { access: "removed" as const };
          const otherId = c.kind === "direct" ? [...c.members.keys()].find((x) => x !== actor) : undefined;
          const s = summary(c, actor);
          const visible = [...messages.values()].filter((m) => m.cid === c.id && visibleTo(m, actor));
          const hiddenEarlier = historyFromJoin(c) && [...messages.values()].some((m) => m.cid === c.id && m.createdAt < member.joinedAt);
          const detail: ConversationDetail = {
            ...s,
            access: "member",
            memberCount: [...c.members.values()].filter((m) => m.removedAt === null).length,
            myRole: member.role,
            workspaceAdmin: c.kind === "channel" && isWorkspaceAdmin(actor, c.source),
            joinedAt: iso(member.joinedAt),
            joinedLater: hiddenEarlier || (c.kind === "channel" && member.joinedAt > c.createdAt && historyFromJoin(c)),
            other: otherId ? { ...personView(otherId), presence: presenceFor(actor, otherId) } : null,
            blockedBy: otherId ? (blockSet(actor).has(otherId) ? "me" : blockSet(otherId).has(actor) ? "them" : null) : null,
            policy: policyOf(c),
            linkPreviews: c.linkPreviews,
            newcomerHistory: c.kind === "channel" ? policyOf(c)!.newcomerHistory : c.newcomerHistory,
            canPost: canPost(c, actor),
            canPin: canPin(c, actor),
            canManage: c.kind !== "direct" && isAdminHere(c, actor),
            threadUnread: visible.filter((m) => m.parentId === null).reduce((n, m) => n + (view(m, actor).thread?.unread ? 1 : 0), 0),
            pinnedCount: visible.filter((m) => m.pinned && m.state === "visible").length,
            collapseBlocked: member.collapseBlocked,
          };
          return detail;
        },
        async participants(id) {
          const c = requireMember(id, actor);
          return [...c.members.values()]
            .filter((m) => m.removedAt === null)
            .map((m): Participant => ({ ...personView(m.id), role: m.role === "admin" ? "admin" : c.kind === "channel" && !isWorkspaceMember(m.id, c.source.workspaceId) ? "guest" : "member", you: m.id === actor }))
            .sort((a, b) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name));
        },
        async create({ personIds, name, clientOpId }) {
          const existing = [...conversations.values()].find((c) => c.clientOpId === clientOpId && c.members.get(actor)?.role === "admin");
          if (existing) return existing.id;
          const ids = [...new Set(personIds)].filter((id) => id !== actor);
          if (ids.length === 0 || ids.some((id) => !canDm(actor, id))) throw new MessagingError("forbidden");
          if (ids.length === 1) {
            const direct = [...conversations.values()].find((c) => c.kind === "direct" && c.members.has(actor) && c.members.has(ids[0]!));
            if (direct) return direct.id;
          }
          const t = now();
          const id = nextId("c");
          const member = (pid: string, role: Member["role"]): Member => ({ id: pid, joinedAt: t, role, removedAt: null, lastReadAt: t, deliveredAt: t, muted: false, collapseBlocked: false, threadReadAt: new Map() });
          conversations.set(id, {
            id,
            kind: ids.length === 1 ? "direct" : "group",
            name: ids.length === 1 ? "" : (name?.trim() || ids.map((pid) => personView(pid).name.split(" ")[0]).join(", ")),
            source: { kind: "personal", workspaceId: null, name: "" },
            members: new Map([[actor, member(actor, ids.length === 1 ? "member" : "admin")], ...ids.map((pid) => [pid, member(pid, "member")] as const)]),
            policyOverride: {},
            newcomerHistory: "from-join",
            linkPreviews: settingsOf(actor).linkPreviewsDefault,
            createdAt: t,
            clientOpId,
          });
          emit({ type: "membership", conversationId: id });
          return id;
        },
        async lookup(query) {
          const t = now();
          const recent = (lookups.get(actor) ?? []).filter((x) => t - x < 60_000);
          if (recent.length >= 30) throw new MessagingError("unavailable", "rate-limited");
          lookups.set(actor, [...recent, t]);
          const q = query.trim().toLowerCase();
          if (!q) return { people: [] };
          const candidates = [...people.values()].filter((p) => canDm(actor, p.id));
          const exactEmail = (p: MsgPerson) => q === `${p.id}@example.com`;
          return { people: candidates.filter((p) => p.name.toLowerCase().includes(q) || exactEmail(p)).map((p) => personView(p.id)) };
        },
        async markRead(id) {
          const c = requireMember(id, actor);
          const member = c.members.get(actor)!;
          member.lastReadAt = Math.max(member.lastReadAt, now());
          member.deliveredAt = member.lastReadAt;
          emit({ type: "receipt", conversationId: id });
        },
        async mute(id, muted) {
          requireMember(id, actor).members.get(actor)!.muted = muted;
          emit({ type: "settings" });
        },
        async leave(id) {
          const c = requireMember(id, actor);
          if (c.kind === "direct" || policyOf(c)?.mandatory) throw new MessagingError("forbidden");
          c.members.get(actor)!.removedAt = now();
          emit({ type: "membership", conversationId: id });
        },
        async rename(id, name) {
          const c = requireMember(id, actor);
          if (c.kind === "direct" || !isAdminHere(c, actor) || !name.trim()) throw new MessagingError("forbidden");
          c.name = name.trim().replace(/^#/, "");
          emit({ type: "membership", conversationId: id });
        },
        async addPeople(id, ids) {
          const c = requireMember(id, actor);
          if (c.kind === "direct" || !isAdminHere(c, actor)) throw new MessagingError("forbidden");
          const t = now();
          for (const pid of ids) {
            if (c.kind === "channel" ? !isWorkspaceMember(pid, c.source.workspaceId) : !canDm(actor, pid)) throw new MessagingError("forbidden");
            const existing = c.members.get(pid);
            if (existing && existing.removedAt === null) continue;
            c.members.set(pid, { id: pid, joinedAt: t, role: "member", removedAt: null, lastReadAt: t, deliveredAt: t, muted: false, collapseBlocked: false, threadReadAt: new Map() });
          }
          emit({ type: "membership", conversationId: id });
        },
        async removePerson(id, pid) {
          const c = requireMember(id, actor);
          if (c.kind === "direct" || !isAdminHere(c, actor) || pid === actor) throw new MessagingError("forbidden");
          const m = activeMember(c, pid);
          if (m) m.removedAt = now();
          emit({ type: "membership", conversationId: id });
        },
        async updateSettings(id, patch) {
          const c = requireMember(id, actor);
          if (patch.collapseBlocked !== undefined) c.members.get(actor)!.collapseBlocked = patch.collapseBlocked;
          if (patch.linkPreviews !== undefined) {
            if (c.kind !== "direct" && !isAdminHere(c, actor)) throw new MessagingError("forbidden");
            c.linkPreviews = patch.linkPreviews;
          }
          if (patch.newcomerHistory !== undefined) {
            if (c.kind !== "group" || !isAdminHere(c, actor)) throw new MessagingError("forbidden");
            c.newcomerHistory = patch.newcomerHistory;
          }
          emit({ type: "membership", conversationId: id });
        },
        async updatePolicy(id, patch) {
          const c = requireMember(id, actor);
          if (c.kind !== "channel" || !isAdminHere(c, actor)) throw new MessagingError("forbidden");
          const defaults = workspaceOf(c.source.workspaceId)!.defaults;
          // Channel policies can only be stricter than the workspace.
          if (patch.authorDeleteForEveryone && !defaults.authorDeleteForEveryone) throw new MessagingError("policy");
          if (patch.newcomerHistory === "full" && defaults.newcomerHistory !== "full") throw new MessagingError("policy");
          if (patch.membersCanPin && !defaults.membersCanPin) throw new MessagingError("policy");
          for (const [key, value] of Object.entries(patch) as [PolicyKey, never][]) {
            if (value === undefined) continue;
            if (defaults[key] === value) delete c.policyOverride[key];
            else c.policyOverride[key] = value;
          }
          emit({ type: "membership", conversationId: id });
        },
        async report(id, reason) {
          requireMember(id, actor);
          reports.push({ by: actor, target: id, reason });
        },
        async unreadCount() {
          return [...conversations.values()].filter((c) => activeMember(c, actor) && !c.members.get(actor)!.muted && summary(c, actor).unread > 0).length;
        },
        async workspaceMentions(workspaceId) {
          return [...conversations.values()]
            .filter((c) => c.kind === "channel" && c.source.workspaceId === workspaceId && activeMember(c, actor))
            .reduce((n, c) => n + summary(c, actor).mentions, 0);
        },
        // The mock has no invitation or notice store: inboxes stay empty (nothing fabricated).
        invitations: () => done([]),
        respondInvitation: () => Promise.reject(new MessagingError("not-found")),
        notices: () => done([]),
        readNotice: () => done(undefined),
      },

      messages: {
        async page(cid) {
          const c = requireMember(cid, actor);
          const member = c.members.get(actor)!;
          const items = [...messages.values()].filter((m) => m.cid === cid && inMainList(m) && visibleTo(m, actor)).sort((a, b) => a.createdAt - b.createdAt);
          const unread = items.filter((m) => m.authorId !== actor && m.state === "visible" && m.createdAt > member.lastReadAt);
          const hiddenEarlier = historyFromJoin(c) && [...messages.values()].some((m) => m.cid === cid && m.createdAt < member.joinedAt);
          return {
            items: items.map((m) => view(m, actor)),
            firstUnreadId: unread[0]?.id ?? null,
            unreadCount: unread.length,
            joinedLater: hiddenEarlier,
            joinedAt: iso(member.joinedAt),
          };
        },
        async thread(cid, parentId) {
          const c = requireMember(cid, actor);
          const parent = messages.get(parentId);
          if (!parent || parent.cid !== cid || parent.parentId !== null || !visibleTo(parent, actor)) throw new MessagingError("not-found");
          c.members.get(actor)!.threadReadAt.set(parentId, now());
          const replies = [...messages.values()].filter((m) => m.parentId === parentId && visibleTo(m, actor)).sort((a, b) => a.createdAt - b.createdAt);
          return { parent: view(parent, actor), replies: replies.map((m) => view(m, actor)) };
        },
        async send(cid, input) {
          const c = requireMember(cid, actor);
          const existing = [...messages.values()].find((m) => m.cid === cid && m.authorId === actor && m.clientOpId === input.clientOpId);
          if (existing) return view(existing, actor); // idempotent retry, never a duplicate
          if (!canPost(c, actor)) throw new MessagingError(c.kind === "direct" ? "blocked" : "forbidden");
          const body = input.body.trim();
          if (!body && !input.attachments?.length) throw new MessagingError("invalid");
          if (input.parentId) {
            const parent = messages.get(input.parentId);
            if (!parent || parent.cid !== cid || parent.parentId !== null || !visibleTo(parent, actor)) throw new MessagingError("not-found");
          }
          if (input.replyToId) requireMessage(input.replyToId, actor);
          for (const a of input.attachments ?? []) {
            if (a.kind === "voice" && ((a.durationSec ?? 0) > VOICE_MAX_SECONDS || a.bytes > VOICE_MAX_BYTES)) throw new MessagingError("too-large");
          }
          // Mentions only resolve to current members; anything else stays plain text.
          const safeBody = body.replace(MENTION, (all, name: string, pid: string) => (activeMember(c, pid) ? all : `@${name}`));
          const taskMatch = TASK_URL.exec(safeBody);
          const m: StoredMessage = {
            id: nextId("m"),
            cid,
            authorId: actor,
            createdAt: Math.max(now(), ...[...messages.values()].filter((x) => x.cid === cid).map((x) => x.createdAt + 1)),
            editedAt: null,
            body: safeBody,
            state: "visible",
            replyToId: input.replyToId ?? null,
            attachments: (input.attachments ?? []).map((a) => ({ ...a })),
            reactions: new Map(),
            forwarded: false,
            pinned: false,
            parentId: input.parentId ?? null,
            alsoInConversation: Boolean(input.parentId && input.alsoToConversation),
            hiddenFor: new Set(),
            revisions: [],
            clientOpId: input.clientOpId,
            task: taskMatch ? { workspaceId: taskMatch[2]!, taskId: taskMatch[3]! } : null,
          };
          messages.set(m.id, m);
          const member = c.members.get(actor)!;
          member.lastReadAt = m.createdAt;
          if (m.parentId) member.threadReadAt.set(m.parentId, m.createdAt);
          emit({ type: "message", conversationId: cid });
          simulateDelivery(c, actor);
          return view(m, actor);
        },
        async edit(mid, body) {
          const { m } = requireMessage(mid, actor);
          const can = capabilities(m, actor);
          if (m.authorId !== actor) throw new MessagingError("forbidden");
          if (m.state !== "visible") throw new MessagingError("not-found"); // never resurrect a deleted message
          if (can.editHoursLeft === null) throw new MessagingError("window-expired");
          if (!body.trim()) throw new MessagingError("invalid");
          m.revisions.push(m.body);
          m.body = body.trim();
          m.editedAt = now();
          emit({ type: "message", conversationId: m.cid });
          return view(m, actor);
        },
        async deleteForEveryone(mid) {
          const m = messages.get(mid);
          if (!m || !visibleTo(m, actor)) throw new MessagingError("not-found");
          if (m.authorId !== actor) throw new MessagingError("forbidden");
          if (m.state === "deleted") return; // idempotent retry
          const can = capabilities(m, actor);
          if (!can.deleteForEveryone.allowed) throw new MessagingError(can.deleteForEveryone.reason === "window" ? "window-expired" : can.deleteForEveryone.reason === "policy" ? "policy" : "forbidden");
          m.state = "deleted";
          m.body = "";
          m.attachments = [];
          m.reactions.clear();
          m.pinned = false;
          emit({ type: "message", conversationId: m.cid });
        },
        async deleteForMe(mid) {
          const m = messages.get(mid);
          if (!m) throw new MessagingError("not-found");
          if (m.hiddenFor.has(actor)) return; // idempotent
          if (!visibleTo(m, actor)) throw new MessagingError("not-found");
          m.hiddenFor.add(actor);
          emit({ type: "message", conversationId: m.cid });
        },
        async moderate(mid) {
          const { m } = requireMessage(mid, actor);
          if (!capabilities(m, actor).moderate) throw new MessagingError("forbidden");
          m.state = "removed";
          m.body = "";
          m.attachments = [];
          m.reactions.clear();
          m.pinned = false;
          emit({ type: "message", conversationId: m.cid });
        },
        async react(mid, emoji) {
          const { m, c } = requireMessage(mid, actor);
          if (m.state !== "visible" || !canPost(c, actor)) throw new MessagingError("forbidden");
          const set = m.reactions.get(emoji) ?? new Set<string>();
          if (set.has(actor)) set.delete(actor);
          else set.add(actor);
          m.reactions.set(emoji, set);
          emit({ type: "message", conversationId: m.cid });
        },
        async pin(mid, pinned) {
          const { m } = requireMessage(mid, actor);
          if (!capabilities(m, actor).pin) throw new MessagingError("forbidden");
          m.pinned = pinned;
          emit({ type: "message", conversationId: m.cid });
        },
        async pinned(cid) {
          requireMember(cid, actor);
          return [...messages.values()].filter((m) => m.cid === cid && m.pinned && m.state === "visible" && visibleTo(m, actor)).sort((a, b) => b.createdAt - a.createdAt).map((m) => view(m, actor));
        },
        async media(cid) {
          requireMember(cid, actor);
          return [...messages.values()]
            .filter((m) => m.cid === cid && m.state === "visible" && visibleTo(m, actor))
            .sort((a, b) => b.createdAt - a.createdAt)
            .flatMap((m) => m.attachments.map((attachment) => ({ message: view(m, actor), attachment: { ...attachment } })));
        },
        async forwardTargets(mid) {
          const { m, c: from } = requireMessage(mid, actor);
          const restricted = m.attachments.some((a) => !a.shareable);
          return [...conversations.values()]
            .filter((c) => activeMember(c, actor))
            .map((c) => ({
              conversationId: c.id,
              title: titleFor(c, actor),
              kind: c.kind,
              source: { ...c.source },
              canPost: canPost(c, actor) && (!restricted || c.id === from.id),
            }))
            .sort((a, b) => Number(b.canPost) - Number(a.canPost));
        },
        async forward(mid, targetId, clientOpId) {
          const { m } = requireMessage(mid, actor);
          if (m.state !== "visible") throw new MessagingError("not-found");
          const target = requireMember(targetId, actor);
          const existing = [...messages.values()].find((x) => x.cid === targetId && x.authorId === actor && x.clientOpId === clientOpId);
          if (existing) return;
          if (!canPost(target, actor) || (m.attachments.some((a) => !a.shareable) && target.id !== m.cid)) throw new MessagingError("forbidden");
          const copy: StoredMessage = { ...m, id: nextId("m"), cid: targetId, authorId: actor, createdAt: now(), editedAt: null, replyToId: null, reactions: new Map(), forwarded: true, pinned: false, parentId: null, alsoInConversation: false, hiddenFor: new Set(), revisions: [], clientOpId, attachments: m.attachments.map((a) => ({ ...a })) };
          messages.set(copy.id, copy);
          emit({ type: "message", conversationId: targetId });
        },
        async report(mid, reason) {
          requireMessage(mid, actor);
          reports.push({ by: actor, target: mid, reason });
        },
        async search(query, filters) {
          const q = query.trim().toLowerCase();
          if (!q && !filters.from && !filters.has && !filters.in) return [];
          const day = (t: number) => new Date(t + 3.5 * 3600_000).toISOString().slice(0, 10);
          return [...messages.values()]
            .filter((m) => {
              // Visible history only: current membership, join rule, not hidden for me, not deleted for everyone.
              if (!visibleTo(m, actor) || m.state !== "visible") return false;
              if (filters.in && m.cid !== filters.in) return false;
              if (filters.from && m.authorId !== filters.from) return false;
              if (filters.has === "link" && !LINK.test(m.body)) return false;
              if (filters.has && filters.has !== "link" && !m.attachments.some((a) => a.kind === filters.has)) return false;
              if (filters.after && day(m.createdAt) < filters.after) return false;
              if (filters.before && day(m.createdAt) > filters.before) return false;
              if (!q) return true;
              return plainText(m.body).toLowerCase().includes(q) || m.attachments.some((a) => a.name.toLowerCase().includes(q));
            })
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((m) => {
              const c = conversations.get(m.cid)!;
              return { message: view(m, actor), conversationId: c.id, conversationTitle: titleFor(c, actor), kind: c.kind, source: { ...c.source } };
            });
        },
        async upload(file, onProgress) {
          if (file.kind === "voice") {
            if ((file.durationSec ?? 0) > VOICE_MAX_SECONDS) throw new MessagingError("too-long");
            if (file.bytes > VOICE_MAX_BYTES) throw new MessagingError("too-large");
          } else if (file.bytes > FILE_MAX_BYTES) throw new MessagingError("too-large");
          for (const p of [0.25, 0.6, 0.9]) {
            onProgress?.(p);
            await wait(uploadStepMs);
          }
          onProgress?.(1);
          return { id: nextId("att"), kind: file.kind, name: file.name, bytes: file.bytes, mime: file.mime, durationSec: file.durationSec, url: file.url, shareable: true };
        },
      },

      channels: {
        async list(workspaceId) {
          return [...conversations.values()]
            .filter((c) => c.kind === "channel" && c.source.workspaceId === workspaceId && activeMember(c, actor))
            .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
            .map((c) => summary(c, actor));
        },
        async workspace(workspaceId) {
          const ws = workspaceOf(workspaceId);
          if (!ws || !ws.members.includes(actor)) return null;
          return {
            source: { ...ws.source },
            canCreate: ws.admins.includes(actor),
            defaults: { ...ws.defaults, inherited: ["authorDeleteForEveryone", "newcomerHistory", "membersCanPin"] },
            members: ws.members.filter((id) => !people.get(id)?.deleted).map(personView),
          };
        },
        async create({ workspace, name, memberIds, policy, clientOpId }) {
          const ws = workspaceOf(workspace.workspaceId);
          if (!ws || !ws.admins.includes(actor)) throw new MessagingError("forbidden");
          const existing = [...conversations.values()].find((c) => c.clientOpId === clientOpId);
          if (existing) return existing.id;
          const clean = name.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
          if (!clean) throw new MessagingError("invalid");
          if (policy.authorDeleteForEveryone && !ws.defaults.authorDeleteForEveryone) throw new MessagingError("policy");
          if (policy.newcomerHistory === "full" && ws.defaults.newcomerHistory !== "full") throw new MessagingError("policy");
          if (policy.membersCanPin && !ws.defaults.membersCanPin) throw new MessagingError("policy");
          const ids = memberIds === "all" ? ws.members : [...new Set([actor, ...memberIds])];
          if (ids.some((id) => !ws.members.includes(id))) throw new MessagingError("forbidden");
          const t = now();
          const id = nextId("c");
          const override: StoredConversation["policyOverride"] = {};
          for (const key of ["authorDeleteForEveryone", "newcomerHistory", "membersCanPin"] as const) if (policy[key] !== ws.defaults[key]) (override as Record<string, unknown>)[key] = policy[key];
          conversations.set(id, {
            id,
            kind: "channel",
            name: clean,
            source: { ...ws.source },
            members: new Map(ids.filter((pid) => !people.get(pid)?.deleted).map((pid) => [pid, { id: pid, joinedAt: t, role: pid === actor ? "admin" : "member", removedAt: null, lastReadAt: t, deliveredAt: t, muted: false, collapseBlocked: false, threadReadAt: new Map() }])),
            policyOverride: override,
            newcomerHistory: policy.newcomerHistory,
            linkPreviews: false,
            createdAt: t,
            clientOpId,
          });
          emit({ type: "membership", conversationId: id });
          return id;
        },
      },

      settings: {
        get: () => done({ ...settingsOf(actor), quietHours: { ...settingsOf(actor).quietHours } }),
        async set(patch) {
          const next = { ...settingsOf(actor), ...patch };
          settings.set(actor, next);
          emit({ type: "settings" });
          return { ...next };
        },
        blocked: () => done([...blockSet(actor)].map(personView)),
        async block(pid) {
          if (pid === actor) throw new MessagingError("invalid");
          blockSet(actor).add(pid);
          emit({ type: "settings" });
        },
        async unblock(pid) {
          blockSet(actor).delete(pid);
          emit({ type: "settings" });
        },
      },

      meetings: {
        async list(tab) {
          const t = now();
          const mine = [...meetings.values()].filter((mt) => canSeeMeeting(mt, actor));
          const rows =
            tab === "upcoming"
              ? mine.filter((mt) => mt.end > t).sort((a, b) => a.start - b.start)
              : tab === "past"
                ? mine.filter((mt) => mt.end <= t).sort((a, b) => b.start - a.start)
                : mine.filter((mt) => meetingSummary(mt, actor).needsMyMinutes).sort((a, b) => b.start - a.start);
          return rows.map((mt) => meetingSummary(mt, actor));
        },
        async forCalendar(source, from, to) {
          const a = ms(from);
          const b = ms(to);
          return [...meetings.values()]
            .filter((mt) => mt.source.kind === source.kind && mt.source.workspaceId === source.workspaceId && mt.end > a && mt.start < b)
            .flatMap((mt) => {
              if (canSeeMeeting(mt, actor)) return [{ ...meetingSummary(mt, actor), busyOnly: false }];
              // Not invited: "Busy" only when the source allows it, otherwise nothing.
              const ws = workspaceOf(mt.source.workspaceId);
              if (mt.source.kind === "personal" || !ws?.busyVisible || !ws.members.includes(actor)) return [];
              return [{ ...meetingSummary(mt, actor), title: "", link: null, location: null, organizer: personView(mt.organizer), myRsvp: "none" as Rsvp, inviteeCount: 0, minutesStatus: null, needsMyMinutes: false, busyOnly: true }];
            })
            .sort((x, y) => x.start.localeCompare(y.start));
        },
        async get(id) {
          const mt = meetings.get(id);
          if (!mt || !canSeeMeeting(mt, actor)) return null;
          const detail: MeetingDetail = {
            ...meetingSummary(mt, actor),
            invitees: Object.entries(mt.invitees).map(([pid, rsvp]) => ({ ...personView(pid), rsvp, role: inviteeRole(mt, pid) })),
            agenda: mt.agenda.map((a) => ({ ...a, owner: a.owner ? personView(a.owner) : null })),
            notes: mt.notes,
            files: mt.files.map((f) => ({ ...f })),
            channelId: mt.channelId && activeMember(conversations.get(mt.channelId)!, actor) ? mt.channelId : null,
            myRole: inviteeRole(mt, actor),
            canEdit: canEditMeeting(mt, actor),
            canEditAgenda: canEditAgenda(mt, actor),
            description: mt.description,
          };
          return detail;
        },
        // Invited meetings are listed directly in the mock (OD-15 rows are a live-only case).
        invitations: () => done([]),
        async create(input) {
          const existing = [...meetings.values()].find((mt) => mt.clientOpId === input.clientOpId);
          if (existing) return existing.id;
          const sources = sourcesFor(actor);
          if (!sources.some((s) => s.kind === input.source.kind && s.workspaceId === input.source.workspaceId)) throw new MessagingError("forbidden");
          const allowed = new Set(invitableFor(actor, input.source).map((p) => p.id));
          if (input.inviteeIds.some((id) => !allowed.has(id))) throw new MessagingError("forbidden");
          if (!input.title.trim() || ms(input.end) <= ms(input.start)) throw new MessagingError("invalid");
          if (input.link && !/^https:\/\/\S+$/.test(input.link)) throw new MessagingError("invalid");
          const id = nextId("mt");
          const ws = workspaceOf(input.source.workspaceId);
          const channel = ws ? [...conversations.values()].find((c) => c.kind === "channel" && c.source.workspaceId === ws.source.workspaceId && activeMember(c, actor)) : undefined;
          meetings.set(id, {
            id,
            title: input.title.trim(),
            source: ws ? { ...ws.source } : { kind: "personal", workspaceId: null, name: "" },
            start: ms(input.start),
            end: ms(input.end),
            link: input.link,
            location: null,
            organizer: actor,
            minuteTaker: actor,
            invitees: Object.fromEntries([[actor, "going" as Rsvp], ...input.inviteeIds.filter((pid) => pid !== actor).map((pid) => [pid, "none" as Rsvp])]),
            agenda: [],
            notes: "",
            files: [],
            channelId: channel?.id ?? null,
            description: "",
            clientOpId: input.clientOpId,
            minutes: null,
          });
          emit({ type: "meeting", meetingId: id });
          return id;
        },
        async update(id, patch) {
          const mt = requireMeeting(id, actor);
          if (!canEditMeeting(mt, actor)) throw new MessagingError("forbidden");
          if (patch.link && !/^https:\/\/\S+$/.test(patch.link)) throw new MessagingError("invalid");
          if (patch.title !== undefined) mt.title = patch.title.trim() || mt.title;
          if (patch.start) mt.start = ms(patch.start);
          if (patch.end) mt.end = ms(patch.end);
          if (patch.link !== undefined) mt.link = patch.link;
          if (patch.description !== undefined) mt.description = patch.description;
          emit({ type: "meeting", meetingId: id });
        },
        async rsvp(id, rsvp) {
          const mt = requireMeeting(id, actor);
          if (!(actor in mt.invitees)) throw new MessagingError("forbidden");
          mt.invitees[actor] = rsvp;
          emit({ type: "meeting", meetingId: id });
        },
        async addAgenda(id, title, minutes) {
          const mt = requireMeeting(id, actor);
          if (!canEditAgenda(mt, actor) || !title.trim()) throw new MessagingError("forbidden");
          mt.agenda.push({ id: nextId("a"), title: title.trim(), owner: actor, minutes: Math.max(1, Math.round(minutes)), done: false });
          emit({ type: "meeting", meetingId: id });
        },
        async toggleAgenda(id, itemId) {
          const mt = requireMeeting(id, actor);
          if (!canEditAgenda(mt, actor)) throw new MessagingError("forbidden");
          const item = mt.agenda.find((a) => a.id === itemId);
          if (item) item.done = !item.done;
          emit({ type: "meeting", meetingId: id });
        },
        // OD-16 proposals are the live model; the mock edits its agenda directly (canProposeAgenda / canDecideAgenda unset).
        proposeAgenda: () => Promise.reject(new MessagingError("unavailable")),
        decideAgenda: () => Promise.reject(new MessagingError("unavailable")),
        async saveNotes(id, notes) {
          const mt = requireMeeting(id, actor);
          if (!(actor in mt.invitees)) throw new MessagingError("forbidden");
          mt.notes = notes;
          emit({ type: "meeting", meetingId: id });
        },
        async attach(id, file) {
          const mt = requireMeeting(id, actor);
          if (!(actor in mt.invitees)) throw new MessagingError("forbidden");
          if (file.bytes > FILE_MAX_BYTES) throw new MessagingError("too-large");
          mt.files.push({ id: nextId("f"), ...file });
          emit({ type: "meeting", meetingId: id });
        },
        // Mock files keep name + size only; there are no bytes to hand out.
        async download(id) {
          const mt = requireMeeting(id, actor);
          if (!(actor in mt.invitees)) throw new MessagingError("forbidden");
          throw new MessagingError("unavailable", "Mock files have no stored bytes");
        },
        invitable: (source) => done(invitableFor(actor, source)),
        sources: () => done(sourcesFor(actor)),
      },

      minutes: {
        async get(meetingId) {
          const mt = requireMeeting(meetingId, actor);
          const personal = mt.source.kind === "personal";
          const min = mt.minutes ?? { status: "draft" as MinutesStatus, summary: mt.notes, decisions: [], actions: [], reviewers: new Map(), version: 0, versions: [], changesComment: null };
          const writer = mt.minuteTaker === actor || mt.organizer === actor;
          const admin = !personal && isWorkspaceAdmin(actor, mt.source);
          const review = min.reviewers.get(actor);
          const result: Minutes = {
            meetingId,
            status: min.status,
            version: min.version,
            summary: min.summary,
            decisions: min.decisions.map((d): Decision => ({ id: d.id, text: d.text, proposedBy: personView(d.by) })),
            actionItems: min.actions.map((a): ActionItem => ({ id: a.id, text: a.text, assignee: a.assignee ? personView(a.assignee) : null, due: a.due, task: a.task })),
            reviews: [...min.reviewers].map(([pid, r]) => ({ reviewer: personView(pid), state: r.state, comment: r.comment })),
            versions: min.versions.map((v): MinutesVersion => ({ version: v.version, status: v.status, at: iso(v.at), by: personView(v.by), note: v.note })),
            personal,
            can: {
              write: writer && min.status === "draft",
              submit: writer && min.status === "draft" && !personal,
              review: !personal && min.status === "in-review" && review?.state === "pending",
              finalize: (mt.organizer === actor || admin) && (min.status === "approved" || (personal && min.status === "draft" && min.version > 0)),
              makeTask: writer || admin,
              withdraw: (writer || admin) && (min.status === "in-review" || min.status === "approved"),
            },
            changesComment: min.changesComment,
          };
          return result;
        },
        async save(meetingId, patch) {
          const mt = requireMeeting(meetingId, actor);
          const min = ensureMinutes(mt);
          if ((mt.minuteTaker !== actor && mt.organizer !== actor) || min.status !== "draft") throw new MessagingError("forbidden");
          if (patch.summary !== undefined) min.summary = patch.summary;
          if (patch.decisions) min.decisions = patch.decisions.map((d) => ({ id: d.id, text: d.text, by: d.proposedBy?.id ?? actor }));
          if (patch.actionItems)
            min.actions = patch.actionItems.map((a) => {
              const prev = min.actions.find((x) => x.id === a.id);
              return { id: a.id, text: a.text, assignee: a.assignee?.id ?? null, due: a.due, task: prev?.task ?? null };
            });
          emit({ type: "meeting", meetingId });
        },
        async submit(meetingId, reviewerIds) {
          const mt = requireMeeting(meetingId, actor);
          const min = ensureMinutes(mt);
          if ((mt.minuteTaker !== actor && mt.organizer !== actor) || min.status !== "draft" || mt.source.kind === "personal") throw new MessagingError("forbidden");
          const ids = [...new Set(reviewerIds)].filter((id) => id in mt.invitees && id !== actor);
          if (ids.length === 0) throw new MessagingError("invalid");
          min.reviewers = new Map(ids.map((id) => [id, { state: "pending" as const, comment: null }]));
          min.status = "in-review";
          min.version += min.versions.length ? 1 : 0;
          min.changesComment = null;
          pushVersion(min, actor);
          emit({ type: "meeting", meetingId });
        },
        async approve(meetingId) {
          const mt = requireMeeting(meetingId, actor);
          const min = mt.minutes;
          const review = min?.reviewers.get(actor);
          if (!min || min.status !== "in-review" || review?.state !== "pending") throw new MessagingError("forbidden");
          review.state = "approved";
          // All chosen reviewers must approve (M7).
          if ([...min.reviewers.values()].every((r) => r.state === "approved")) {
            min.status = "approved";
            pushVersion(min, actor);
          }
          emit({ type: "meeting", meetingId });
        },
        async requestChanges(meetingId, comment) {
          const mt = requireMeeting(meetingId, actor);
          const min = mt.minutes;
          const review = min?.reviewers.get(actor);
          if (!min || min.status !== "in-review" || review?.state !== "pending" || !comment.trim()) throw new MessagingError("forbidden");
          review.state = "changes";
          review.comment = comment.trim();
          min.status = "draft";
          min.changesComment = comment.trim();
          pushVersion(min, actor, comment.trim());
          emit({ type: "meeting", meetingId });
        },
        async finalize(meetingId) {
          const mt = requireMeeting(meetingId, actor);
          const min = ensureMinutes(mt);
          const personal = mt.source.kind === "personal";
          const allowed = mt.organizer === actor || (!personal && isWorkspaceAdmin(actor, mt.source));
          if (!allowed || !(min.status === "approved" || (personal && min.status === "draft"))) throw new MessagingError("forbidden");
          min.status = "final";
          min.version += 1;
          pushVersion(min, actor);
          emit({ type: "meeting", meetingId });
        },
        async withdraw(meetingId) {
          const mt = requireMeeting(meetingId, actor);
          const min = mt.minutes;
          const allowed = mt.minuteTaker === actor || mt.organizer === actor || (mt.source.kind !== "personal" && isWorkspaceAdmin(actor, mt.source));
          if (!allowed) throw new MessagingError("forbidden");
          if (!min || (min.status !== "in-review" && min.status !== "approved")) throw new MessagingError("invalid", "Changed elsewhere");
          min.status = "draft";
          min.reviewers = new Map();
          pushVersion(min, actor);
          emit({ type: "meeting", meetingId });
        },
        async linkTask(meetingId, itemId, task) {
          const mt = requireMeeting(meetingId, actor);
          const min = mt.minutes;
          const writer = mt.minuteTaker === actor || mt.organizer === actor || (mt.source.kind !== "personal" && isWorkspaceAdmin(actor, mt.source));
          const item = min?.actions.find((a) => a.id === itemId);
          if (!writer || !item) throw new MessagingError("forbidden");
          if (item.task) return; // the item links to one task; no copies
          // The task must live in the meeting's source workspace (or Personal).
          if (task.workspace.kind !== mt.source.kind || task.workspace.workspaceId !== mt.source.workspaceId) throw new MessagingError("forbidden");
          item.task = task;
          emit({ type: "meeting", meetingId });
        },
      },

      announcements: {
        async list(workspaceId) {
          const t = now();
          return [...announcements.values()]
            .filter((a) => a.workspaceId === workspaceId)
            .filter((a) => {
              const manager = a.author === actor || isPublisher(actor, workspaceId);
              if (manager) return true;
              if (a.publishedAt === null || a.publishedAt > t) return false;
              return audienceIds(a).includes(actor);
            })
            .map((a) => announcementView(a, actor))
            .sort((a, b) => Number(Boolean(b.pinnedUntil)) - Number(Boolean(a.pinnedUntil)) || (b.publishedAt ?? b.scheduledFor ?? "").localeCompare(a.publishedAt ?? a.scheduledFor ?? ""));
        },
        async access(workspaceId) {
          const ws = workspaceOf(workspaceId);
          const canPublish = ws?.publishers.includes(actor) ?? false;
          return {
            canPublish,
            audiences: ws && canPublish ? [{ kind: "workspace" as const, label: ws.source.name, memberIds: [] }, ...ws.audiences.map((a) => ({ kind: "subset" as const, ...a }))] : [],
          };
        },
        async publish(input) {
          const ws = workspaceOf(input.workspace.workspaceId);
          if (!ws || !ws.publishers.includes(actor)) throw new MessagingError("forbidden");
          const existing = [...announcements.values()].find((a) => a.clientOpId === input.clientOpId);
          if (existing) return existing.id;
          if (!input.title.trim() || !input.body.trim()) throw new MessagingError("invalid");
          if (input.audience.kind === "subset" && input.audience.memberIds.some((id) => !ws.members.includes(id))) throw new MessagingError("forbidden");
          const t = now();
          const scheduled = input.scheduleAt ? ms(input.scheduleAt) : null;
          if (scheduled !== null && scheduled <= t) throw new MessagingError("invalid");
          const id = nextId("an");
          announcements.set(id, {
            id,
            workspaceId: ws.source.workspaceId!,
            title: input.title.trim(),
            body: input.body.trim(),
            author: actor,
            publishedAt: scheduled === null ? t : null,
            scheduledFor: scheduled,
            audience: { ...input.audience },
            pinnedUntil: input.pinDays ? (scheduled ?? t) + input.pinDays * DAY_MS : null,
            requireAck: input.requireAck,
            acks: new Set(),
            lastReminderAt: null,
            clientOpId: input.clientOpId,
          });
          emit({ type: "announcement", workspaceId: ws.source.workspaceId! });
          return id;
        },
        async ack(id) {
          const a = announcements.get(id);
          if (!a || !audienceIds(a).includes(actor) || !a.requireAck) throw new MessagingError("not-found");
          a.acks.add(actor);
          emit({ type: "announcement", workspaceId: a.workspaceId });
        },
        async remind(id) {
          const a = announcements.get(id);
          if (!a || !canRemind(a, actor)) throw new MessagingError("forbidden");
          a.lastReminderAt = now();
          emit({ type: "announcement", workspaceId: a.workspaceId });
        },
        reminders: () => done([]),
        readReminder: () => done(undefined),
      },
    };
  }

  return {
    as,
    /** Test hooks (mock only). */
    debug: { messages, conversations, reports, blocks: blockSet },
  };
}

export type MessagingServer = ReturnType<typeof createMessagingServer>;

/** The app's messaging repository: the signed-in sample user ("me"). */
export function createMockMessaging(options: MessagingServerOptions = {}): MessagingRepository {
  return createMessagingServer(options).as("me");
}
