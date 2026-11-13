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
} from "./social-domain";

/*
 * Social repositories (design/social SPEC "Data & backend" tabs). Phase 6
 * backend is not built, so only the typed mock exists (mock/mock-social.ts);
 * the names mirror the spec (connectionRepo, socialGroupRepo, activityRepo,
 * pollRepo, freeBusyRepo, sharedExpenseRepo, balanceRepo, settlementRepo,
 * lendingRepo, lostFoundRepo, albumRepo, challengeRepo, socialInboxRepo) so
 * the API adapter can replace it one module at a time. Failures throw
 * SocialError; the server decides every permission.
 */

export type SocialErrorCode = "forbidden" | "not-found" | "invalid" | "conflict" | "rate-limited" | "too-large" | "unsupported";

export class SocialError extends Error {
  constructor(
    readonly code: SocialErrorCode,
    message: string = code,
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
  claim(postId: string): Promise<void>;
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
}
