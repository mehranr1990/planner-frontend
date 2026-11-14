import type {
  ActionItem,
  AgendaItem,
  Announcement,
  AnnouncementAccess,
  AnnouncementReminder,
  Attachment,
  ChannelPolicy,
  ConversationAccess,
  ConversationDetail,
  ConversationInvitation,
  ConversationSummary,
  ConversationTab,
  Decision,
  ForwardTarget,
  LookupResult,
  MeetingDetail,
  MeetingSummary,
  MeetingInvitation,
  MeetingTab,
  Message,
  MessagePage,
  MessagingEvent,
  MessagingNotice,
  MessagingSettings,
  Minutes,
  MsgPerson,
  MsgSource,
  MsgSourceKind,
  NewAnnouncementInput,
  NewChannelInput,
  NewConversationInput,
  NewMeetingInput,
  Participant,
  ReportReason,
  Rsvp,
  SearchFilters,
  SearchHit,
  SendInput,
} from "./messaging-domain";

/*
 * Messages & Meetings repositories (spec names: conversationRepo, messageRepo,
 * receiptRepo/presenceRepo (folded into reads), searchRepo, channelRepo,
 * messageSettingsRepo, blockRepo, muteRepo, reportRepo, meetingRepo,
 * minutesRepo, announcementRepo). Every call acts as ONE signed-in user; the
 * implementation enforces permissions and visibility, the UI only renders
 * what it gets. Commands carry idempotent client op ids where they create.
 */

export class MessagingError extends Error {
  constructor(
    readonly code:
      | "not-found"
      | "forbidden"
      | "window-expired"
      | "policy"
      | "blocked"
      | "removed"
      | "too-large"
      | "too-long"
      | "invalid"
      | "unavailable",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "MessagingError";
  }
}

