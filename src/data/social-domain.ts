import type { ManualStatus } from "@/components/context/presence-dot";
import type { Share, SplitMethod, SplitSpec, Transfer } from "./social-money";

/*
 * Social (Phase 6) domain. Backend Phase 6 is not built: the typed mock
 * "server" (mock/mock-social.ts) decides every permission and visibility
 * rule for the signed-in person, so the UI never guesses (design/social
 * README rules 2–6, DECISIONS S1–S10). Amounts are integers in the scope
 * currency's minor unit; days are "YYYY-MM-DD" (Gregorian transport, Jalali
 * display); instants are ISO strings.
 */

export type SocialCurrency = "toman" | "try" | "eur";

/** Minor-unit digits per currency (Toman has none). */
export const CURRENCY_DECIMALS: Record<SocialCurrency, number> = { toman: 0, try: 2, eur: 2 };

export type SocialRole = "owner" | "admin" | "member";

export interface SocialPerson {
  id: string;
  name: string;
  initials: string;
}

// ── Connections & circles (SO-02) ───────────────────────────────────────

export interface Circle {
  id: string;
  name: string;
}

export interface Connection {
  person: SocialPerson;
  since: string;
  /** Private labels only the viewer sees. */
  circleIds: string[];
  /** Groups both belong to (only groups the viewer is in); null = not served (live API). */
  sharedGroups: { id: string; name: string }[] | null;
}

export interface ConnectionRequest {
  id: string;
  person: SocialPerson;
  direction: "incoming" | "outgoing";
  note: string;
  at: string;
  /** Groups in common (incoming only); null = not served. */
  mutualGroups: number | null;
}

export type RequestPrivacy = "everyone" | "groups" | "nobody";

/** Between two people: net of approved shared expenses, per currency (never summed). */
export interface BalanceBetween {
  currency: SocialCurrency;
  /** Positive = they owe you. */
  net: number;
}

// ── Groups (SO-03 / SO-04 / SO-14 / SO-19) ──────────────────────────────

export type GroupVisibility = "private" | "discoverable";
export type GroupTopic = "outdoors" | "sport" | "family" | "food" | "travel" | "books" | "other";

export interface GroupSettings {
  visibility: GroupVisibility;
  /** Who may invite: admins only, or members too. */
  invites: "admins" | "members";
  /** Invite links still need admin approval. */
  linkNeedsApproval: boolean;
  /** S4: approvers = owner/admins (+ the activity organiser). */
  approvers: "admins" | "admins-organiser";
  /** S5: members see everyone's balances. */
  membersSeeBalances: boolean;
  /** Original photos downloadable by uploader + admins only. */
  originalsUploaderOnly: boolean;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  /** null = not served by the API. */
  topic: GroupTopic | null;
  /** One currency per group; null = not served (no shared expenses in the API yet). */
  currency: SocialCurrency | null;
  memberCount: number | null;
  /** null = the API exposes no caller membership / role for a group. */
  myRole: SocialRole | null;
  visibility: GroupVisibility;
  unread: number;
  pendingRequests: number;
  initials: string;
}

export interface GroupStatus {
  /** Social has no "Off today". */
  status: Exclude<ManualStatus, "off">;
  note: string;
  /** ISO instant when the status clears; null = until changed. */
  clearsAt: string | null;
}

export interface GroupMember {
  person: SocialPerson;
  role: SocialRole | null;
  joinedAt: string | null;
  /** Opt-in, per group, set by the person; never derived. */
  status: GroupStatus | null;
  isSelf: boolean;
}

export interface GroupDetail extends GroupSummary {
  rules: string;
  settings: GroupSettings;
  /** Locked after the first approved expense. */
  currencyLocked: boolean;
  members: GroupMember[];
  createdAt: string;
  capabilities: GroupCapabilities;
}

export interface GroupCapabilities {
  createActivity: boolean;
  invite: boolean;
  decideJoins: boolean;
  changeRoles: boolean;
  removeMembers: boolean;
  editSettings: boolean;
  makeDiscoverable: boolean;
  approveExpenses: boolean;
  seeAllBalances: boolean;
  deleteGroup: boolean;
  transferOwnership: boolean;
}

