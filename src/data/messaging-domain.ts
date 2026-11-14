/*
 * Messages & Meetings (Phase 5) domain. Backend Phase 5 is not built: the
 * typed mock "server" (mock/mock-messaging.ts) decides every permission and
 * visibility rule per actor, so the UI never guesses (48h window, receipts,
 * pre-join history, delete-for-me). Times are ISO instants (Gregorian
 * transport, Jalali display).
 */

export type MsgSourceKind = "personal" | "project" | "team" | "company";

/** Where a conversation, meeting or announcement belongs; drives colour and visibility. */
export interface MsgSource {
  kind: MsgSourceKind;
  /** Workspace id (project / team / company); null for Personal. */
  workspaceId: string | null;
  /** Workspace name (data); empty for Personal. */
  name: string;
}

export interface MsgPerson {
  id: string;
  name: string;
  initials: string;
  /** Account deleted: shown as "Deleted user", messages kept. */
  deleted?: boolean;
}

export type ConversationKind = "direct" | "group" | "channel";
export type ConversationTab = "all" | "direct" | "groups" | "channels";

/** Work-channel policy (P5-02); inherited values carry `setBy` (the workspace name). */
export interface ChannelPolicy {
  authorDeleteForEveryone: boolean;
  newcomerHistory: "from-join" | "full";
  membersCanPin: boolean;
  /** Mandatory channel: no Leave. */
  mandatory: boolean;
  /** Workspace that set the policy (inherited rows show "Set by …"), or null when set on the channel. */
  setBy: string | null;
  /** Posting restricted to admins (announcement-style channels). */
  adminsOnlyPost: boolean;
  /** Rows still inherited from the workspace (show "Set by …"). */
  inherited: PolicyKey[];
}

export type PolicyKey = "authorDeleteForEveryone" | "newcomerHistory" | "membersCanPin";

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  /** Channel name without "#", group name, or the other person's name. */
  title: string;
  initials: string;
  source: MsgSource;
  lastMessage: { author: string; mine: boolean; preview: string; kind: "text" | "image" | "file" | "voice" | "deleted"; at: string } | null;
  unread: number;
  mentions: number;
  muted: boolean;
  /** Direct only: either side blocked the other. */
  blocked: boolean;
}

export type ConversationAccess = "member" | "removed" | "not-found";

export interface ConversationDetail extends ConversationSummary {
  access: "member";
  memberCount: number;
  myRole: "member" | "admin";
  /** Workspace admin of the source (moderation, policy). */
  workspaceAdmin: boolean;
  joinedAt: string;
  /** Earlier history hidden by the join rule (note at the top of history). */
  joinedLater: boolean;
  /** Direct: the other participant. */
  other: (MsgPerson & { presence: PresenceView }) | null;
  /** Direct: who blocked whom. */
  blockedBy: "me" | "them" | null;
  policy: ChannelPolicy | null;
  linkPreviews: boolean;
  /** Private group admins choose; channels follow policy. */
  newcomerHistory: "from-join" | "full";
  canPost: boolean;
  canPin: boolean;
  canManage: boolean;
  /** Threads I take part in with unread replies. */
  threadUnread: number;
  pinnedCount: number;
  collapseBlocked: boolean;
}

/** Presence after privacy (reciprocal): never stored as history. */
export type PresenceView = { kind: "online" } | { kind: "last-seen"; at: string } | { kind: "hidden" };

export type AttachmentKind = "image" | "file" | "voice";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  bytes: number;
  /** Voice: seconds. */
  durationSec?: number;
  /** Real MIME type as recorded / picked (never renamed). */
  mime: string;
  /** Object URL (mock) for previews/playback; absent for fixtures. */
  url?: string;
  /** Can be forwarded to other conversations. */
  shareable: boolean;
}

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export type MessageState = "visible" | "deleted" | "removed";

/** What the server allows the current actor to do with a message (computed per read and re-checked per command). */
export interface MessageCapabilities {
  /** Hours left in the 48h edit window (ceil), or null when edit is not allowed. */
  editHoursLeft: number | null;
  deleteForEveryone: { allowed: true; hoursLeft: number } | { allowed: false; reason: "not-author" | "window" | "policy" };
  pin: boolean;
  moderate: boolean;
}