export interface ConversationRepository {
  list(tab: ConversationTab): Promise<ConversationSummary[]>;
  /** Detail when the actor is a current member; "removed" / "not-found" otherwise (no data). */
  get(id: string): Promise<ConversationDetail | { access: Exclude<ConversationAccess, "member"> }>;
  participants(id: string): Promise<Participant[]>;
  create(input: NewConversationInput): Promise<string>;
  lookup(query: string): Promise<LookupResult>;
  markRead(id: string): Promise<void>;
  mute(id: string, muted: boolean): Promise<void>;
  leave(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  addPeople(id: string, personIds: string[]): Promise<void>;
  removePerson(id: string, personId: string): Promise<void>;
  updateSettings(id: string, patch: { linkPreviews?: boolean; newcomerHistory?: "from-join" | "full"; collapseBlocked?: boolean }): Promise<void>;
  updatePolicy(id: string, patch: Partial<Pick<ChannelPolicy, "authorDeleteForEveryone" | "newcomerHistory" | "membersCanPin">>): Promise<void>;
  report(id: string, reason: ReportReason): Promise<void>;
  /** Total unread, unmuted conversations (header badge). */
  unreadCount(): Promise<number>;
  /** Unread mentions in a workspace's channels (rail badge). */
  workspaceMentions(workspaceId: string): Promise<number>;
  /** Pending invitations addressed to me (expired / revoked ones are not served). */
  invitations(): Promise<ConversationInvitation[]>;
  /** Accept (joins; resolves the conversation id) or decline; a stale / revoked invitation rejects. */
  respondInvitation(invitation: ConversationInvitation, accept: boolean): Promise<string>;
  /** Messaging notices for the bell (newest first). */
  notices(): Promise<MessagingNotice[]>;
  readNotice(notice: MessagingNotice): Promise<void>;
}

export interface MessageRepository {
  page(conversationId: string): Promise<MessagePage>;
  thread(conversationId: string, parentId: string): Promise<{ parent: Message; replies: Message[] }>;
  send(conversationId: string, input: SendInput): Promise<Message>;
  edit(messageId: string, body: string): Promise<Message>;
  deleteForEveryone(messageId: string): Promise<void>;
  deleteForMe(messageId: string): Promise<void>;
  moderate(messageId: string): Promise<void>;
  react(messageId: string, emoji: string): Promise<void>;
  pin(messageId: string, pinned: boolean): Promise<void>;
  pinned(conversationId: string): Promise<Message[]>;
  media(conversationId: string): Promise<{ message: Message; attachment: Attachment }[]>;
  forwardTargets(messageId: string): Promise<ForwardTarget[]>;
  forward(messageId: string, targetId: string, clientOpId: string): Promise<void>;
  report(messageId: string, reason: ReportReason): Promise<void>;
  search(query: string, filters: SearchFilters): Promise<SearchHit[]>;
  /** Mock upload with progress (0..1); enforces server limits. */
  upload(file: { name: string; bytes: number; mime: string; kind: Attachment["kind"]; durationSec?: number; url?: string }, onProgress?: (p: number) => void): Promise<Attachment>;
}

export interface ChannelRepository {
  list(workspaceId: string): Promise<ConversationSummary[]>;
  create(input: NewChannelInput): Promise<string>;
  /** Workspace defaults and whether the actor may create channels there. */
  workspace(workspaceId: string): Promise<{ source: MsgSource; canCreate: boolean; defaults: ChannelPolicy; members: MsgPerson[] } | null>;
}

export interface MessagingSettingsRepository {
  get(): Promise<MessagingSettings>;
  set(patch: Partial<MessagingSettings>): Promise<MessagingSettings>;
  blocked(): Promise<MsgPerson[]>;
  block(personId: string): Promise<void>;
  unblock(personId: string): Promise<void>;
}

export interface MeetingRepository {
  list(tab: MeetingTab): Promise<MeetingSummary[]>;
  /** Meetings shown in a source calendar between two instants (busy-only for non-invitees when allowed). */
  forCalendar(source: MsgSource, from: string, to: string): Promise<(MeetingSummary & { busyOnly: boolean })[]>;
  get(id: string): Promise<MeetingDetail | null>;
  /** OD-15: pending invitations not yet in `list` (live; the mock lists invited meetings directly → none). */
  invitations(): Promise<MeetingInvitation[]>;
  create(input: NewMeetingInput): Promise<string>;
  update(id: string, patch: Partial<Pick<MeetingDetail, "title" | "start" | "end" | "link" | "description">>): Promise<void>;
  rsvp(id: string, rsvp: Exclude<Rsvp, "none">): Promise<void>;
  addAgenda(id: string, title: string, minutes: number): Promise<void>;
  toggleAgenda(id: string, itemId: string): Promise<void>;
  /** OD-16: propose an agenda entry (text); the organiser accepts or rejects it. */
  proposeAgenda(id: string, text: string): Promise<void>;
  decideAgenda(id: string, itemId: string, accept: boolean): Promise<void>;
  saveNotes(id: string, notes: string): Promise<void>;
  /** `blob`: the picked file (live uploads its bytes; the mock keeps name + size only). */
  attach(id: string, file: { name: string; bytes: number; linked: boolean; blob?: Blob }): Promise<void>;
  /** The private bytes of a READY file, authorised by the server (no storage URL is exposed). */
  download(id: string, fileId: string): Promise<{ blob: Blob; name: string }>;
  /** People the actor may invite for a source. */
  invitable(source: MsgSource): Promise<MsgPerson[]>;
  /** Sources the actor may create meetings in. */
  sources(): Promise<MsgSource[]>;
}

export interface MinutesRepository {
  get(meetingId: string): Promise<Minutes | null>;
  save(meetingId: string, patch: { summary?: string; decisions?: Decision[]; actionItems?: ActionItem[] }): Promise<void>;
  submit(meetingId: string, reviewerIds: string[]): Promise<void>;
  /** `comment`: the review reason (the live API requires one). */
  approve(meetingId: string, comment?: string): Promise<void>;
  requestChanges(meetingId: string, comment: string): Promise<void>;
  finalize(meetingId: string): Promise<void>;
  /** Pulls the in-review / approved version back to Draft (`can.withdraw`); never a final version. */
  withdraw(meetingId: string): Promise<void>;
  /** Records the task the caller created in the source workspace (explicit "Make task" only). */
  linkTask(meetingId: string, itemId: string, task: NonNullable<ActionItem["task"]>): Promise<void>;
}

export interface AnnouncementRepository {
  /** `kind`: the workspace kind (live reads `/announcements/scopes/{kind}/{scopeId}`). */
  list(workspaceId: string, kind?: MsgSourceKind): Promise<Announcement[]>;
  access(workspaceId: string, kind?: MsgSourceKind): Promise<AnnouncementAccess>;
  publish(input: NewAnnouncementInput): Promise<string>;
  ack(id: string): Promise<void>;
  remind(id: string): Promise<void>;
  /** "Please read" reminders addressed to me (bell). */
  reminders(): Promise<AnnouncementReminder[]>;
  readReminder(id: string): Promise<void>;
}

export interface MessagingRepository {
  me: MsgPerson;
  conversations: ConversationRepository;
  messages: MessageRepository;
  channels: ChannelRepository;
  settings: MessagingSettingsRepository;
  meetings: MeetingRepository;
  minutes: MinutesRepository;
  announcements: AnnouncementRepository;
  /** Simulated live stream (mock only). Returns the unsubscribe function. */
  subscribe(listener: (event: MessagingEvent) => void): () => void;
}

export type { AgendaItem, Message, Rsvp };
