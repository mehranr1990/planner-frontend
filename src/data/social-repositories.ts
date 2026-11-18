import type { FileLibrary, ProjectFile } from "./project-domain";
import type { FileUploadInput } from "./project-repositories";
import type {
  ActivityDetail,
  ActivityFilter,
  ActivitySummary,
  ActivityTemplate,
  Album,
  BalanceBetween,
  CalendarProjection,
  Challenge,
  Circle,
  Connection,
  ConnectionRequest,
  ExpenseScope,
  FreeBusyView,
  GroupAccess,
  GroupEvent,
  GroupInvite,
  GroupPreview,
  GroupSettings,
  GroupStatus,
  GroupTopic,
  IssueKind,
  JoinRequest,
  LeaveChecklist,
  Loan,
  LostFoundPost,
  NeedsYouItem,
  Photo,
  Poll,
  RequestPrivacy,
  Rsvp,
  ScopeBalance,
  ScopeOption,
  Settlement,
  SharedExpense,
  SocialCurrency,
  SocialDirectory,
  SocialRole,
  SplitSpec,
  Thing,
  ThingCategory,
  Vote,
  BlockedEntry,
  GroupInviteLink,
  InvitationPreview,
  HandoverInfo,
  NewPollInput,
  FinancePostingPreview,
  LoanAction,
  EvidenceKind,
  EvidenceNote,
  RecordHistoryRow,
  LostFoundClaim,
  ClaimAction,
  GoalEntry,
  NewGoalInput,
  SocialNotice,
  ExitCheck,
  GroupLifecycle,
  SocialPerson,
} from "./social-domain";

/*
 * Social repositories (design/social SPEC "Data & backend" tabs). Mock Mode:
 * the typed mock (mock/mock-social.ts); live mode: the Phase 6 API adapters
 * (api/api-social-*.ts), never a mock fallback. The names mirror the spec (connectionRepo, socialGroupRepo, activityRepo,
 * pollRepo, freeBusyRepo, sharedExpenseRepo, balanceRepo, settlementRepo,
 * lendingRepo, lostFoundRepo, albumRepo, challengeRepo, socialInboxRepo) so
 * both implementations stay interchangeable. Failures throw
 * SocialError; the server decides every permission.
 */

export type SocialErrorCode = "forbidden" | "not-found" | "invalid" | "conflict" | "rate-limited" | "too-large" | "unsupported";

export class SocialError extends Error {
  constructor(
    readonly code: SocialErrorCode,
    message: string = code,
    /** The server's stable reason code (e.g. LAST_ORGANIZER); the UI picks copy, never shows server text. */
    readonly reason: string | null = null,
    /** 429: seconds until a retry may succeed (Retry-After). */
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "SocialError";
  }
}

export interface ConnectionRepo {
  list(): Promise<Connection[]>;
  requests(): Promise<ConnectionRequest[]>;
  /** Same answer whether or not an account exists (privacy-preserving lookup). */
  request(contact: string, note: string): Promise<{ sent: true }>;
  accept(requestId: string): Promise<void>;
  /** Silent; resending is blocked for 30 days (S2). */
  ignore(requestId: string): Promise<void>;
  cancel(requestId: string): Promise<void>;
  remove(personId: string): Promise<void>;
  block(personId: string): Promise<void>;
  privacy(): Promise<RequestPrivacy>;
  setPrivacy(value: RequestPrivacy): Promise<void>;
}

export interface CircleRepo {
  list(): Promise<Circle[]>;
  create(name: string): Promise<Circle>;
  rename(circleId: string, name: string): Promise<void>;
  remove(circleId: string): Promise<void>;
  setMembership(circleId: string, personId: string, member: boolean): Promise<void>;
}

export interface NewGroupInput {
  name: string;
  description: string;
  topic: GroupTopic;
  currency: SocialCurrency;
  visibility: "private" | "discoverable";
  inviteIds: string[];
  clientOpId: string;
}