export interface TaskLinkCard {
  readable: boolean;
  title?: string;
  status?: string;
  due?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  author: MsgPerson;
  mine: boolean;
  createdAt: string;
  editedAt: string | null;
  state: MessageState;
  /** Bounded rich text (**bold**, _italic_, `code`, "- " lists, links, @[Name](id) mentions); empty when deleted. */
  body: string;
  replyTo: { id: string; author: string; excerpt: string; deleted: boolean } | null;
  attachments: Attachment[];
  reactions: Reaction[];
  forwarded: boolean;
  pinned: boolean;
  mentionsMe: boolean;
  taskLink: TaskLinkCard | null;
  /** Replies when this message is a thread parent. */
  thread: { count: number; lastAt: string; unread: number } | null;
  /** Thread reply: parent id. */
  parentId: string | null;
  /** Thread reply also posted to the conversation. */
  alsoInConversation: boolean;
  /** My own messages: receipt after privacy rules (direct: sent/delivered/seen; groups/channels: no "seen"). */
  receipt: "sent" | "delivered" | "seen" | null;
  clientOpId: string | null;
  /** Author is blocked by me (group/channel): may be collapsed locally. */
  fromBlocked: boolean;
  can: MessageCapabilities;
}

export interface MessagePage {
  items: Message[];
  /** First unread message id at load time (unread line). */
  firstUnreadId: string | null;
  unreadCount: number;
  joinedLater: boolean;
  joinedAt: string;
}

export interface SendInput {
  clientOpId: string;
  body: string;
  replyToId?: string;
  attachments?: Attachment[];
  /** Thread reply. */
  parentId?: string;
  alsoToConversation?: boolean;
}

export type ReportReason = "spam" | "harassment" | "other";

export interface ForwardTarget {
  conversationId: string;
  title: string;
  kind: ConversationKind;
  source: MsgSource;
  canPost: boolean;
}

export interface SearchFilters {
  from?: string;
  in?: string;
  has?: "file" | "image" | "voice" | "link";
  /** Inclusive local days, "YYYY-MM-DD". */
  after?: string;
  before?: string;
}

export interface SearchHit {
  message: Message;
  conversationId: string;
  conversationTitle: string;
  kind: ConversationKind;
  source: MsgSource;
}

export interface Participant extends MsgPerson {
  role: "member" | "admin" | "guest";
  you: boolean;
}

export interface MessagingSettings {
  receiptsDirect: boolean;
  lastSeen: "everyone" | "contacts" | "nobody";
  online: "everyone" | "contacts" | "nobody";
  typing: boolean;
  whoCanDm: "connections-and-workspaces" | "workspaces" | "nobody";
  notifyDirect: boolean;
  notifyMentions: boolean;
  notifyOther: "badge" | "none";
  quietHours: { enabled: boolean; from: string; to: string };
  linkPreviewsDefault: boolean;
}

export interface LookupResult {
  /** Only people the actor may message; lookup never says whether an account exists. */
  people: MsgPerson[];
}

export interface NewConversationInput {
  personIds: string[];
  name?: string;
  clientOpId: string;
}

export interface NewChannelInput {
  workspace: MsgSource;
  name: string;
  memberIds: string[] | "all";
  policy: Pick<ChannelPolicy, "authorDeleteForEveryone" | "newcomerHistory" | "membersCanPin">;
  clientOpId: string;
}

export type MessagingEvent =
  | { type: "message"; conversationId: string }
  | { type: "receipt"; conversationId: string }
  | { type: "membership"; conversationId: string }
  | { type: "meeting"; meetingId: string }
  | { type: "announcement"; workspaceId: string }
  | { type: "settings" };

/* ── Meetings (P5-05) ── */

export type Rsvp = "going" | "maybe" | "not-going" | "none";
export type MeetingTab = "upcoming" | "past" | "needs-minutes";
export type MinutesStatus = "draft" | "in-review" | "approved" | "final";

export interface MeetingSummary {
  id: string;
  title: string;
  source: MsgSource;
  start: string;
  end: string;
  /** External URL (Meet / Zoom / Teams); no built-in calls. */
  link: string | null;
  location: string | null;
  myRsvp: Rsvp;
  organizer: MsgPerson;
  inviteeCount: number;
  minutesStatus: MinutesStatus | null;
  /** I am the minute taker and minutes are not final. */
  needsMyMinutes: boolean;
}

export interface AgendaItem {
  id: string;
  title: string;
  owner: MsgPerson | null;
  /** Planned minutes; null when not served (live agenda entries have no duration). */
  minutes: number | null;
  /** Null when there is no done state (live agenda entries). */
  done: boolean | null;
  /** OD-16 (live): a proposal waiting for the organiser to accept or reject. */
  proposed?: boolean;
}

export interface MeetingFile {
  id: string;
  name: string;
  bytes: number;
  /** Linked from the source files instead of uploaded. */
  linked: boolean;
}

export interface Invitee extends MsgPerson {
  rsvp: Rsvp;
  role: "organizer" | "minute-taker" | "attendee";
}