/** Discover preview: never member names or content. */
export interface GroupPreview {
  id: string;
  name: string;
  description: string;
  topic: GroupTopic | null;
  size: number | null;
  rules: string;
  requested: boolean;
}

export interface JoinRequest {
  id: string;
  groupId: string;
  person: SocialPerson;
  note: string;
  at: string | null;
}

export interface GroupInvite {
  id: string;
  label: string;
  invitedBy: SocialPerson;
  at: string;
}

/** SO-01 access answer for /social/groups/[id]. */
export type GroupAccess =
  | { kind: "member"; group: GroupDetail }
  | { kind: "join-requested"; preview: GroupPreview }
  | { kind: "guest"; groupName: string; activityIds: string[] }
  | { kind: "left"; groupName: string; openBalance: boolean }
  | { kind: "not-available" };

export type GroupEventKind = "joined" | "activity" | "expense-approved" | "settled" | "photos" | "lent" | "left";

export interface GroupEvent {
  id: string;
  kind: GroupEventKind;
  actor: SocialPerson;
  /** Data (names, titles), already user content. */
  subject: string;
  at: string;
}

export interface LeaveChecklist {
  openBalance: { currency: SocialCurrency; net: number } | null;
  thingsHeld: { id: string; name: string }[];
  myPhotos: number;
  isOwner: boolean;
  /** The group can be deleted (owner): balances settled or acknowledged. */
  canDelete: boolean;
}

// ── Activities (SO-05 / SO-16) ──────────────────────────────────────────

export type ActivityTemplate = "trip" | "sport" | "gathering" | "family" | "blank";
export type Rsvp = "going" | "maybe" | "declined" | "pending";

export interface ItineraryItem {
  id: string;
  time: string | null;
  title: string;
  place: string;
  note: string;
}

export interface ItineraryDay {
  day: string;
  items: ItineraryItem[];
}

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
  assignee: SocialPerson | null;
  /** Became a Personal task (owner's own task engine). */
  taskId: string | null;
}

export interface Attendee {
  person: SocialPerson;
  rsvp: Rsvp;
  /** Activity guest: not a member of the group. */
  guest: boolean;
  organiser: boolean;
}

export interface ActivitySummary {
  id: string;
  title: string;
  template: ActivityTemplate;
  group: { id: string; name: string } | null;
  organiser: SocialPerson;
  startDay: string;
  endDay: string;
  startTime: string | null;
  place: string;
  /** Weekly recurrence (Sport): the next occurrence is startDay. */
  recurringWeekly: boolean;
  capacity: number | null;
  goingCount: number;
  waitlistCount: number;
  myRsvp: Rsvp;
  /** Position on the waitlist (1-based), or null. */
  myWaitlist: number | null;
  status: "planned" | "cancelled";
  currency: SocialCurrency;
  isGuest: boolean;
  organisedByMe: boolean;
  hasOpenPoll: boolean;
}

export interface WaitlistEntry {
  person: SocialPerson;
  /** The spot offer for the first in line (S3: 12 h). */
  offeredUntil: string | null;
}

export interface ActivityFile {
  id: string;
  name: string;
  bytes: number;
  by: SocialPerson;
}

export interface ActivityDetail extends ActivitySummary {
  description: string;
  itinerary: ItineraryDay[];
  checklist: ChecklistItem[];
  attendees: Attendee[];
  waitlist: WaitlistEntry[];
  files: ActivityFile[];
  cancelReason: string | null;
  cancelledBy: SocialPerson | null;
  /** The date poll, if any (Pick final date sets the activity dates). */
  pollId: string | null;
  /** Every poll of the activity: date first, then single / multiple choice (SO-06 “other poll types”). */
  pollIds: string[];
  /** Going/Maybe → Personal calendar projection; the private time block is optional. */
  calendarBlock: boolean;
  capabilities: { edit: boolean; cancel: boolean; rsvp: boolean; uploadFiles: boolean };
}

export interface CalendarProjection {
  activityId: string;
  title: string;
  source: string;
  startDay: string;
  endDay: string;
  startTime: string | null;
  rsvp: "going" | "maybe";
}

export type ActivityFilter = "all" | "needs-answer" | "organised" | "past";