export interface SocialGroupRepo {
  directory(): Promise<SocialDirectory>;
  access(groupId: string): Promise<GroupAccess>;
  /** Discoverable groups only (never private ones), topic + text filter. */
  discover(query: string, topic: GroupTopic | "all"): Promise<GroupPreview[]>;
  requestJoin(groupId: string, note: string): Promise<void>;
  cancelJoin(groupId: string): Promise<void>;
  joinRequests(groupId: string): Promise<JoinRequest[]>;
  decide(requestId: string, approve: boolean): Promise<void>;
  create(input: NewGroupInput): Promise<string>;
  events(groupId: string): Promise<GroupEvent[]>;
  invites(groupId: string): Promise<GroupInvite[]>;
  invite(groupId: string, personIds: string[]): Promise<void>;
  cancelInvite(groupId: string, inviteId: string): Promise<void>;
  resendInvite(groupId: string, inviteId: string): Promise<void>;
  setRole(groupId: string, personId: string, role: Exclude<SocialRole, "owner">): Promise<void>;
  removeMember(groupId: string, personId: string): Promise<void>;
  /** Successor must accept (S10); the mock accepts for them. */
  transferOwnership(groupId: string, personId: string): Promise<void>;
  updateSettings(groupId: string, patch: Partial<GroupSettings> & { name?: string; description?: string; rules?: string; currency?: SocialCurrency }): Promise<void>;
  setMyStatus(groupId: string, status: GroupStatus | null): Promise<void>;
  leaveChecklist(groupId: string): Promise<LeaveChecklist>;
  leave(groupId: string, removeMyPhotos: boolean): Promise<void>;
  deleteGroup(groupId: string): Promise<void>;
  /** The group's conversation in Messages (Phase 5 engine): member ids for it. */
  chatMembers(groupId: string): Promise<{ name: string; personIds: string[] }>;
  /**
   * Live only (ADR 0067): the group's primary Messages conversation. An Owner/Admin
   * opens it once; every current member joins it explicitly (history starts at join).
   * Resolves to the conversation id. Absent in mock mode (mock uses chatMembers).
   */
  openChat?(groupId: string): Promise<string>;
}

export interface NewActivityInput {
  title: string;
  template: ActivityTemplate;
  groupId: string | null;
  startDay: string;
  endDay: string;
  startTime: string | null;
  place: string;
  capacity: number | null;
  recurringWeekly: boolean;
  /** Independent activities only (groups have one currency). */
  currency: SocialCurrency;
  guestIds: string[];
  withPoll: boolean;
  clientOpId: string;
}

export interface ActivityRepo {
  mine(filter: ActivityFilter, groupId?: string): Promise<ActivitySummary[]>;
  get(activityId: string): Promise<ActivityDetail>;
  create(input: NewActivityInput): Promise<string>;
  rsvp(activityId: string, rsvp: Exclude<Rsvp, "pending">): Promise<{ waitlisted: boolean }>;
  joinWaitlist(activityId: string): Promise<void>;
  leaveWaitlist(activityId: string): Promise<void>;
  acceptOffer(activityId: string): Promise<void>;
  cancel(activityId: string, reason: string): Promise<void>;
  addItineraryItem(activityId: string, day: string, item: { time: string | null; title: string; place: string; note: string }): Promise<void>;
  setCalendarBlock(activityId: string, on: boolean): Promise<void>;
  projections(from: string, to: string): Promise<CalendarProjection[]>;
}

export interface ActivityChecklistRepo {
  add(activityId: string, title: string): Promise<void>;
  toggle(activityId: string, itemId: string): Promise<void>;
  claim(activityId: string, itemId: string): Promise<void>;
  /** Links the item to the Personal task the caller created (idempotent). */
  linkTask(activityId: string, itemId: string, taskId: string): Promise<void>;
  /** Live API: the server creates the caller's Personal task once (idempotent); when present the UI must use it instead of linkTask. */
  makeTask?(activityId: string, itemId: string): Promise<{ taskId: string; created: boolean }>;
}