export interface MeetingDetail extends MeetingSummary {
  invitees: Invitee[];
  agenda: AgendaItem[];
  /** Shared meeting notes; null when the API has none (live). */
  notes: string | null;
  files: MeetingFile[];
  /** Source channel (workspace meetings). */
  channelId: string | null;
  myRole: "organizer" | "minute-taker" | "attendee";
  canEdit: boolean;
  canEditAgenda: boolean;
  /** OD-16 (live): may propose agenda entries (text only). */
  canProposeAgenda?: boolean;
  /** OD-16 (live): may accept / reject proposals (organiser). */
  canDecideAgenda?: boolean;
  description: string;
}

export interface Decision {
  id: string;
  text: string;
  /** Null when the API does not serve who proposed it. */
  proposedBy: MsgPerson | null;
}

export interface ActionItem {
  id: string;
  text: string;
  assignee: MsgPerson | null;
  due: string | null;
  /** The authoritative task once "Make task" ran (no copies). */
  task: { id: string; href: string; workspace: MsgSource } | null;
}

export interface MinutesReview {
  reviewer: MsgPerson;
  state: "pending" | "approved" | "changes";
  comment: string | null;
}

export interface MinutesVersion {
  version: number;
  status: MinutesStatus;
  at: string;
  by: MsgPerson;
  note: string | null;
}

export interface Minutes {
  meetingId: string;
  status: MinutesStatus;
  version: number;
  summary: string;
  decisions: Decision[];
  actionItems: ActionItem[];
  reviews: MinutesReview[];
  versions: MinutesVersion[];
  /** Personal meetings: optional minutes, no review step. */
  personal: boolean;
  /** `withdraw`: pull an in-review / approved version back to Draft (author or organiser; never a final one). */
  can: { write: boolean; submit: boolean; review: boolean; finalize: boolean; makeTask: boolean; withdraw?: boolean };
  /** Last "request changes" comment (back to Draft). */
  changesComment: string | null;
}

/** OD-15: a pending invitation shown as a reduced row (no source, by policy); answered with `meetings.rsvp`. */
export interface MeetingInvitation {
  meetingId: string;
  title: string;
  /** Null when the time cannot be placed in the planner zone. */
  start: string | null;
  end: string | null;
}

/**
 * A pending conversation invitation addressed to me (recipient-only read).
 * The API serves no conversation title: only the kind, the inviter's display
 * name when visible to me (else null) and the expiry.
 */
export interface ConversationInvitation {
  id: string;
  revision: number;
  conversationId: string;
  kind: ConversationKind;
  inviterName: string | null;
  expiresAt: string;
}

/** A server-created messaging notice (new message or invitation); read-only state + read, no dismiss / snooze in the API. */
export interface MessagingNotice {
  id: string;
  revision: number;
  conversationId: string;
  kind: "message" | "invitation";
  messageId: string | null;
  invitationId: string | null;
  read: boolean;
  at: string;
}

/** "Please read" reminder for an announcement; title / source only when the announcement is still readable by me. */
export interface AnnouncementReminder {
  id: string;
  announcementId: string;
  at: string;
  read: boolean;
  title: string | null;
  source: MsgSource | null;
}

export interface NewMeetingInput {
  title: string;
  source: MsgSource;
  start: string;
  end: string;
  inviteeIds: string[];
  link: string | null;
  clientOpId: string;
}

/* ── Announcements (MT-04) ── */

export interface Audience {
  kind: "workspace" | "subset";
  /** Subset label (department / team / office) — data. */
  label: string;
  /** Subset member ids. */
  memberIds: string[];
}

export interface Announcement {
  id: string;
  workspace: MsgSource;
  title: string;
  body: string;
  /** Null when the server serves no author (live: `authorDisplayName` null) — never invented. */
  author: MsgPerson | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  /** Null when the audience is not served (live). */
  audience: { kind: Audience["kind"]; label: string; size: number } | null;
  pinned: boolean;
  /** Pin end, when known (live pins have none). */
  pinnedUntil: string | null;
  requireAck: boolean;
  /** My acknowledgement (audience members). */
  acked: boolean;
  /** Author / admins only. */
  ack: { done: number; total: number; pending: MsgPerson[]; lastReminderAt: string | null } | null;
  canRemind: boolean;
}

export interface NewAnnouncementInput {
  workspace: MsgSource;
  title: string;
  body: string;
  audience: Audience;
  pinDays: number | null;
  requireAck: boolean;
  scheduleAt: string | null;
  clientOpId: string;
}

export interface AnnouncementAccess {
  canPublish: boolean;
  audiences: Audience[];
}