// ── Polls & free/busy (SO-06) ───────────────────────────────────────────

export type PollKind = "date" | "single" | "multiple";
export type Vote = "yes" | "if-needed";

export interface PollOption {
  id: string;
  label: string;
  /** Date polls: the slot. */
  day?: string;
  startTime?: string;
  endTime?: string;
  yes: number;
  ifNeeded: number;
  /** Voter names; empty when anonymous or results are hidden. */
  voters: { person: SocialPerson; vote: Vote }[];
}

export interface Poll {
  id: string;
  activityId: string;
  kind: PollKind;
  question: string;
  options: PollOption[];
  myVotes: Record<string, Vote>;
  deadline: string;
  closed: boolean;
  finalOptionId: string | null;
  anonymous: boolean;
  /** Results visible after voting or after close (setting). */
  resultsVisible: boolean;
  respondents: number;
  invited: number;
  canClose: boolean;
}

export type FreeBusyCell = "free" | "busy" | "not-shared";

export interface FreeBusyRow {
  person: SocialPerson;
  consent: "shared" | "requested" | "declined" | "none";
  /** Per day × slot; "not-shared" (hatched) without consent. Never titles. */
  days: { day: string; slots: FreeBusyCell[] }[];
}

export interface FreeBusyView {
  slots: string[];
  rows: FreeBusyRow[];
  /** Someone asked the viewer to share for this activity. */
  incomingRequest: { from: SocialPerson; range: { from: string; to: string } } | null;
}

// ── Shared expenses & settlements (SO-07 / SO-08 / SO-09 / SO-17) ───────

export type ExpenseScope = { kind: "group" | "activity"; id: string };
export type ExpenseStatus = "proposed" | "approved" | "edit-pending" | "rejected";

export interface ExpenseVersion {
  title: string;
  amount: number;
  payerId: string;
  day: string;
  split: SplitSpec;
  shares: Share[];
  remainder: number;
}

export interface ExpenseRevision {
  at: string;
  by: SocialPerson;
  kind: "proposed" | "approved" | "edited-approved" | "edit-proposed" | "edit-approved" | "edit-rejected" | "rejected" | "adjustment";
  amount: number;
  note: string;
}

export interface SharedExpense {
  id: string;
  scope: ExpenseScope;
  /** The activity the expense belongs to (group expenses may name one). */
  activityId: string | null;
  status: ExpenseStatus;
  /** Approved version when approved / edit pending; else the proposal. */
  current: ExpenseVersion;
  /** Edit pending: the proposed revision (does not count yet). */
  pendingEdit: (ExpenseVersion & { by: SocialPerson; note: string }) | null;
  /** Payer of the current version. */
  payer: SocialPerson;
  proposer: SocialPerson;
  rejectReason: string | null;
  receipt: { name: string; bytes: number } | null;
  revisions: ExpenseRevision[];
  /** Already included in a confirmed settlement (corrections create an adjustment). */
  settled: boolean;
  /** I recorded my share in Personal Finance (idempotent). */
  postedToFinance: boolean;
  myShare: number;
  canApprove: boolean;
  canEdit: boolean;
}

export interface ScopeOption {
  scope: ExpenseScope;
  name: string;
}

export interface ScopeBalance {
  scope: ExpenseScope;
  name: string;
  currency: SocialCurrency;
  /** The viewer left this group: own balance stays visible until settled. */
  left: boolean;
  members: SocialPerson[];
  /** The viewer's own numbers (approved only). */
  mine: { paid: number; share: number; settled: number; net: number };
  /** Transfers involving the viewer (or all, when allowed). */
  transfers: Transfer[];
  /** Everyone's balances: only with the narrow aggregate permission (S5). */
  everyone: { person: SocialPerson; net: number }[] | null;
  counted: number;
  proposedCount: number;
  pendingEditCount: number;
  approvedTotal: number;
}

export type SettlementStatus = "recorded" | "confirmed" | "disputed";