/** Activity files through the PJ-10 Files component (one folder level, versions, scan before download). */
export interface ActivityFilesRepo {
  list(activityId: string): Promise<FileLibrary>;
  upload(activityId: string, input: FileUploadInput): Promise<ProjectFile>;
  cancel(activityId: string, fileId: string): Promise<void>;
  retry(activityId: string, fileId: string): Promise<ProjectFile>;
  restoreVersion(activityId: string, fileId: string, version: number): Promise<ProjectFile>;
  download(activityId: string, fileId: string): Promise<Blob>;
}

export interface PollRepo {
  get(pollId: string): Promise<Poll>;
  vote(pollId: string, votes: Record<string, Vote>): Promise<void>;
  close(pollId: string): Promise<void>;
  pickFinal(pollId: string, optionId: string): Promise<void>;
}

export interface FreeBusyRepo {
  range(activityId: string): Promise<FreeBusyView>;
  request(activityId: string, personId: string): Promise<void>;
  /** Shares free/busy only (never titles), for this activity. */
  share(activityId: string, share: boolean): Promise<void>;
}

export interface NewExpenseInput {
  scope: ExpenseScope;
  activityId: string | null;
  title: string;
  amount: number;
  payerId: string;
  day: string;
  split: SplitSpec;
  receipt: { name: string; bytes: number } | null;
  clientOpId: string;
}

export interface SharedExpenseRepo {
  scopes(groupId: string): Promise<ScopeOption[]>;
  list(scope: ExpenseScope): Promise<SharedExpense[]>;
  get(expenseId: string): Promise<SharedExpense>;
  participants(scope: ExpenseScope): Promise<{ id: string; name: string; initials: string }[]>;
  propose(input: NewExpenseInput): Promise<string>;
  approve(expenseId: string): Promise<void>;
  /** Edit & approve keeps a revision. */
  editAndApprove(expenseId: string, patch: Pick<NewExpenseInput, "title" | "amount" | "payerId" | "day" | "split">): Promise<void>;
  reject(expenseId: string, reason: string): Promise<void>;
  /** Editing an approved item creates "Edit pending"; the approved version keeps counting. */
  revise(expenseId: string, patch: Pick<NewExpenseInput, "title" | "amount" | "payerId" | "day" | "split">, note: string): Promise<void>;
  decideEdit(expenseId: string, approve: boolean): Promise<void>;
  /** Idempotent opt-in: true the first time for this key, false after. */
  claimFinancePosting(key: string): Promise<boolean>;
  releaseFinancePosting(key: string): Promise<void>;
}

export interface BalanceRepo {
  forScope(scope: ExpenseScope): Promise<ScopeBalance>;
  mine(groupId: string): Promise<ScopeBalance>;
  mineAll(): Promise<ScopeBalance[]>;
  between(personId: string): Promise<BalanceBetween[]>;
}

export interface SettlementRepo {
  list(scope: ExpenseScope | null): Promise<Settlement[]>;
  /** An acknowledgement record only — the app never moves money. */
  record(input: { scope: ExpenseScope; fromId: string; toId: string; amount: number; note: string; clientOpId: string }): Promise<string>;
  confirm(settlementId: string): Promise<void>;
  dispute(settlementId: string, note: string): Promise<void>;
  /** Payer only, before confirmation. */
  cancel(settlementId: string): Promise<void>;
}

export interface LendingRepo {
  groupThings(groupId: string): Promise<Thing[]>;
  mine(): Promise<Thing[]>;
  loans(groupId: string | null): Promise<Loan[]>;
  addThing(input: { name: string; category: ThingCategory; condition: string; notes: string; groupId: string | null }): Promise<string>;
  share(thingId: string, groupId: string, shared: boolean): Promise<void>;
  request(thingId: string, from: string, due: string, place: string): Promise<string>;
  /** Lend directly to a connection (SO-18). */
  lendTo(thingId: string, personId: string, due: string, place: string): Promise<string>;
  accept(loanId: string, accept: boolean): Promise<void>;
  /** Record or confirm the current step (handover / return), whichever is due for the viewer. */
  step(loanId: string): Promise<void>;
  reportIssue(loanId: string, kind: IssueKind, note: string): Promise<void>;
  resolveIssue(loanId: string, issueId: string): Promise<void>;
}

export interface LostFoundRepo {
  list(groupId: string | null): Promise<LostFoundPost[]>;
  post(groupId: string, kind: "missing" | "found", title: string, note: string): Promise<void>;
  /** Live API: a claim needs a note (1–2000 characters, no evidence files). */
  claim(postId: string, note?: string): Promise<void>;
  /** Resolved only after both sides confirm. */
  confirm(postId: string): Promise<void>;
}

export interface AlbumRepo {
  list(groupId: string): Promise<Album[]>;
  photos(albumId: string): Promise<Photo[]>;
  create(groupId: string, title: string): Promise<string>;
  /** Rejects originals over 20 MB; display copies carry no location. */
  upload(albumId: string, file: { name: string; bytes: number; url: string | null }, onProgress?: (p: number) => void): Promise<Photo>;
  remove(photoId: string): Promise<void>;
}

export interface ChallengeRepo {
  list(groupId: string): Promise<Challenge[]>;
  join(challengeId: string): Promise<void>;
  leave(challengeId: string): Promise<void>;
  /** Numbers entered here only; never pulled from Personal. */
  log(challengeId: string, amount: number, day: string): Promise<void>;
  create(groupId: string, input: { title: string; unit: string; target: number; endDay: string }): Promise<string>;
  setIndividualTotals(challengeId: string, on: boolean): Promise<void>;
}

export interface SocialInboxRepo {
  list(): Promise<NeedsYouItem[]>;
}

// ── Live-contract flows (Phase 6 server). Mock Mode answers "unsupported". ─

export interface BlockRepo {
  list(): Promise<BlockedEntry[]>;
  unblock(blockId: string): Promise<void>;
}

export interface GroupInvitationRepo {
  /** Sends membership invitations; each returns a private link to hand to the person (proof in the URL fragment). */
  send(groupId: string, personIds: string[]): Promise<GroupInviteLink[]>;
  preview(invitationId: string, proof: string): Promise<InvitationPreview>;
  /** `revision` = the invitation revision issued together with this proof (both travel in the link fragment). */
  respond(invitationId: string, proof: string, revision: number, accept: boolean): Promise<{ groupId: string | null }>;
}

export interface HandoverRepo {
  /** Starts an ownership handover; returns the link the successor opens. */
  start(groupId: string, personId: string): Promise<{ handoverId: string; href: string }>;
  get(groupId: string, handoverId: string): Promise<HandoverInfo>;
  /** Accept needs the successor's password (fresh reauthentication); never stored. */
  respond(groupId: string, handoverId: string, action: "accept" | "decline" | "revoke", password?: string): Promise<void>;
}

export interface ActivityAdminRepo {
  edit(activityId: string, patch: { title?: string; place?: string; description?: string; startDay?: string; endDay?: string; startTime?: string | null; capacity?: number | null }): Promise<void>;
  close(activityId: string): Promise<void>;
  remove(activityId: string): Promise<void>;
  restore(activityId: string): Promise<void>;
  join(activityId: string): Promise<void>;
  leave(activityId: string): Promise<void>;
  invite(activityId: string, personId: string): Promise<void>;
  removeParticipant(activityId: string, personId: string): Promise<void>;
  setOrganiser(activityId: string, personId: string, organiser: boolean): Promise<void>;
  nominate(activityId: string, personId: string): Promise<void>;
  respondSuccession(activityId: string, action: "accept" | "decline" | "cancel"): Promise<void>;
  setReminder(activityId: string, minutesBefore: number | null): Promise<void>;
  deleteItem(activityId: string, itemId: string): Promise<void>;
  createPoll(activityId: string, input: NewPollInput): Promise<string>;
  /** Organiser: creates the activity's private conversation (needs the CONVERSATION retention policy). */
  openConversation(activityId: string): Promise<void>;
  /** Participant: joins it in Messages; returns the conversation id. */
  joinConversation(activityId: string): Promise<string>;
  /** People the viewer may invite (accepted connections). */
  invitable(activityId: string): Promise<SocialPerson[]>;
}