export interface Settlement {
  id: string;
  scope: ExpenseScope;
  scopeName: string;
  currency: SocialCurrency;
  from: SocialPerson;
  to: SocialPerson;
  amount: number;
  note: string;
  recordedBy: SocialPerson;
  status: SettlementStatus;
  disputeNote: string | null;
  at: string;
  confirmedAt: string | null;
  /** The viewer is the other side and must confirm. */
  awaitingMe: boolean;
  postedToFinance: boolean;
}

// ── Lending & lost/found (SO-10 / SO-18) ────────────────────────────────

export type ThingCategory = "outdoor" | "tools" | "books" | "games" | "kitchen" | "other";

export interface Thing {
  id: string;
  name: string;
  category: ThingCategory;
  condition: string;
  notes: string;
  /** Personal thing (owner) or group-owned (keeper holds it). */
  owner: SocialPerson | null;
  group: { id: string; name: string } | null;
  keeper: SocialPerson;
  /** Shared with these groups so members can request it. */
  sharedWith: { id: string; name: string }[];
  activeLoanId: string | null;
  mine: boolean;
}

export type LoanStatus = "requested" | "accepted" | "declined" | "out" | "returned";
export type IssueKind = "lost" | "damaged" | "disputed";

export interface LoanStep {
  recordedAt: string | null;
  confirmedAt: string | null;
}

export interface LoanIssue {
  id: string;
  kind: IssueKind;
  note: string;
  by: SocialPerson;
  at: string;
  /** Resolution needs both sides. */
  resolvedByLender: boolean;
  resolvedByBorrower: boolean;
}

export interface Loan {
  id: string;
  thing: { id: string; name: string; category: ThingCategory };
  group: { id: string; name: string } | null;
  lender: SocialPerson;
  borrower: SocialPerson;
  from: string;
  due: string;
  place: string;
  status: LoanStatus;
  handover: LoanStep;
  return: LoanStep;
  issues: LoanIssue[];
  overdue: boolean;
  /** The viewer's next confirmation, if any. */
  myStep: "accept" | "record-handover" | "confirm-handover" | "record-return" | "confirm-return" | null;
  iAmLender: boolean;
}

export interface LostFoundPost {
  id: string;
  group: { id: string; name: string };
  kind: "missing" | "found";
  title: string;
  note: string;
  by: SocialPerson;
  at: string;
  claim: { by: SocialPerson; at: string } | null;
  confirmedByPoster: boolean;
  confirmedByClaimer: boolean;
  resolved: boolean;
  mine: boolean;
}

// ── Albums & challenges (SO-11 / SO-12) ─────────────────────────────────

export const ALBUM_MAX_BYTES = 20 * 1024 * 1024;

export interface Photo {
  id: string;
  uploader: SocialPerson;
  name: string;
  bytes: number;
  /** Display copy URL (mock: object URL or none → tinted placeholder). */
  url: string | null;
  hue: number;
  at: string;
  /** Display copies never carry location (S8). */
  locationStripped: true;
  canRemove: boolean;
  canDownloadOriginal: boolean;
}

export interface Album {
  id: string;
  groupId: string;
  activity: { id: string; title: string } | null;
  title: string;
  photoCount: number;
  cover: { url: string | null; hue: number } | null;
}

export interface Challenge {
  id: string;
  groupId: string;
  title: string;
  unit: string;
  target: number;
  startDay: string;
  endDay: string;
  total: number;
  participants: number;
  joined: boolean;
  myTotal: number;
  /** Owner setting: individual totals without ranks (S9), A–Z. */
  individualTotals: { person: SocialPerson; total: number }[] | null;
  myEntries: { id: string; day: string; amount: number }[];
}

// ── Home (SO-15) ────────────────────────────────────────────────────────

export type NeedsYouKind = "connection" | "payment" | "overdue" | "poll" | "approve-expense" | "join-request" | "rsvp";

export interface NeedsYouItem {
  id: string;
  kind: NeedsYouKind;
  person: SocialPerson | null;
  subject: string;
  scopeName: string;
  href: string;
  /** Amount + currency for payments / approvals. */
  money: { amount: number; currency: SocialCurrency } | null;
}

export interface SocialDirectory {
  groups: GroupSummary[];
  incomingRequests: number;
  joinRequestsPending: { groupId: string; groupName: string }[];
}

export type { Share, SplitMethod, SplitSpec, Transfer };