export interface ExpenseFinanceRepo {
  /** No write: what posting my share would record in Personal Finance. */
  preview(expenseId: string, accountId: string): Promise<FinancePostingPreview>;
  /** Explicit confirmation only; repeats return created=false. */
  post(expenseId: string, accountId: string, revisionId: string): Promise<{ created: boolean }>;
  accounts(): Promise<{ id: string; name: string; currency: string }[]>;
}

export interface LendingServerRepo {
  act(loanId: string, action: LoanAction, note: string): Promise<void>;
  proposeDue(loanId: string, due: string, note: string): Promise<void>;
  loanEvidence(loanId: string): Promise<EvidenceNote[]>;
  addLoanEvidence(loanId: string, input: { kind: EvidenceKind; label: string; note: string }): Promise<void>;
  loanHistory(loanId: string): Promise<RecordHistoryRow[]>;
  archiveThing(thingId: string): Promise<void>;
  claims(postId: string): Promise<LostFoundClaim[]>;
  claimAct(postId: string, claimId: string, action: ClaimAction, note: string): Promise<void>;
  postAct(postId: string, action: "withdraw" | "hide" | "unhide"): Promise<void>;
  matches(postId: string): Promise<LostFoundPost[]>;
  postConnections(kind: "missing" | "found", title: string, note: string): Promise<void>;
}

export interface GoalRepo {
  listFor(context: { groupId: string } | { activityId: string }): Promise<Challenge[]>;
  create(input: NewGoalInput): Promise<string>;
  entries(goalId: string): Promise<GoalEntry[]>;
  review(goalId: string, entryId: string, action: "approve" | "reject" | "retract", note: string): Promise<void>;
  correct(goalId: string, participantId: string, delta: number, reason: string): Promise<void>;
  end(goalId: string, action: "close" | "cancel"): Promise<void>;
  history(goalId: string): Promise<RecordHistoryRow[]>;
}

export interface NoticeRepo {
  list(): Promise<SocialNotice[]>;
  read(noticeId: string): Promise<void>;
}

export interface GroupExitRepo {
  check(groupId: string): Promise<ExitCheck>;
  /** `confirmation` = the exit-check departureConfirmation, sent only on the explicit second confirmation. */
  leave(groupId: string, confirmation: string | null): Promise<void>;
  /** Primary owner; password re-entry, never stored. */
  deleteGroup(groupId: string, password: string, confirmation: string | null): Promise<void>;
  lifecycle(groupId: string): Promise<GroupLifecycle>;
  /** Recovery proof → recover, inside one call; the proof never leaves this call. */
  recover(groupId: string, password: string): Promise<void>;
  /** Own balance and settlements in a ledger the viewer can no longer open (post-exit obligations). */
  ownObligations(groupId: string): Promise<ScopeBalance | null>;
}

export interface SocialRepository {
  connections: ConnectionRepo;
  circles: CircleRepo;
  groups: SocialGroupRepo;
  activities: ActivityRepo;
  checklist: ActivityChecklistRepo;
  files: ActivityFilesRepo;
  polls: PollRepo;
  freeBusy: FreeBusyRepo;
  expenses: SharedExpenseRepo;
  balances: BalanceRepo;
  settlements: SettlementRepo;
  lending: LendingRepo;
  lostFound: LostFoundRepo;
  albums: AlbumRepo;
  challenges: ChallengeRepo;
  inbox: SocialInboxRepo;
  blocks: BlockRepo;
  invitations: GroupInvitationRepo;
  handovers: HandoverRepo;
  activityAdmin: ActivityAdminRepo;
  finance: ExpenseFinanceRepo;
  lendingServer: LendingServerRepo;
  goals: GoalRepo;
  notices: NoticeRepo;
  exit: GroupExitRepo;
}
