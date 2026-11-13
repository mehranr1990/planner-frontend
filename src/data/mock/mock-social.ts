import { SAMPLE_NOW } from "@/fixtures/personal/sample-day";
import { socialHref } from "@/features/social/paths";
import type {
  ActivityDetail,
  ActivitySummary,
  ActivityTemplate,
  Album,
  Challenge,
  ExpenseRevision,
  ExpenseScope,
  ExpenseVersion,
  FreeBusyCell,
  GroupAccess,
  GroupDetail,
  GroupSettings,
  GroupStatus,
  GroupSummary,
  GroupTopic,
  IssueKind,
  ItineraryDay,
  Loan,
  LoanStatus,
  NeedsYouItem,
  Photo,
  PollKind,
  RequestPrivacy,
  Rsvp,
  ScopeBalance,
  Settlement,
  SettlementStatus,
  SharedExpense,
  SocialCurrency,
  SocialPerson,
  SocialRole,
  SplitSpec,
  Thing,
  ThingCategory,
  Vote,
} from "../social-domain";
import { ALBUM_MAX_BYTES } from "../social-domain";
import type { ProjectFile } from "../project-domain";
import { computeBalances, computeSplit, simplifyTransfers } from "../social-money";
import { SocialError, type NewActivityInput, type NewExpenseInput, type SocialRepository } from "../social-repositories";

/*
 * Social mock "server" (Phase 6 backend not built). One in-memory store per
 * instance; the signed-in person is "me". It enforces the rules the UI must
 * never decide alone: private groups never listed, previews without member
 * names, requesters/guests see only what they may, approvals by role,
 * proposed / pending edits never counted, exact integer splits, two-sided
 * loan and settlement confirmations, idempotent Personal Finance claims,
 * 20 MB album originals, voluntary challenges. Person ids match the
 * Messages fixtures so group chat and DMs use the Phase 5 engine.
 */

const ME = "me";

const PEOPLE: Record<string, [string, string]> = {
  me: ["Mehran R.", "MR"],
  nazanin: ["Nazanin A.", "NA"],
  arman: ["Arman M.", "AM"],
  babak: ["Babak H.", "BH"],
  javad: ["Javad K.", "JK"],
  kian: ["Kian F.", "KF"],
  parisa: ["Parisa Z.", "PZ"],
  sara: ["Sara P.", "SP"],
  leila: ["Leila K.", "LK"],
  omid: ["Omid S.", "OS"],
  tara: ["Tara J.", "TJ"],
  darya: ["Darya N.", "DN"],
  jamal: ["Jamal R.", "JR"],
  mom: ["Mom", "M"],
  dad: ["Dad", "D"],
  hamed: ["Hamed T.", "HT"],
  mina: ["Mina S.", "MS"],
  shirin: ["Shirin V.", "SV"],
};

export const socialPersonIds = Object.keys(PEOPLE);

interface MemberRec {
  id: string;
  role: SocialRole;
  joinedAt: string;
  status: GroupStatus | null;
}

interface GroupRec {
  id: string;
  name: string;
  description: string;
  topic: GroupTopic;
  currency: SocialCurrency;
  rules: string;
  createdAt: string;
  members: MemberRec[];
  /** Size shown on previews of groups the viewer is not in. */
  size?: number;
  settings: GroupSettings;
  requests: { id: string; personId: string; note: string; at: string }[];
  invites: { id: string; label: string; byId: string; at: string }[];
  unread: number;
  events: { id: string; kind: GroupEventKindRec; actorId: string; subject: string; at: string }[];
  formerMembers: string[];
  deleted: boolean;
}

type GroupEventKindRec = "joined" | "activity" | "expense-approved" | "settled" | "photos" | "lent" | "left";

interface ActivityRec {
  id: string;
  title: string;
  template: ActivityTemplate;
  groupId: string | null;
  organiserId: string;
  startDay: string;
  endDay: string;
  startTime: string | null;
  place: string;
  description: string;
  capacity: number | null;
  recurringWeekly: boolean;
  status: "planned" | "cancelled";
  cancelReason: string | null;
  cancelledById: string | null;
  currency: SocialCurrency;
  attendees: { id: string; rsvp: Rsvp; guest: boolean }[];
  waitlist: { id: string; offeredUntil: string | null }[];
  itinerary: ItineraryDay[];
  checklist: { id: string; title: string; done: boolean; assigneeId: string | null; taskId: string | null }[];
  files: { id: string; name: string; bytes: number; byId: string; at?: string; versions?: { version: number; byId: string; at: string; restoredFrom?: number }[] }[];
  pollId: string | null;
  calendarBlock: Set<string>;
  clientOpId?: string;
}

interface PollRec {
  id: string;
  activityId: string;
  kind: PollKind;
  question: string;
  options: { id: string; label: string; day?: string; startTime?: string; endTime?: string }[];
  votes: Map<string, Record<string, Vote>>;
  deadline: string;
  closed: boolean;
  finalOptionId: string | null;
  anonymous: boolean;
  resultsAfterVote: boolean;
}

interface VersionRec {
  title: string;
  amount: number;
  payerId: string;
  day: string;
  split: SplitSpec;
}

interface ExpenseRec {
  id: string;
  scope: ExpenseScope;
  activityId: string | null;
  status: "proposed" | "approved" | "rejected";
  current: VersionRec;
  pendingEdit: (VersionRec & { byId: string; note: string }) | null;
  proposerId: string;
  rejectReason: string | null;
  receipt: { name: string; bytes: number } | null;
  revisions: { at: string; byId: string; kind: ExpenseRevision["kind"]; amount: number; note: string }[];
  settled: boolean;
  clientOpId?: string;
}

interface SettlementRec {
  id: string;
  scope: ExpenseScope;
  fromId: string;
  toId: string;
  amount: number;
  note: string;
  recordedById: string;
  status: SettlementStatus;
  disputeNote: string | null;
  at: string;
  confirmedAt: string | null;
  clientOpId?: string;
}

interface ThingRec {
  id: string;
  name: string;
  category: ThingCategory;
  condition: string;
  notes: string;
  ownerId: string | null;
  groupId: string | null;
  keeperId: string;
  sharedWith: string[];
}

interface LoanRec {
  id: string;
  thingId: string;
  lenderId: string;
  borrowerId: string;
  groupId: string | null;
  from: string;
  due: string;
  place: string;
  status: LoanStatus;
  handover: { recordedAt: string | null; confirmedAt: string | null };
  ret: { recordedAt: string | null; confirmedAt: string | null };
  issues: { id: string; kind: IssueKind; note: string; byId: string; at: string; lender: boolean; borrower: boolean }[];
}

interface PostRec {
  id: string;
  groupId: string;
  kind: "missing" | "found";
  title: string;
  note: string;
  byId: string;
  at: string;
  claim: { byId: string; at: string } | null;
  poster: boolean;
  claimer: boolean;
}

interface PhotoRec {
  id: string;
  albumId: string;
  uploaderId: string;
  name: string;
  bytes: number;
  url: string | null;
  hue: number;
  at: string;
}

interface AlbumRec {
  id: string;
  groupId: string;
  activityId: string | null;
  title: string;
}

interface ChallengeRec {
  id: string;
  groupId: string;
  title: string;
  unit: string;
  target: number;
  startDay: string;
  endDay: string;
  participants: Set<string>;
  entries: { id: string; personId: string; day: string; amount: number }[];
  individualTotals: boolean;
}

const DEFAULT_SETTINGS: GroupSettings = {
  visibility: "private",
  invites: "admins",
  linkNeedsApproval: true,
  approvers: "admins-organiser",
  membersSeeBalances: false,
  originalsUploaderOnly: true,
};

const at = (day: string, time = "10:00") => `${day}T${time}:00+03:30`;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const clone = <T>(value: T): T => structuredClone(value);

export interface MockSocialOptions {
  now?: string;
}

export function createMockSocial(options: MockSocialOptions = {}): SocialRepository {
  const nowIso = options.now ?? SAMPLE_NOW;
  const today = nowIso.slice(0, 10);
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${++seq}`;
  const stamp = () => nowIso;

  const person = (id: string): SocialPerson => {
    const [name, initials] = PEOPLE[id] ?? ["Former member", "?"];
    return { id, name, initials };
  };

  // ── Seed ──────────────────────────────────────────────────────────────
  const m = (id: string, role: SocialRole = "member", status: GroupStatus | null = null): MemberRec => ({ id, role, joinedAt: at("2026-03-01"), status });
  const groups = new Map<string, GroupRec>();
  const group = (rec: Omit<GroupRec, "requests" | "invites" | "events" | "formerMembers" | "deleted" | "unread"> & Partial<GroupRec>) =>
    groups.set(rec.id, { requests: [], invites: [], events: [], formerMembers: [], deleted: false, unread: 0, ...rec });

  group({
    id: "mountain",
    name: "Mountain Friends",
    description: "Weekend hikes, ski trips and climbing around Tehran.",
    topic: "outdoors",
    currency: "toman",
    rules: "Be on time. Leave no trace. Share costs fairly.",
    createdAt: at("2025-11-02"),
    members: [
      m("me", "owner", { status: "available", note: "Free this weekend", clearsAt: null }),
      m("nazanin", "admin", { status: "busy", note: "Exams until Thu", clearsAt: at("2026-10-16", "18:00") }),
      m("arman", "member", { status: "available", note: "", clearsAt: null }),
      m("babak", "member", { status: "away", note: "Travelling", clearsAt: null }),
      m("javad", "member", { status: "available", note: "", clearsAt: null }),
      m("kian"),
      m("parisa", "member", { status: "busy", note: "", clearsAt: null }),
      m("sara", "member", { status: "away", note: "", clearsAt: null }),
      m("darya"),
      m("leila"),
      m("omid"),
      m("tara"),
    ],
    settings: { ...DEFAULT_SETTINGS },
    unread: 3,
    requests: [
      { id: "jr-1", personId: "hamed", note: "Friend of Arman, I hike every Friday.", at: at("2026-10-12", "19:20") },
      { id: "jr-2", personId: "mina", note: "", at: at("2026-10-13", "09:05") },
    ],
    invites: [{ id: "inv-1", label: "Shirin V.", byId: "nazanin", at: at("2026-10-10") }],
    events: [
      { id: "ev-1", kind: "expense-approved", actorId: "me", subject: "Cabin · 2 nights", at: at("2026-10-12", "20:10") },
      { id: "ev-2", kind: "activity", actorId: "nazanin", subject: "Night hike · Darakeh", at: at("2026-10-11", "17:40") },
      { id: "ev-3", kind: "photos", actorId: "sara", subject: "Tochal sunrise", at: at("2026-09-27", "21:00") },
      { id: "ev-4", kind: "lent", actorId: "me", subject: "Tent (2-person)", at: at("2026-10-03", "12:00") },
      { id: "ev-5", kind: "joined", actorId: "darya", subject: "", at: at("2026-09-20", "08:30") },
    ],
  });
  group({
    id: "family",
    name: "Family",
    description: "Birthdays, dinners and weekend plans.",
    topic: "family",
    currency: "toman",
    rules: "",
    createdAt: at("2025-06-01"),
    members: [m("dad", "owner"), m("mom", "admin"), m("me", "admin"), m("sara")],
    settings: { ...DEFAULT_SETTINGS, approvers: "admins", membersSeeBalances: true, invites: "members" },
    unread: 1,
  });
  group({
    id: "bookclub",
    name: "Berlin Book Club",
    description: "One book a month, online and in Berlin.",
    topic: "books",
    currency: "eur",
    rules: "Finish the book or come anyway.",
    createdAt: at("2026-01-15"),
    members: [m("leila", "owner"), m("me"), m("tara"), m("omid"), m("shirin"), m("kian")],
    settings: { ...DEFAULT_SETTINGS, visibility: "discoverable" },
  });
  group({
    id: "runners",
    name: "Tehran Runners",
    description: "Easy 10K runs every Sunday morning in Chitgar park.",
    topic: "sport",
    currency: "toman",
    rules: "All paces welcome.",
    createdAt: at("2024-05-01"),
    members: [m("omid", "owner"), m("tara")],
    size: 48,
    settings: { ...DEFAULT_SETTINGS, visibility: "discoverable" },
  });
  group({
    id: "darband",
    name: "Darband Hikers",
    description: "Early hikes up Darband and Shirpala.",
    topic: "outdoors",
    currency: "toman",
    rules: "Bring water and a headlamp.",
    createdAt: at("2023-09-01"),
    members: [m("mina", "owner")],
    size: 64,
    settings: { ...DEFAULT_SETTINGS, visibility: "discoverable" },
    requests: [{ id: "jr-3", personId: "me", note: "I hike Darband most Fridays.", at: at("2026-10-11") }],
  });
  group({
    id: "boardgames",
    name: "Board Game Nights",
    description: "Thursday evenings, strategy and party games.",
    topic: "other",
    currency: "toman",
    rules: "",
    createdAt: at("2025-02-01"),
    members: [m("hamed", "owner")],
    size: 23,
    settings: { ...DEFAULT_SETTINGS, visibility: "discoverable" },
  });
  group({
    id: "supper",
    name: "Secret Supper",
    description: "Private dinners.",
    topic: "food",
    currency: "toman",
    rules: "",
    createdAt: at("2025-02-01"),
    members: [m("shirin", "owner"), m("leila")],
    settings: { ...DEFAULT_SETTINGS },
  });
  group({
    id: "cyclists",
    name: "Weekend Cyclists",
    description: "",
    topic: "sport",
    currency: "toman",
    rules: "",
    createdAt: at("2025-02-01"),
    members: [m("babak", "owner"), m("kian")],
    settings: { ...DEFAULT_SETTINGS },
    formerMembers: ["me"],
  });

  const activities = new Map<string, ActivityRec>();
  const attendees = (list: [string, Rsvp, boolean?][]) => list.map(([id, rsvp, guest]) => ({ id, rsvp, guest: guest ?? false }));
  const activity = (rec: Omit<ActivityRec, "calendarBlock" | "files" | "checklist" | "itinerary" | "waitlist" | "pollId" | "status" | "cancelReason" | "cancelledById" | "description"> & Partial<ActivityRec>) =>
    activities.set(rec.id, { calendarBlock: new Set(), files: [], checklist: [], itinerary: [], waitlist: [], pollId: null, status: "planned", cancelReason: null, cancelledById: null, description: "", ...rec });

  activity({
    id: "alborz",
    title: "Alborz weekend · Dizin",
    template: "trip",
    groupId: "mountain",
    organiserId: "me",
    startDay: "2026-10-22",
    endDay: "2026-10-23",
    startTime: "06:30",
    place: "Dizin",
    description: "Two days of hiking and the first snow at Dizin. Cabin booked for two nights.",
    capacity: 10,
    recurringWeekly: false,
    currency: "toman",
    attendees: attendees([
      ["me", "going"],
      ["nazanin", "going"],
      ["arman", "going"],
      ["babak", "going"],
      ["sara", "going"],
      ["parisa", "going"],
      ["kian", "going"],
      ["jamal", "going", true],
      ["darya", "going"],
      ["javad", "maybe"],
      ["omid", "declined"],
      ["leila", "pending"],
    ]),
    waitlist: [
      { id: "tara", offeredUntil: null },
      { id: "shirin", offeredUntil: null },
    ],
    itinerary: [
      {
        day: "2026-10-22",
        items: [
          { id: "it-1", time: "06:30", title: "Meet at Tajrish square", place: "Tajrish", note: "Two cars" },
          { id: "it-2", time: "09:30", title: "Check in at the cabin", place: "Dizin village", note: "" },
          { id: "it-3", time: "11:00", title: "Hike to the ridge", place: "Dizin north trail", note: "Bring layers" },
        ],
      },
      {
        day: "2026-10-23",
        items: [
          { id: "it-4", time: "08:00", title: "Breakfast at the cabin", place: "", note: "" },
          { id: "it-5", time: "15:00", title: "Drive back", place: "", note: "" },
        ],
      },
    ],
    checklist: [
      { id: "ck-1", title: "Book the cabin", done: true, assigneeId: "me", taskId: null },
      { id: "ck-2", title: "Snow chains for both cars", done: false, assigneeId: "arman", taskId: null },
      { id: "ck-3", title: "Groceries for two breakfasts", done: false, assigneeId: null, taskId: null },
      { id: "ck-4", title: "First-aid kit", done: false, assigneeId: "nazanin", taskId: null },
    ],
    files: [{ id: "f-1", name: "dizin-trail-map.pdf", bytes: 2_400_000, byId: "nazanin" }],
  });
  activities.get("alborz")!.calendarBlock.add("me");
  activity({
    id: "nighthike",
    title: "Night hike · Darakeh",
    template: "gathering",
    groupId: "mountain",
    organiserId: "nazanin",
    startDay: "2026-10-30",
    endDay: "2026-10-30",
    startTime: "18:00",
    place: "Darakeh",
    capacity: null,
    recurringWeekly: false,
    currency: "toman",
    attendees: attendees([
      ["nazanin", "going"],
      ["me", "pending"],
      ["arman", "going"],
      ["sara", "pending"],
      ["kian", "maybe"],
    ]),
    pollId: "poll-night",
  });
  activity({
    id: "climbing",
    title: "Climbing gym",
    template: "sport",
    groupId: "mountain",
    organiserId: "arman",
    startDay: "2026-10-19",
    endDay: "2026-10-19",
    startTime: "19:00",
    place: "Bam climbing gym",
    capacity: 8,
    recurringWeekly: true,
    currency: "toman",
    attendees: attendees([
      ["arman", "going"],
      ["me", "going"],
      ["javad", "going"],
      ["darya", "maybe"],
    ]),
  });
  activity({
    id: "futsal",
    title: "Futsal night",
    template: "sport",
    groupId: "mountain",
    organiserId: "kian",
    startDay: "2026-10-15",
    endDay: "2026-10-15",
    startTime: "21:00",
    place: "Enghelab sports complex",
    capacity: 10,
    recurringWeekly: false,
    currency: "toman",
    attendees: attendees([
      ["kian", "going"],
      ["arman", "going"],
      ["babak", "going"],
      ["javad", "going"],
      ["omid", "going"],
      ["darya", "going"],
      ["tara", "going"],
      ["leila", "going"],
      ["parisa", "going"],
      ["sara", "going"],
      ["me", "pending"],
    ]),
  });
  activity({
    id: "tochal",
    title: "Tochal sunrise",
    template: "trip",
    groupId: "mountain",
    organiserId: "sara",
    startDay: "2026-09-26",
    endDay: "2026-09-26",
    startTime: "04:30",
    place: "Tochal",
    capacity: null,
    recurringWeekly: false,
    currency: "toman",
    attendees: attendees([
      ["sara", "going"],
      ["me", "going"],
      ["nazanin", "going"],
    ]),
    checklist: [{ id: "ck-9", title: "Headlamps", done: true, assigneeId: "sara", taskId: null }],
  });
  activity({
    id: "lar",
    title: "Lar dam picnic",
    template: "gathering",
    groupId: "mountain",
    organiserId: "me",
    startDay: "2026-11-01",
    endDay: "2026-11-01",
    startTime: "08:00",
    place: "Lar dam",
    capacity: null,
    recurringWeekly: false,
    currency: "toman",
    status: "cancelled",
    cancelReason: "Snow on the road.",
    cancelledById: "me",
    attendees: attendees([
      ["me", "going"],
      ["kian", "going"],
    ]),
  });
  activity({
    id: "grandma",
    title: "Grandma’s birthday",
    template: "family",
    groupId: "family",
    organiserId: "mom",
    startDay: "2026-10-17",
    endDay: "2026-10-17",
    startTime: "19:30",
    place: "Grandma’s",
    capacity: null,
    recurringWeekly: false,
    currency: "toman",
    attendees: attendees([
      ["mom", "going"],
      ["dad", "going"],
      ["me", "maybe"],
      ["sara", "going"],
    ]),
  });
  activity({
    id: "istanbul",
    title: "Istanbul long weekend",
    template: "trip",
    groupId: null,
    organiserId: "sara",
    startDay: "2026-11-05",
    endDay: "2026-11-08",
    startTime: null,
    place: "Istanbul",
    capacity: 6,
    recurringWeekly: false,
    currency: "try",
    attendees: attendees([
      ["sara", "going"],
      ["me", "going", true],
      ["kian", "going", true],
      ["tara", "going", true],
    ]),
  });
  activity({
    id: "sunday10k",
    title: "Sunday 10K",
    template: "sport",
    groupId: "runners",
    organiserId: "omid",
    startDay: "2026-10-18",
    endDay: "2026-10-18",
    startTime: "07:00",
    place: "Chitgar park",
    capacity: 30,
    recurringWeekly: true,
    currency: "toman",
    attendees: attendees([
      ["omid", "going"],
      ["tara", "going"],
      ["me", "pending", true],
    ]),
  });

  const polls = new Map<string, PollRec>([
    [
      "poll-night",
      {
        id: "poll-night",
        activityId: "nighthike",
        kind: "date",
        question: "When works for the night hike?",
        options: [
          { id: "o-1", label: "", day: "2026-10-28", startTime: "18:00", endTime: "22:00" },
          { id: "o-2", label: "", day: "2026-10-29", startTime: "18:00", endTime: "22:00" },
          { id: "o-3", label: "", day: "2026-10-30", startTime: "17:00", endTime: "21:00" },
        ],
        votes: new Map<string, Record<string, Vote>>([
          ["nazanin", { "o-2": "yes", "o-3": "yes" }],
          ["arman", { "o-1": "if-needed", "o-3": "yes" }],
          ["kian", { "o-3": "if-needed" }],
        ]),
        deadline: at("2026-10-20", "20:00"),
        closed: false,
        finalOptionId: null,
        anonymous: false,
        resultsAfterVote: false,
      },
    ],
  ]);

  polls.set("poll-trail", {
    id: "poll-trail",
    activityId: "nighthike",
    kind: "single",
    question: "Which trail?",
    options: [
      { id: "t-1", label: "Darakeh → Pelangan" },
      { id: "t-2", label: "Darband → Shirpala" },
      { id: "t-3", label: "Kolakchal ridge" },
    ],
    votes: new Map<string, Record<string, Vote>>([
      ["nazanin", { "t-2": "yes" }],
      ["arman", { "t-1": "yes" }],
      ["kian", { "t-2": "yes" }],
    ]),
    deadline: at("2026-10-20", "20:00"),
    closed: false,
    finalOptionId: null,
    anonymous: false,
    // Results visible after voting (setting).
    resultsAfterVote: true,
  });
  polls.set("poll-bring", {
    id: "poll-bring",
    activityId: "nighthike",
    kind: "multiple",
    question: "What can you bring?",
    options: [
      { id: "b-1", label: "Headlamps" },
      { id: "b-2", label: "Thermos of tea" },
      { id: "b-3", label: "First-aid kit" },
      { id: "b-4", label: "Snacks" },
    ],
    votes: new Map<string, Record<string, Vote>>([
      ["nazanin", { "b-3": "yes", "b-4": "yes" }],
      ["arman", { "b-1": "yes" }],
    ]),
    deadline: at("2026-10-28", "20:00"),
    closed: false,
    finalOptionId: null,
    // Anonymous voting (optional): counts only, never names.
    anonymous: true,
    resultsAfterVote: false,
  });

  // Free/busy consent per activity: who shared, who was asked, incoming asks.
  const freeBusy = new Map<string, { consents: Map<string, "shared" | "requested" | "declined" | "none">; incoming: Map<string, string> }>([
    [
      "nighthike",
      {
        consents: new Map([
          ["nazanin", "shared"],
          ["arman", "none"],
          ["sara", "requested"],
          ["kian", "shared"],
          ["me", "none"],
        ]),
        incoming: new Map([["me", "nazanin"]]),
      },
    ],
  ]);

  const v = (title: string, amount: number, payerId: string, day: string, split: SplitSpec): VersionRec => ({ title, amount, payerId, day, split });
  const alborzTen = ["me", "nazanin", "arman", "babak", "sara", "parisa", "kian", "jamal", "darya", "javad"];
  const expenses = new Map<string, ExpenseRec>();
  const expense = (rec: Omit<ExpenseRec, "pendingEdit" | "rejectReason" | "receipt" | "revisions" | "settled"> & Partial<ExpenseRec>) =>
    expenses.set(rec.id, {
      pendingEdit: null,
      rejectReason: null,
      receipt: null,
      settled: false,
      revisions: [{ at: at(rec.current.day, "20:00"), byId: rec.proposerId, kind: "proposed", amount: rec.current.amount, note: "" }],
      ...rec,
    });
  const G = (id: string): ExpenseScope => ({ kind: "group", id });
  expense({ id: "x-cabin", scope: G("mountain"), activityId: "alborz", status: "approved", proposerId: "me", current: v("Cabin · 2 nights", 12_000_000, "me", "2026-10-12", { method: "equal", participants: alborzTen }), receipt: { name: "cabin-invoice.pdf", bytes: 310_000 } });
  expense({ id: "x-fuel", scope: G("mountain"), activityId: "alborz", status: "proposed", proposerId: "nazanin", current: v("Fuel · 2 cars", 1_800_000, "nazanin", "2026-10-13", { method: "equal", participants: alborzTen }) });
  expense({
    id: "x-groceries",
    scope: G("mountain"),
    activityId: "alborz",
    status: "approved",
    proposerId: "arman",
    current: v("Groceries", 3_450_000, "arman", "2026-10-12", { method: "weighted", participants: ["me", "nazanin", "arman", "parisa"], values: { arman: 2 } }),
    pendingEdit: { ...v("Groceries", 3_150_000, "arman", "2026-10-12", { method: "weighted", participants: ["me", "nazanin", "arman", "parisa"], values: { arman: 2 } }), byId: "arman", note: "Returned one item." },
  });
  expense({ id: "x-dinner", scope: G("mountain"), activityId: "alborz", status: "approved", proposerId: "parisa", current: v("Dinner Fri", 4_000_000, "parisa", "2026-10-11", { method: "selected", participants: ["me", "nazanin", "arman", "babak", "sara", "parisa", "kian", "jamal"] }) });
  expense({
    id: "x-ski",
    scope: G("mountain"),
    activityId: "alborz",
    status: "rejected",
    proposerId: "babak",
    rejectReason: "Ski rental is personal; everyone pays their own.",
    current: v("Ski rental", 2_400_000, "babak", "2026-10-11", { method: "fixed", participants: ["babak", "kian", "sara"], values: { babak: 800_000, kian: 800_000, sara: 800_000 } }),
  });
  expense({ id: "x-breakfast", scope: G("mountain"), activityId: "tochal", status: "approved", settled: true, proposerId: "nazanin", current: v("Breakfast at Shirpala", 1_000_000, "nazanin", "2026-09-26", { method: "equal", participants: ["me", "nazanin"] }) });
  expense({ id: "x-cake", scope: G("family"), activityId: "grandma", status: "approved", proposerId: "me", current: v("Birthday cake", 900_000, "me", "2026-10-10", { method: "equal", participants: ["me", "mom", "dad"] }) });
  expense({ id: "x-hotel", scope: { kind: "activity", id: "istanbul" }, activityId: "istanbul", status: "approved", proposerId: "sara", current: v("Hotel · 3 nights", 1_200_000, "sara", "2026-10-09", { method: "equal", participants: ["sara", "me", "kian", "tara"] }) });
  expense({ id: "x-ferry", scope: { kind: "activity", id: "istanbul" }, activityId: "istanbul", status: "proposed", proposerId: "me", current: v("Bosphorus ferry", 48_000, "me", "2026-10-13", { method: "equal", participants: ["sara", "me", "kian", "tara"] }) });
  expense({ id: "x-room", scope: G("bookclub"), activityId: null, status: "approved", proposerId: "leila", current: v("Room rental · October", 6_000, "leila", "2026-10-02", { method: "equal", participants: ["leila", "me", "tara", "omid", "shirin", "kian"] }) });
  expense({ id: "x-bikes", scope: G("cyclists"), activityId: null, status: "approved", proposerId: "babak", current: v("Bike repair kit", 450_000, "babak", "2026-08-02", { method: "equal", participants: ["babak", "kian", "me"] }) });
  for (const e of expenses.values()) {
    if (e.status === "approved") e.revisions.push({ at: at(e.current.day, "21:00"), byId: e.scope.id === "mountain" ? "me" : e.proposerId, kind: "approved", amount: e.current.amount, note: "" });
    if (e.status === "rejected") e.revisions.push({ at: at(e.current.day, "21:00"), byId: "me", kind: "rejected", amount: e.current.amount, note: e.rejectReason ?? "" });
    if (e.pendingEdit) e.revisions.push({ at: at("2026-10-13", "08:40"), byId: e.pendingEdit.byId, kind: "edit-proposed", amount: e.pendingEdit.amount, note: e.pendingEdit.note });
  }

  const settlements = new Map<string, SettlementRec>([
    ["s-1", { id: "s-1", scope: G("mountain"), fromId: "me", toId: "nazanin", amount: 500_000, note: "Breakfast", recordedById: "me", status: "confirmed", disputeNote: null, at: at("2026-09-28"), confirmedAt: at("2026-09-28", "12:00") }],
    ["s-2", { id: "s-2", scope: G("family"), fromId: "dad", toId: "me", amount: 300_000, note: "Cake", recordedById: "dad", status: "recorded", disputeNote: null, at: at("2026-10-12", "21:30"), confirmedAt: null }],
  ]);
  const financeClaims = new Set<string>();

  const things = new Map<string, ThingRec>([
    ["t-tent", { id: "t-tent", name: "Tent (2-person)", category: "outdoor", condition: "Good", notes: "Poles in the side pocket.", ownerId: "me", groupId: null, keeperId: "me", sharedWith: ["mountain"] }],
    ["t-stove", { id: "t-stove", name: "Camping stove", category: "kitchen", condition: "Like new", notes: "", ownerId: "me", groupId: null, keeperId: "me", sharedWith: ["mountain"] }],
    ["t-catan", { id: "t-catan", name: "Catan", category: "games", condition: "Good", notes: "All pieces counted.", ownerId: "me", groupId: null, keeperId: "me", sharedWith: [] }],
    ["t-drill", { id: "t-drill", name: "Cordless drill", category: "tools", condition: "Good", notes: "", ownerId: "me", groupId: null, keeperId: "me", sharedWith: [] }],
    ["t-firstaid", { id: "t-firstaid", name: "Group first-aid kit", category: "outdoor", condition: "Restocked Oct", notes: "", ownerId: null, groupId: "mountain", keeperId: "nazanin", sharedWith: [] }],
    ["t-snowshoes", { id: "t-snowshoes", name: "Snowshoes × 4", category: "outdoor", condition: "Good", notes: "", ownerId: null, groupId: "mountain", keeperId: "arman", sharedWith: [] }],
    ["t-headlamp", { id: "t-headlamp", name: "Headlamp", category: "outdoor", condition: "Good", notes: "", ownerId: "babak", groupId: null, keeperId: "babak", sharedWith: ["mountain"] }],
    ["t-bag", { id: "t-bag", name: "Sleeping bag (-5°)", category: "outdoor", condition: "Good", notes: "", ownerId: "parisa", groupId: null, keeperId: "parisa", sharedWith: ["mountain"] }],
  ]);
  const step = (recordedAt: string | null, confirmedAt: string | null) => ({ recordedAt, confirmedAt });
  const loans = new Map<string, LoanRec>([
    ["l-tent", { id: "l-tent", thingId: "t-tent", lenderId: "me", borrowerId: "kian", groupId: "mountain", from: "2026-10-03", due: "2026-10-10", place: "Tajrish metro exit", status: "out", handover: step(at("2026-10-03", "12:00"), at("2026-10-03", "12:05")), ret: step(null, null), issues: [] }],
    ["l-drill", { id: "l-drill", thingId: "t-drill", lenderId: "me", borrowerId: "dad", groupId: null, from: "2026-10-08", due: "2026-10-20", place: "Home visit", status: "out", handover: step(at("2026-10-08"), at("2026-10-08", "10:10")), ret: step(null, null), issues: [] }],
    ["l-headlamp", { id: "l-headlamp", thingId: "t-headlamp", lenderId: "babak", borrowerId: "me", groupId: "mountain", from: "2026-09-25", due: "2026-10-18", place: "Before Tochal", status: "out", handover: step(at("2026-09-25"), at("2026-09-25", "10:02")), ret: step(null, null), issues: [] }],
    ["l-bag", { id: "l-bag", thingId: "t-bag", lenderId: "parisa", borrowerId: "me", groupId: "mountain", from: "2026-10-20", due: "2026-10-25", place: "Parisa’s office lobby", status: "accepted", handover: step(at("2026-10-13", "09:00"), null), ret: step(null, null), issues: [] }],
    ["l-snow", { id: "l-snow", thingId: "t-snowshoes", lenderId: "arman", borrowerId: "me", groupId: "mountain", from: "2026-10-21", due: "2026-10-24", place: "", status: "requested", handover: step(null, null), ret: step(null, null), issues: [] }],
  ]);
  const posts = new Map<string, PostRec>([
    ["lf-1", { id: "lf-1", groupId: "mountain", kind: "missing", title: "Blue water bottle", note: "Lost on the Tochal trail, has a sticker.", byId: "sara", at: at("2026-09-27"), claim: null, poster: false, claimer: false }],
    ["lf-2", { id: "lf-2", groupId: "mountain", kind: "found", title: "Black glove (left)", note: "Found in my car after the climbing gym.", byId: "me", at: at("2026-10-07"), claim: { byId: "arman", at: at("2026-10-08") }, poster: false, claimer: true }],
  ]);

  const albums = new Map<string, AlbumRec>([
    ["al-tochal", { id: "al-tochal", groupId: "mountain", activityId: "tochal", title: "Tochal sunrise" }],
    ["al-summer", { id: "al-summer", groupId: "mountain", activityId: null, title: "Summer 1405" }],
    ["al-family", { id: "al-family", groupId: "family", activityId: null, title: "Nowruz 1405" }],
  ]);
  const photos = new Map<string, PhotoRec>();
  const uploaders = ["sara", "me", "nazanin", "sara", "arman", "me"];
  for (let i = 0; i < 14; i++) {
    const id = `ph-${i}`;
    photos.set(id, { id, albumId: i < 10 ? "al-tochal" : "al-summer", uploaderId: uploaders[i % uploaders.length]!, name: `IMG_${2040 + i}.jpg`, bytes: 3_000_000 + i * 170_000, url: null, hue: (i * 37) % 360, at: at("2026-09-27", "21:00") });
  }

  const challenges = new Map<string, ChallengeRec>([
    [
      "ch-km",
      {
        id: "ch-km",
        groupId: "mountain",
        title: "100 km in October",
        unit: "km",
        target: 100,
        startDay: "2026-09-23",
        endDay: "2026-10-22",
        participants: new Set(["me", "nazanin", "arman", "sara", "kian", "darya", "javad"]),
        entries: [
          { id: "e-1", personId: "me", day: "2026-10-03", amount: 7 },
          { id: "e-2", personId: "me", day: "2026-10-10", amount: 5 },
          { id: "e-3", personId: "nazanin", day: "2026-10-05", amount: 14 },
          { id: "e-4", personId: "arman", day: "2026-10-06", amount: 18 },
          { id: "e-5", personId: "sara", day: "2026-10-08", amount: 9 },
          { id: "e-6", personId: "kian", day: "2026-10-09", amount: 6 },
          { id: "e-7", personId: "darya", day: "2026-10-11", amount: 5 },
        ],
        individualTotals: false,
      },
    ],
    ["ch-stairs", { id: "ch-stairs", groupId: "mountain", title: "Stairs instead of lifts", unit: "floors", target: 500, startDay: "2026-10-01", endDay: "2026-10-31", participants: new Set(["parisa", "babak"]), entries: [{ id: "e-8", personId: "parisa", day: "2026-10-04", amount: 60 }], individualTotals: true }],
  ]);

  // Connections (mutual), private circles, requests.
  const connections = new Map<string, string>([
    ["nazanin", "2024-02-10"],
    ["arman", "2024-06-01"],
    ["babak", "2024-06-01"],
    ["sara", "2023-11-20"],
    ["kian", "2025-01-12"],
    ["parisa", "2025-03-03"],
    ["leila", "2025-04-18"],
    ["mom", "2022-01-01"],
    ["dad", "2022-01-01"],
    ["tara", "2025-08-08"],
  ]);
  const circles = new Map<string, { id: string; name: string; members: Set<string> }>([
    ["c-close", { id: "c-close", name: "Close friends", members: new Set(["nazanin", "sara", "arman"]) }],
    ["c-hike", { id: "c-hike", name: "Hiking", members: new Set(["nazanin", "arman", "babak", "kian", "parisa"]) }],
    ["c-family", { id: "c-family", name: "Family", members: new Set(["mom", "dad"]) }],
  ]);
  const requests = new Map<string, { id: string; personId: string; direction: "incoming" | "outgoing"; note: string; at: string }>([
    ["rq-1", { id: "rq-1", personId: "darya", direction: "incoming", note: "We met on the Tochal hike!", at: at("2026-10-12", "18:00") }],
    ["rq-2", { id: "rq-2", personId: "javad", direction: "incoming", note: "", at: at("2026-10-11", "11:00") }],
    ["rq-3", { id: "rq-3", personId: "omid", direction: "outgoing", note: "", at: at("2026-10-09", "09:00") }],
  ]);
  const ignored = new Map<string, string>();
  const blocked = new Set<string>();
  let privacy: RequestPrivacy = "everyone";
  const lookupTimes: number[] = [];

  // ── Access helpers ────────────────────────────────────────────────────
  const live = (groupId: string) => {
    const g = groups.get(groupId);
    return g && !g.deleted ? g : undefined;
  };
  const memberOf = (g: GroupRec, personId = ME) => g.members.find((x) => x.id === personId);
  const requireGroup = (groupId: string) => {
    const g = live(groupId);
    if (!g || !memberOf(g)) throw new SocialError("not-found");
    return g;
  };
  const isAdmin = (g: GroupRec) => {
    const role = memberOf(g)?.role;
    return role === "owner" || role === "admin";
  };
  const requireAdmin = (groupId: string) => {
    const g = requireGroup(groupId);
    if (!isAdmin(g)) throw new SocialError("forbidden");
    return g;
  };
  const attendeeOf = (a: ActivityRec, personId = ME) => a.attendees.find((x) => x.id === personId);
  const canSeeActivity = (a: ActivityRec) => {
    if (attendeeOf(a) || a.organiserId === ME) return true;
    const g = a.groupId ? live(a.groupId) : undefined;
    return g ? memberOf(g) !== undefined : false;
  };
  const requireActivity = (id: string) => {
    const a = activities.get(id);
    if (!a || !canSeeActivity(a)) throw new SocialError("not-found");
    return a;
  };
  const canManageActivity = (a: ActivityRec) => {
    if (a.organiserId === ME) return true;
    const g = a.groupId ? live(a.groupId) : undefined;
    return g !== undefined && isAdmin(g);
  };
  const goingCount = (a: ActivityRec) => a.attendees.filter((x) => x.rsvp === "going").length;

  /** Member order of an expense scope (people who can take part). */
  function scopePeople(scope: ExpenseScope): string[] {
    if (scope.kind === "group") {
      const g = live(scope.id);
      if (!g) return [];
      const extra = [...expenses.values()].filter((e) => e.scope.kind === "group" && e.scope.id === scope.id).flatMap((e) => [e.current.payerId, ...e.current.split.participants]);
      return [...new Set([...g.members.map((x) => x.id), ...g.formerMembers, ...extra])];
    }
    const a = activities.get(scope.id);
    return a ? [...new Set([a.organiserId, ...a.attendees.filter((x) => x.rsvp !== "declined").map((x) => x.id)])] : [];
  }

  const currencyOf = (scope: ExpenseScope): SocialCurrency => {
    if (scope.kind === "group") return live(scope.id)?.currency ?? "toman";
    const a = activities.get(scope.id);
    if (!a) return "toman";
    return a.groupId ? (live(a.groupId)?.currency ?? a.currency) : a.currency;
  };

  const scopeName = (scope: ExpenseScope) => (scope.kind === "group" ? (groups.get(scope.id)?.name ?? "") : (activities.get(scope.id)?.title ?? ""));

  /** Expenses that belong to a scope; an activity of a group = the group's expenses tagged with it. */
  const inScope = (e: ExpenseRec, scope: ExpenseScope) =>
    scope.kind === "group" ? e.scope.kind === "group" && e.scope.id === scope.id : (e.scope.kind === "activity" && e.scope.id === scope.id) || e.activityId === scope.id;
  const settlementInScope = (s: SettlementRec, scope: ExpenseScope) =>
    scope.kind === "group"
      ? (s.scope.kind === "group" && s.scope.id === scope.id) || (s.scope.kind === "activity" && activities.get(s.scope.id)?.groupId === scope.id)
      : s.scope.kind === "activity" && s.scope.id === scope.id;

  /** Viewer may use this scope: group member (or former member with records), or activity participant. */
  function scopeRole(scope: ExpenseScope): { member: boolean; approver: boolean; seeAll: boolean } {
    if (scope.kind === "group") {
      const g = live(scope.id);
      if (!g) throw new SocialError("not-found");
      const me = memberOf(g);
      if (!me) {
        if (g.formerMembers.includes(ME)) return { member: false, approver: false, seeAll: false };
        throw new SocialError("not-found");
      }
      const admin = me.role !== "member";
      return { member: true, approver: admin, seeAll: admin || g.settings.membersSeeBalances };
    }
    const a = activities.get(scope.id);
    if (!a || !canSeeActivity(a)) throw new SocialError("not-found");
    const g = a.groupId ? live(a.groupId) : undefined;
    const admin = g ? isAdmin(g) : false;
    const organiserApproves = !g || g.settings.approvers === "admins-organiser";
    const approver = admin || (organiserApproves && a.organiserId === ME);
    return { member: true, approver, seeAll: admin || (!g && a.organiserId === ME) || (g?.settings.membersSeeBalances ?? false) };
  }

  const versionView = (version: VersionRec): ExpenseVersion => {
    const split = computeSplit(version.amount, version.split, version.payerId);
    return { ...clone(version), split: clone(version.split), shares: split.shares, remainder: split.remainder };
  };

  const counted = (e: ExpenseRec) => e.status === "approved";
  const takesPart = (e: ExpenseRec, personId = ME) => e.current.payerId === personId || e.current.split.participants.includes(personId) || e.proposerId === personId;

  function expenseView(e: ExpenseRec, role = scopeRole(e.scope)): SharedExpense {
    const current = versionView(e.current);
    const canApprove = role.approver && (e.status === "proposed" || e.pendingEdit !== null);
    return {
      id: e.id,
      scope: clone(e.scope),
      activityId: e.activityId,
      status: e.status === "approved" && e.pendingEdit ? "edit-pending" : e.status,
      current,
      pendingEdit: e.pendingEdit ? { ...versionView(e.pendingEdit), by: person(e.pendingEdit.byId), note: e.pendingEdit.note } : null,
      payer: person(e.current.payerId),
      proposer: person(e.proposerId),
      rejectReason: e.rejectReason,
      receipt: e.receipt ? { ...e.receipt } : null,
      revisions: e.revisions.map((r) => ({ at: r.at, by: person(r.byId), kind: r.kind, amount: r.amount, note: r.note })),
      settled: e.settled,
      postedToFinance: financeClaims.has(`share:${e.id}:${ME}`),
      myShare: current.shares.find((s) => s.personId === ME)?.amount ?? 0,
      canApprove,
      canEdit: role.member && e.status === "approved" && e.pendingEdit === null && (takesPart(e) || role.approver),
    };
  }

  function balanceFor(scope: ExpenseScope): ScopeBalance {
    const role = scopeRole(scope);
    const order = scopePeople(scope);
    const list = [...expenses.values()].filter((e) => inScope(e, scope));
    const approved = list.filter(counted).map((e) => {
      const split = computeSplit(e.current.amount, e.current.split, e.current.payerId);
      return { payerId: e.current.payerId, amount: e.current.amount, shares: split.shares };
    });
    const confirmed = [...settlements.values()].filter((s) => s.status === "confirmed" && settlementInScope(s, scope));
    const rows = computeBalances(approved, confirmed, order);
    const mine = rows.find((r) => r.personId === ME) ?? { paid: 0, share: 0, settled: 0, net: 0 };
    const transfers = simplifyTransfers(rows, order);
    return {
      scope: clone(scope),
      name: scopeName(scope),
      currency: currencyOf(scope),
      left: !role.member,
      members: order.map(person),
      mine: { paid: mine.paid, share: mine.share, settled: mine.settled, net: mine.net },
      transfers: role.seeAll ? transfers : transfers.filter((t) => t.fromId === ME || t.toId === ME),
      everyone: role.seeAll ? rows.filter((r) => r.net !== 0 || r.paid !== 0).map((r) => ({ person: person(r.personId), net: r.net })) : null,
      counted: approved.length,
      proposedCount: list.filter((e) => e.status === "proposed").length,
      pendingEditCount: list.filter((e) => e.pendingEdit !== null).length,
      approvedTotal: approved.reduce((a, e) => a + e.amount, 0),
    };
  }

  function settlementView(s: SettlementRec): Settlement {
    const other = s.recordedById === s.fromId ? s.toId : s.fromId;
    return {
      id: s.id,
      scope: clone(s.scope),
      scopeName: scopeName(s.scope),
      currency: currencyOf(s.scope),
      from: person(s.fromId),
      to: person(s.toId),
      amount: s.amount,
      note: s.note,
      recordedBy: person(s.recordedById),
      status: s.status,
      disputeNote: s.disputeNote,
      at: s.at,
      confirmedAt: s.confirmedAt,
      awaitingMe: s.status === "recorded" && other === ME,
      postedToFinance: financeClaims.has(`settlement:${s.id}:${ME}`),
    };
  }

  // ── Group views ───────────────────────────────────────────────────────
  const initialsOf = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");

  function summary(g: GroupRec): GroupSummary {
    const me = memberOf(g)!;
    const admin = me.role !== "member";
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      topic: g.topic,
      currency: g.currency,
      memberCount: g.members.length,
      myRole: me.role,
      visibility: g.settings.visibility,
      unread: g.unread,
      pendingRequests: admin ? g.requests.filter((r) => r.personId !== ME).length : 0,
      initials: initialsOf(g.name),
    };
  }

  function detail(g: GroupRec): GroupDetail {
    const me = memberOf(g)!;
    const owner = me.role === "owner";
    const admin = owner || me.role === "admin";
    return {
      ...summary(g),
      rules: g.rules,
      settings: { ...g.settings },
      currencyLocked: [...expenses.values()].some((e) => e.scope.kind === "group" && e.scope.id === g.id && (e.status === "approved" || e.revisions.some((r) => r.kind === "approved"))),
      members: [...g.members]
        .sort((a, b) => person(a.id).name.localeCompare(person(b.id).name))
        .map((x) => ({ person: person(x.id), role: x.role, joinedAt: x.joinedAt, status: x.status ? { ...x.status } : null, isSelf: x.id === ME })),
      createdAt: g.createdAt,
      capabilities: {
        createActivity: true,
        invite: admin || g.settings.invites === "members",
        decideJoins: admin,
        changeRoles: owner,
        removeMembers: admin,
        editSettings: admin,
        makeDiscoverable: owner,
        approveExpenses: admin,
        seeAllBalances: admin || g.settings.membersSeeBalances,
        deleteGroup: owner,
        transferOwnership: owner,
      },
    };
  }

  function preview(g: GroupRec) {
    return { id: g.id, name: g.name, description: g.description, topic: g.topic, size: g.size ?? g.members.length, rules: g.rules, requested: g.requests.some((r) => r.personId === ME) };
  }

  const event = (g: GroupRec, kind: GroupEventKindRec, subject: string) => g.events.unshift({ id: nextId("ev"), kind, actorId: ME, subject, at: stamp() });

  // ── Activity views ────────────────────────────────────────────────────
  function activitySummary(a: ActivityRec): ActivitySummary {
    const g = a.groupId ? groups.get(a.groupId) : undefined;
    const mineRec = attendeeOf(a);
    const waitIndex = a.waitlist.findIndex((x) => x.id === ME);
    return {
      id: a.id,
      title: a.title,
      template: a.template,
      group: g ? { id: g.id, name: g.name } : null,
      organiser: person(a.organiserId),
      startDay: a.startDay,
      endDay: a.endDay,
      startTime: a.startTime,
      place: a.place,
      recurringWeekly: a.recurringWeekly,
      capacity: a.capacity,
      goingCount: goingCount(a),
      waitlistCount: a.waitlist.length,
      myRsvp: mineRec?.rsvp ?? "pending",
      myWaitlist: waitIndex === -1 ? null : waitIndex + 1,
      status: a.status,
      currency: currencyOf({ kind: "activity", id: a.id }),
      isGuest: mineRec?.guest ?? false,
      organisedByMe: a.organiserId === ME,
      hasOpenPoll: [...polls.values()].some((p) => p.activityId === a.id && !p.closed),
    };
  }

  function activityDetail(a: ActivityRec): ActivityDetail {
    const s = activitySummary(a);
    const manage = canManageActivity(a);
    return {
      ...s,
      description: a.description,
      itinerary: clone(a.itinerary),
      checklist: a.checklist.map((c) => ({ id: c.id, title: c.title, done: c.done, assignee: c.assigneeId ? person(c.assigneeId) : null, taskId: c.taskId })),
      attendees: a.attendees.map((x) => ({ person: person(x.id), rsvp: x.rsvp, guest: x.guest, organiser: x.id === a.organiserId })),
      waitlist: a.waitlist.map((x) => ({ person: person(x.id), offeredUntil: x.offeredUntil })),
      files: a.files.map((f) => ({ id: f.id, name: f.name, bytes: f.bytes, by: person(f.byId) })),
      cancelReason: a.cancelReason,
      cancelledBy: a.cancelledById ? person(a.cancelledById) : null,
      pollId: a.pollId,
      pollIds: [...polls.values()].filter((p) => p.activityId === a.id).sort((x, y) => Number(y.kind === "date") - Number(x.kind === "date")).map((p) => p.id),
      calendarBlock: a.calendarBlock.has(ME),
      capabilities: {
        edit: manage && a.status === "planned",
        cancel: manage && a.status === "planned",
        rsvp: a.status === "planned" && a.endDay >= today,
        uploadFiles: a.status === "planned" && (manage || (attendeeOf(a)?.rsvp ?? "declined") !== "declined"),
      },
    };
  }

  /** S3: when a spot opens, the first in line is offered it for 12 h. */
  function offerSpot(a: ActivityRec) {
    if (a.capacity === null || goingCount(a) >= a.capacity) return;
    const first = a.waitlist[0];
    if (first && first.offeredUntil === null) first.offeredUntil = new Date(Date.parse(nowIso) + 12 * 3600_000).toISOString();
  }

  // ── Activity files (PJ-10 shape) ──────────────────────────────────────
  const FILE_MAX_BYTES = 25 * 1024 * 1024;
  const BLOCKED_FILE = /\.(exe|bat|cmd|msi|js)$/i;
  const mediaOf = (name: string): ProjectFile["media"] =>
    /\.(png|jpe?g|gif|webp|heic)$/i.test(name)
      ? "image"
      : /\.pdf$/i.test(name)
        ? "pdf"
        : /\.(xlsx?|csv|ods)$/i.test(name)
          ? "sheet"
          : /\.(docx?|txt|md|odt)$/i.test(name)
            ? "doc"
            : /\.(fig|sketch|psd)$/i.test(name)
              ? "design"
              : "other";
  function fileView(f: ActivityRec["files"][number]): ProjectFile {
    const versions = f.versions ?? [{ version: 1, byId: f.byId, at: f.at ?? at("2026-10-12") }];
    return {
      id: f.id,
      name: f.name,
      folderId: null,
      sizeBytes: f.bytes,
      media: mediaOf(f.name),
      state: "ready",
      version: versions.length,
      versions: versions.map((v) => ({ version: v.version, by: person(v.byId), at: v.at, ...(v.restoredFrom ? { restoredFrom: v.restoredFrom } : {}) })),
      uploadedBy: person(f.byId),
      updatedAt: versions.at(-1)!.at,
      taskIds: [],
    };
  }

  // ── Lending views ─────────────────────────────────────────────────────
  const thingGroup = (t: ThingRec) => (t.groupId ? groups.get(t.groupId) : undefined);
  const activeLoan = (thingId: string) => [...loans.values()].find((l) => l.thingId === thingId && (l.status === "requested" || l.status === "accepted" || l.status === "out"));
  function thingView(t: ThingRec): Thing {
    const g = thingGroup(t);
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      condition: t.condition,
      notes: t.notes,
      owner: t.ownerId ? person(t.ownerId) : null,
      group: g ? { id: g.id, name: g.name } : null,
      keeper: person(t.keeperId),
      sharedWith: t.sharedWith.map((id) => ({ id, name: groups.get(id)?.name ?? "" })),
      activeLoanId: activeLoan(t.id)?.id ?? null,
      mine: t.ownerId === ME || (t.ownerId === null && t.keeperId === ME),
    };
  }

  function loanStep(l: LoanRec): Loan["myStep"] {
    const lender = l.lenderId === ME;
    const borrower = l.borrowerId === ME;
    if (l.status === "requested") return lender ? "accept" : null;
    if (l.status === "accepted") {
      if (!l.handover.recordedAt) return lender ? "record-handover" : null;
      return borrower ? "confirm-handover" : null;
    }
    if (l.status === "out") {
      if (!l.ret.recordedAt) return borrower ? "record-return" : null;
      return lender ? "confirm-return" : null;
    }
    return null;
  }

  function loanView(l: LoanRec): Loan {
    const t = things.get(l.thingId)!;
    const g = l.groupId ? groups.get(l.groupId) : undefined;
    return {
      id: l.id,
      thing: { id: t.id, name: t.name, category: t.category },
      group: g ? { id: g.id, name: g.name } : null,
      lender: person(l.lenderId),
      borrower: person(l.borrowerId),
      from: l.from,
      due: l.due,
      place: l.place,
      status: l.status,
      handover: { ...l.handover },
      return: { ...l.ret },
      issues: l.issues.map((i) => ({ id: i.id, kind: i.kind, note: i.note, by: person(i.byId), at: i.at, resolvedByLender: i.lender, resolvedByBorrower: i.borrower })),
      overdue: l.status === "out" && l.due < today,
      myStep: loanStep(l),
      iAmLender: l.lenderId === ME,
    };
  }

  const requireLoanParty = (id: string) => {
    const l = loans.get(id);
    if (!l || (l.lenderId !== ME && l.borrowerId !== ME)) throw new SocialError("not-found");
    return l;
  };

  const myGroupIds = () => [...groups.values()].filter((g) => !g.deleted && memberOf(g)).map((g) => g.id);

  // ── Validation helpers ────────────────────────────────────────────────
  const isInt = (n: number) => Number.isSafeInteger(n) && n > 0;
  const validateVersion = (scope: ExpenseScope, input: Pick<NewExpenseInput, "title" | "amount" | "payerId" | "day" | "split">) => {
    if (!input.title.trim() || !isInt(input.amount) || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new SocialError("invalid");
    const people = scopePeople(scope);
    if (!people.includes(input.payerId) || input.split.participants.some((p) => !people.includes(p))) throw new SocialError("invalid", "participant outside scope");
    if (computeSplit(input.amount, input.split, input.payerId).error) throw new SocialError("invalid", "split does not match");
  };
  const scopeRef = (scope: ExpenseScope): ExpenseScope => {
    // A group activity's expenses belong to the group (one currency per group).
    if (scope.kind === "activity") {
      const a = activities.get(scope.id);
      if (a?.groupId) return { kind: "group", id: a.groupId };
    }
    return scope;
  };

  const repo: SocialRepository = {
    connections: {
      async list() {
        return [...connections]
          .filter(([id]) => !blocked.has(id))
          .map(([id, since]) => ({
            person: person(id),
            since,
            circleIds: [...circles.values()].filter((c) => c.members.has(id)).map((c) => c.id),
            sharedGroups: myGroupIds()
              .map((gid) => groups.get(gid)!)
              .filter((g) => memberOf(g, id))
              .map((g) => ({ id: g.id, name: g.name })),
          }))
          .sort((a, b) => a.person.name.localeCompare(b.person.name));
      },
      async requests() {
        return [...requests.values()].map((r) => ({
          id: r.id,
          person: person(r.personId),
          direction: r.direction,
          note: r.note,
          at: r.at,
          mutualGroups: r.direction === "incoming" ? myGroupIds().filter((gid) => memberOf(groups.get(gid)!, r.personId)).length : 0,
        }));
      },
      async request(contact) {
        const t = Date.parse(nowIso) + lookupTimes.length;
        const recent = lookupTimes.filter((x) => t - x < 60_000);
        if (recent.length >= 10) throw new SocialError("rate-limited");
        lookupTimes.push(t);
        if (!contact.trim()) throw new SocialError("invalid");
        // Never reveals whether an account exists or allows requests.
        return { sent: true };
      },
      async accept(requestId) {
        const r = requests.get(requestId);
        if (!r || r.direction !== "incoming") throw new SocialError("not-found");
        requests.delete(requestId);
        connections.set(r.personId, today);
      },
      async ignore(requestId) {
        const r = requests.get(requestId);
        if (!r || r.direction !== "incoming") throw new SocialError("not-found");
        requests.delete(requestId);
        ignored.set(r.personId, today);
      },
      async cancel(requestId) {
        const r = requests.get(requestId);
        if (!r || r.direction !== "outgoing") throw new SocialError("not-found");
        requests.delete(requestId);
      },
      async remove(personId) {
        connections.delete(personId);
        for (const c of circles.values()) c.members.delete(personId);
      },
      async block(personId) {
        blocked.add(personId);
        connections.delete(personId);
        for (const [id, r] of requests) if (r.personId === personId) requests.delete(id);
        for (const c of circles.values()) c.members.delete(personId);
      },
      async privacy() {
        return privacy;
      },
      async setPrivacy(value) {
        privacy = value;
      },
    },
    circles: {
      async list() {
        return [...circles.values()].map((c) => ({ id: c.id, name: c.name }));
      },
      async create(name) {
        if (!name.trim()) throw new SocialError("invalid");
        const c = { id: nextId("c"), name: name.trim(), members: new Set<string>() };
        circles.set(c.id, c);
        return { id: c.id, name: c.name };
      },
      async remove(circleId) {
        circles.delete(circleId);
      },
      async setMembership(circleId, personId, member) {
        const c = circles.get(circleId);
        if (!c || !connections.has(personId)) throw new SocialError("not-found");
        if (member) c.members.add(personId);
        else c.members.delete(personId);
      },
    },
    groups: {
      async directory() {
        const mine = myGroupIds().map((id) => groups.get(id)!);
        return {
          groups: mine.map(summary).sort((a, b) => a.name.localeCompare(b.name)),
          incomingRequests: [...requests.values()].filter((r) => r.direction === "incoming").length,
          joinRequestsPending: [...groups.values()].filter((g) => !g.deleted && g.requests.some((r) => r.personId === ME)).map((g) => ({ groupId: g.id, groupName: g.name })),
        };
      },
      async access(groupId): Promise<GroupAccess> {
        const g = live(groupId);
        if (!g) return { kind: "not-available" };
        if (memberOf(g)) return { kind: "member", group: detail(g) };
        if (g.requests.some((r) => r.personId === ME) && g.settings.visibility === "discoverable") return { kind: "join-requested", preview: preview(g) };
        const guestOf = [...activities.values()].filter((a) => a.groupId === g.id && attendeeOf(a)?.guest).map((a) => a.id);
        if (guestOf.length > 0) return { kind: "guest", groupName: g.name, activityIds: guestOf };
        if (g.formerMembers.includes(ME)) return { kind: "left", groupName: g.name, openBalance: balanceFor({ kind: "group", id: g.id }).mine.net !== 0 };
        // Private groups are not discoverable: forbidden = not found (same copy).
        return { kind: "not-available" };
      },
      async discover(query, topic) {
        const q = query.trim().toLowerCase();
        return [...groups.values()]
          .filter((g) => !g.deleted && g.settings.visibility === "discoverable" && !memberOf(g))
          .filter((g) => topic === "all" || g.topic === topic)
          .filter((g) => !q || g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q))
          .map(preview);
      },
      async requestJoin(groupId, note) {
        const g = live(groupId);
        if (!g || g.settings.visibility !== "discoverable" || memberOf(g)) throw new SocialError("not-found");
        if (!g.requests.some((r) => r.personId === ME)) g.requests.push({ id: nextId("jr"), personId: ME, note: note.trim(), at: stamp() });
      },
      async cancelJoin(groupId) {
        const g = live(groupId);
        if (g) g.requests = g.requests.filter((r) => r.personId !== ME);
      },
      async joinRequests(groupId) {
        const g = requireAdmin(groupId);
        return g.requests.map((r) => ({ id: r.id, groupId, person: person(r.personId), note: r.note, at: r.at }));
      },
      async decide(requestId, approve) {
        const g = [...groups.values()].find((x) => x.requests.some((r) => r.id === requestId));
        if (!g) throw new SocialError("not-found");
        if (!isAdmin(g)) throw new SocialError("forbidden");
        const r = g.requests.find((x) => x.id === requestId)!;
        g.requests = g.requests.filter((x) => x.id !== requestId);
        if (approve) {
          g.members.push({ id: r.personId, role: "member", joinedAt: stamp(), status: null });
          g.events.unshift({ id: nextId("ev"), kind: "joined", actorId: r.personId, subject: "", at: stamp() });
        }
      },
      async create(input) {
        const existing = [...groups.values()].find((g) => g.events.some((e) => e.id === `op:${input.clientOpId}`));
        if (existing) return existing.id;
        if (!input.name.trim()) throw new SocialError("invalid");
        const id = nextId("g");
        groups.set(id, {
          id,
          name: input.name.trim(),
          description: input.description.trim(),
          topic: input.topic,
          currency: input.currency,
          rules: "",
          createdAt: stamp(),
          members: [{ id: ME, role: "owner", joinedAt: stamp(), status: null }],
          settings: { ...DEFAULT_SETTINGS, visibility: input.visibility },
          requests: [],
          invites: input.inviteIds.filter((pid) => connections.has(pid)).map((pid) => ({ id: nextId("inv"), label: person(pid).name, byId: ME, at: stamp() })),
          unread: 0,
          events: [{ id: `op:${input.clientOpId}`, kind: "joined", actorId: ME, subject: "", at: stamp() }],
          formerMembers: [],
          deleted: false,
        });
        return id;
      },
      async events(groupId) {
        const g = requireGroup(groupId);
        return g.events.filter((e) => !e.id.startsWith("op:")).map((e) => ({ id: e.id, kind: e.kind, actor: person(e.actorId), subject: e.subject, at: e.at }));
      },
      async invites(groupId) {
        const g = requireGroup(groupId);
        return g.invites.map((i) => ({ id: i.id, label: i.label, invitedBy: person(i.byId), at: i.at }));
      },
      async invite(groupId, personIds) {
        const g = requireGroup(groupId);
        if (!(isAdmin(g) || g.settings.invites === "members")) throw new SocialError("forbidden");
        for (const pid of personIds) {
          if (!connections.has(pid) || memberOf(g, pid) || g.invites.some((i) => i.label === person(pid).name)) continue;
          g.invites.push({ id: nextId("inv"), label: person(pid).name, byId: ME, at: stamp() });
        }
      },
      async cancelInvite(groupId, inviteId) {
        const g = requireAdmin(groupId);
        g.invites = g.invites.filter((i) => i.id !== inviteId);
      },
      async resendInvite(groupId, inviteId) {
        const g = requireAdmin(groupId);
        const i = g.invites.find((x) => x.id === inviteId);
        if (!i) throw new SocialError("not-found");
        i.at = stamp();
      },
      async setRole(groupId, personId, role) {
        const g = requireGroup(groupId);
        if (memberOf(g)?.role !== "owner") throw new SocialError("forbidden");
        const target = memberOf(g, personId);
        if (!target || target.role === "owner") throw new SocialError("invalid");
        target.role = role;
      },
      async removeMember(groupId, personId) {
        const g = requireAdmin(groupId);
        const target = memberOf(g, personId);
        if (!target || target.role === "owner" || personId === ME) throw new SocialError("invalid");
        if (target.role === "admin" && memberOf(g)?.role !== "owner") throw new SocialError("forbidden");
        g.members = g.members.filter((x) => x.id !== personId);
        g.formerMembers.push(personId);
      },
      async transferOwnership(groupId, personId) {
        const g = requireGroup(groupId);
        const me = memberOf(g)!;
        const target = memberOf(g, personId);
        if (me.role !== "owner") throw new SocialError("forbidden");
        if (!target || personId === ME) throw new SocialError("invalid");
        target.role = "owner";
        me.role = "admin";
      },
      async updateSettings(groupId, patch) {
        const g = requireAdmin(groupId);
        if (patch.visibility !== undefined && patch.visibility !== g.settings.visibility && memberOf(g)?.role !== "owner") throw new SocialError("forbidden");
        const { name, description, rules, currency, ...settings } = patch;
        if (currency !== undefined && currency !== g.currency) {
          if (detail(g).currencyLocked) throw new SocialError("conflict", "currency locked");
          g.currency = currency;
        }
        if (name !== undefined) {
          if (!name.trim()) throw new SocialError("invalid");
          g.name = name.trim();
        }
        if (description !== undefined) g.description = description;
        if (rules !== undefined) g.rules = rules;
        g.settings = { ...g.settings, ...settings };
      },
      async setMyStatus(groupId, status) {
        const g = requireGroup(groupId);
        memberOf(g)!.status = status ? { ...status } : null;
      },
      async leaveChecklist(groupId) {
        const g = requireGroup(groupId);
        const balance = balanceFor({ kind: "group", id: groupId });
        const held = [...loans.values()].filter((l) => l.borrowerId === ME && l.status === "out" && l.groupId === groupId).map((l) => ({ id: l.thingId, name: things.get(l.thingId)!.name }));
        const keeping = [...things.values()].filter((t) => t.groupId === groupId && t.keeperId === ME).map((t) => ({ id: t.id, name: t.name }));
        const albumIds = new Set([...albums.values()].filter((a) => a.groupId === groupId).map((a) => a.id));
        const owner = memberOf(g)!.role === "owner";
        const allSettled = balanceFor({ kind: "group", id: groupId }).everyone?.every((r) => r.net === 0) ?? false;
        return {
          openBalance: balance.mine.net !== 0 ? { currency: g.currency, net: balance.mine.net } : null,
          thingsHeld: [...held, ...keeping],
          myPhotos: [...photos.values()].filter((p) => albumIds.has(p.albumId) && p.uploaderId === ME).length,
          isOwner: owner,
          canDelete: owner && allSettled,
        };
      },
      async leave(groupId, removeMyPhotos) {
        const g = requireGroup(groupId);
        if (memberOf(g)!.role === "owner") throw new SocialError("conflict", "transfer ownership first");
        if (removeMyPhotos) {
          const albumIds = new Set([...albums.values()].filter((a) => a.groupId === groupId).map((a) => a.id));
          for (const [id, p] of photos) if (albumIds.has(p.albumId) && p.uploaderId === ME) photos.delete(id);
        }
        // Access is revoked immediately; approved records and others' rights remain.
        g.members = g.members.filter((x) => x.id !== ME);
        g.formerMembers.push(ME);
        g.events.unshift({ id: nextId("ev"), kind: "left", actorId: ME, subject: "", at: stamp() });
      },
      async deleteGroup(groupId) {
        const g = requireGroup(groupId);
        if (memberOf(g)!.role !== "owner") throw new SocialError("forbidden");
        const settled = balanceFor({ kind: "group", id: groupId }).everyone?.every((r) => r.net === 0) ?? false;
        if (!settled) throw new SocialError("conflict", "balances open");
        g.deleted = true;
      },
      async chatMembers(groupId) {
        const g = requireGroup(groupId);
        g.unread = 0;
        return { name: g.name, personIds: g.members.map((x) => x.id) };
      },
    },
    activities: {
      async mine(filter, groupId) {
        if (groupId) requireGroup(groupId);
        return [...activities.values()]
          .filter((a) => (groupId ? a.groupId === groupId : canSeeActivity(a) && (attendeeOf(a) !== undefined || a.organiserId === ME)))
          .filter((a) => canSeeActivity(a))
          .filter((a) => {
            const past = a.endDay < today;
            if (filter === "past") return past;
            if (past) return false;
            if (filter === "needs-answer") return a.status === "planned" && (attendeeOf(a)?.rsvp ?? "pending") === "pending";
            if (filter === "organised") return a.organiserId === ME;
            return true;
          })
          .map(activitySummary)
          .sort((a, b) => (filter === "past" ? b.startDay.localeCompare(a.startDay) : a.startDay.localeCompare(b.startDay)));
      },
      async get(id) {
        return activityDetail(requireActivity(id));
      },
      async create(input: NewActivityInput) {
        const existing = [...activities.values()].find((a) => a.clientOpId === input.clientOpId);
        if (existing) return existing.id;
        if (!input.title.trim() || !input.startDay || input.endDay < input.startDay) throw new SocialError("invalid");
        if (input.capacity !== null && !isInt(input.capacity)) throw new SocialError("invalid");
        const g = input.groupId ? requireGroup(input.groupId) : undefined;
        const id = nextId("a");
        const guests = input.guestIds.filter((pid) => pid !== ME && connections.has(pid));
        const rec: ActivityRec = {
          id,
          title: input.title.trim(),
          template: input.template,
          groupId: g?.id ?? null,
          organiserId: ME,
          startDay: input.startDay,
          endDay: input.endDay,
          startTime: input.startTime,
          place: input.place.trim(),
          description: "",
          capacity: input.capacity,
          recurringWeekly: input.recurringWeekly,
          status: "planned",
          cancelReason: null,
          cancelledById: null,
          currency: g?.currency ?? input.currency,
          attendees: [{ id: ME, rsvp: "going", guest: false }, ...guests.filter((pid) => !g || !memberOf(g, pid)).map((pid) => ({ id: pid, rsvp: "pending" as Rsvp, guest: true }))],
          waitlist: [],
          itinerary: input.template === "trip" ? [{ day: input.startDay, items: [] }] : [],
          checklist: input.template === "trip" ? ["Sleeping bag", "Water", "Headlamp"].map((title) => ({ id: nextId("ck"), title, done: false, assigneeId: null, taskId: null })) : [],
          files: [],
          pollId: null,
          calendarBlock: new Set(),
          clientOpId: input.clientOpId,
        };
        if (g) for (const x of g.members) if (x.id !== ME) rec.attendees.push({ id: x.id, rsvp: "pending", guest: false });
        if (input.withPoll) {
          const pollId = nextId("poll");
          polls.set(pollId, {
            id: pollId,
            activityId: id,
            kind: "date",
            question: rec.title,
            options: [0, 1, 2].map((n) => ({ id: nextId("o"), label: "", day: addDays(input.startDay, n), startTime: input.startTime ?? "18:00", endTime: undefined })),
            votes: new Map(),
            deadline: at(addDays(input.startDay, -1), "20:00"),
            closed: false,
            finalOptionId: null,
            anonymous: false,
            resultsAfterVote: false,
          });
          rec.pollId = pollId;
        }
        activities.set(id, rec);
        if (g) event(g, "activity", rec.title);
        return id;
      },
      async rsvp(id, rsvp) {
        const a = requireActivity(id);
        if (a.status !== "planned" || a.endDay < today) throw new SocialError("conflict");
        let mineRec = attendeeOf(a);
        const wasGoing = mineRec?.rsvp === "going";
        if (rsvp === "going" && !wasGoing && a.capacity !== null && goingCount(a) >= a.capacity) {
          if (!a.waitlist.some((x) => x.id === ME)) a.waitlist.push({ id: ME, offeredUntil: null });
          return { waitlisted: true };
        }
        if (!mineRec) {
          mineRec = { id: ME, rsvp: "pending", guest: false };
          a.attendees.push(mineRec);
        }
        mineRec.rsvp = rsvp;
        if (rsvp === "going") a.waitlist = a.waitlist.filter((x) => x.id !== ME);
        if (rsvp !== "going" && rsvp !== "maybe") a.calendarBlock.delete(ME);
        if (wasGoing && rsvp !== "going") offerSpot(a);
        return { waitlisted: false };
      },
      async joinWaitlist(id) {
        const a = requireActivity(id);
        if (!a.waitlist.some((x) => x.id === ME)) a.waitlist.push({ id: ME, offeredUntil: null });
      },
      async leaveWaitlist(id) {
        const a = requireActivity(id);
        a.waitlist = a.waitlist.filter((x) => x.id !== ME);
        offerSpot(a);
      },
      async acceptOffer(id) {
        const a = requireActivity(id);
        const first = a.waitlist[0];
        if (!first || first.id !== ME || !first.offeredUntil || first.offeredUntil < nowIso) throw new SocialError("conflict");
        a.waitlist.shift();
        const mineRec = attendeeOf(a);
        if (mineRec) mineRec.rsvp = "going";
        else a.attendees.push({ id: ME, rsvp: "going", guest: false });
      },
      async cancel(id, reason) {
        const a = requireActivity(id);
        if (!canManageActivity(a)) throw new SocialError("forbidden");
        if (!reason.trim()) throw new SocialError("invalid");
        a.status = "cancelled";
        a.cancelReason = reason.trim();
        a.cancelledById = ME;
        a.calendarBlock.clear();
      },
      async addItineraryItem(id, day, item) {
        const a = requireActivity(id);
        if (!canManageActivity(a)) throw new SocialError("forbidden");
        if (!item.title.trim() || day < a.startDay || day > a.endDay) throw new SocialError("invalid");
        let d = a.itinerary.find((x) => x.day === day);
        if (!d) {
          d = { day, items: [] };
          a.itinerary.push(d);
          a.itinerary.sort((x, y) => x.day.localeCompare(y.day));
        }
        d.items.push({ id: nextId("it"), ...item, title: item.title.trim() });
        d.items.sort((x, y) => (x.time ?? "99").localeCompare(y.time ?? "99"));
      },
      async setCalendarBlock(id, on) {
        const a = requireActivity(id);
        const r = attendeeOf(a)?.rsvp;
        if (on && r !== "going" && r !== "maybe") throw new SocialError("conflict");
        if (on) a.calendarBlock.add(ME);
        else a.calendarBlock.delete(ME);
      },
      async projections(from, to) {
        // Going / Maybe activities appear in the Personal calendar (source chip = group or organiser).
        return [...activities.values()]
          .filter((a) => a.status === "planned" && a.endDay >= from && a.startDay <= to)
          .filter((a) => {
            const r = attendeeOf(a)?.rsvp;
            return r === "going" || r === "maybe";
          })
          .map((a) => ({
            activityId: a.id,
            title: a.title,
            source: a.groupId ? (groups.get(a.groupId)?.name ?? "") : person(a.organiserId).name,
            startDay: a.startDay,
            endDay: a.endDay,
            startTime: a.startTime,
            rsvp: attendeeOf(a)!.rsvp as "going" | "maybe",
          }));
      },
    },
    checklist: {
      async add(id, title) {
        const a = requireActivity(id);
        if (!title.trim()) throw new SocialError("invalid");
        if (attendeeOf(a)?.guest) throw new SocialError("forbidden");
        a.checklist.push({ id: nextId("ck"), title: title.trim(), done: false, assigneeId: null, taskId: null });
      },
      async toggle(id, itemId) {
        const a = requireActivity(id);
        const item = a.checklist.find((c) => c.id === itemId);
        if (!item) throw new SocialError("not-found");
        if (item.assigneeId !== null && item.assigneeId !== ME && !canManageActivity(a)) throw new SocialError("forbidden");
        item.done = !item.done;
      },
      async claim(id, itemId) {
        const a = requireActivity(id);
        const item = a.checklist.find((c) => c.id === itemId);
        if (!item) throw new SocialError("not-found");
        if (item.assigneeId !== null && item.assigneeId !== ME) throw new SocialError("conflict");
        item.assigneeId = item.assigneeId === ME ? null : ME;
      },
      async linkTask(id, itemId, taskId) {
        const a = requireActivity(id);
        const item = a.checklist.find((c) => c.id === itemId);
        if (!item) throw new SocialError("not-found");
        if (item.taskId === null) {
          item.taskId = taskId;
          item.assigneeId = ME;
        }
      },
    },
    files: {
      async list(activityId) {
        const files = requireActivity(activityId).files.map(fileView);
        return { folders: [], files, total: files.length };
      },
      async upload(activityId, input) {
        const a = requireActivity(activityId);
        if (!activityDetail(a).capabilities.uploadFiles) throw new SocialError("forbidden");
        const existing = input.asNewVersionOf ? a.files.find((f) => f.id === input.asNewVersionOf) : undefined;
        if (existing) {
          const versions = existing.versions ?? [{ version: 1, byId: existing.byId, at: existing.at ?? stamp() }];
          existing.versions = [...versions, { version: versions.length + 1, byId: ME, at: stamp() }];
          existing.bytes = input.sizeBytes;
          existing.at = stamp();
          return fileView(existing);
        }
        const rec = { id: nextId("f"), name: input.name, bytes: input.sizeBytes, byId: ME, at: stamp() };
        // Limits come from the server; the mock blocks oversize and executable files without storing them.
        const blocked = input.sizeBytes > FILE_MAX_BYTES ? "size" : BLOCKED_FILE.test(input.name) ? "type" : null;
        if (blocked) return { ...fileView(rec), state: "blocked", blockReason: blocked };
        a.files.push(rec);
        return fileView(rec);
      },
      async cancel(activityId, fileId) {
        const a = requireActivity(activityId);
        a.files = a.files.filter((f) => !(f.id === fileId && f.byId === ME));
      },
      async retry(activityId, fileId) {
        const f = requireActivity(activityId).files.find((x) => x.id === fileId);
        if (!f) throw new SocialError("not-found");
        return fileView(f);
      },
      async restoreVersion(activityId, fileId, version) {
        const f = requireActivity(activityId).files.find((x) => x.id === fileId);
        if (!f) throw new SocialError("not-found");
        const versions = f.versions ?? [{ version: 1, byId: f.byId, at: f.at ?? stamp() }];
        if (!versions.some((v) => v.version === version)) throw new SocialError("invalid");
        f.versions = [...versions, { version: versions.length + 1, byId: ME, at: stamp(), restoredFrom: version }];
        return fileView(f);
      },
      async download(activityId, fileId) {
        const f = requireActivity(activityId).files.find((x) => x.id === fileId);
        if (!f) throw new SocialError("not-found");
        return new Blob(["mock file " + f.name], { type: "application/octet-stream" });
      },
    },
    polls: {
      async get(pollId) {
        const p = polls.get(pollId);
        if (!p) throw new SocialError("not-found");
        const a = requireActivity(p.activityId);
        const mine = p.votes.get(ME) ?? {};
        const voted = p.votes.has(ME);
        const visible = p.closed || !p.resultsAfterVote || voted;
        return {
          id: p.id,
          activityId: p.activityId,
          kind: p.kind,
          question: p.question,
          options: p.options.map((o) => {
            const votes = [...p.votes].filter(([, vs]) => vs[o.id]);
            return {
              ...o,
              yes: visible ? votes.filter(([, vs]) => vs[o.id] === "yes").length : 0,
              ifNeeded: visible ? votes.filter(([, vs]) => vs[o.id] === "if-needed").length : 0,
              voters: visible && !p.anonymous ? votes.map(([pid, vs]) => ({ person: person(pid), vote: vs[o.id]! })) : [],
            };
          }),
          myVotes: { ...mine },
          deadline: p.deadline,
          closed: p.closed,
          finalOptionId: p.finalOptionId,
          anonymous: p.anonymous,
          resultsVisible: visible,
          respondents: p.votes.size,
          invited: a.attendees.length,
          canClose: canManageActivity(a),
        };
      },
      async vote(pollId, votes) {
        const p = polls.get(pollId);
        if (!p) throw new SocialError("not-found");
        requireActivity(p.activityId);
        if (p.closed) throw new SocialError("conflict");
        const ids = new Set(p.options.map((o) => o.id));
        const clean = Object.fromEntries(Object.entries(votes).filter(([id, vote]) => ids.has(id) && (vote === "yes" || (p.kind === "date" && vote === "if-needed"))));
        if (Object.keys(clean).length !== Object.keys(votes).length) throw new SocialError("invalid");
        if (p.kind === "single" && Object.keys(clean).length > 1) throw new SocialError("invalid");
        p.votes.set(ME, clean);
      },
      async close(pollId) {
        const p = polls.get(pollId);
        if (!p) throw new SocialError("not-found");
        if (!canManageActivity(requireActivity(p.activityId))) throw new SocialError("forbidden");
        p.closed = true;
      },
      async pickFinal(pollId, optionId) {
        const p = polls.get(pollId);
        if (!p) throw new SocialError("not-found");
        const a = requireActivity(p.activityId);
        if (!canManageActivity(a)) throw new SocialError("forbidden");
        const option = p.options.find((o) => o.id === optionId);
        if (!option || p.kind !== "date") throw new SocialError("invalid");
        p.closed = true;
        p.finalOptionId = optionId;
        if (p.kind === "date" && option.day) {
          // Activity dates set; RSVPs asked again.
          const span = Math.round((Date.parse(a.endDay) - Date.parse(a.startDay)) / 86_400_000);
          a.startDay = option.day;
          a.endDay = addDays(option.day, span);
          if (option.startTime) a.startTime = option.startTime;
          for (const x of a.attendees) if (x.id !== a.organiserId && x.rsvp !== "declined") x.rsvp = "pending";
        }
      },
    },
    freeBusy: {
      async range(activityId) {
        const a = requireActivity(activityId);
        const state = freeBusy.get(activityId) ?? { consents: new Map(), incoming: new Map() };
        const poll = a.pollId ? polls.get(a.pollId) : undefined;
        const days = poll?.kind === "date" ? [...new Set(poll.options.map((o) => o.day!))] : [a.startDay];
        const slots = ["09–12", "14–17", "18–21"];
        const people = [ME, ...a.attendees.map((x) => x.id).filter((id) => id !== ME)];
        const busy = (pid: string, day: string, slot: number): FreeBusyCell => {
          // Deterministic busy pattern standing in for the person's own calendars (server-side; no titles).
          const h = [...`${pid}${day}${slot}`].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 997, 7);
          return h % 3 === 0 ? "busy" : "free";
        };
        const fromIncoming = state.incoming.get(ME);
        return {
          slots,
          rows: people.map((pid) => {
            const consent = pid === ME ? (state.consents.get(ME) ?? "none") : (state.consents.get(pid) ?? "none");
            return {
              person: person(pid),
              consent,
              days: days.map((day) => ({ day, slots: slots.map((_, i) => (consent === "shared" ? busy(pid, day, i) : "not-shared")) })),
            };
          }),
          incomingRequest: fromIncoming && state.consents.get(ME) !== "shared" && state.consents.get(ME) !== "declined" ? { from: person(fromIncoming), range: { from: days[0]!, to: days[days.length - 1]! } } : null,
        };
      },
      async request(activityId, personId) {
        requireActivity(activityId);
        const state = freeBusy.get(activityId) ?? { consents: new Map(), incoming: new Map() };
        freeBusy.set(activityId, state);
        if (state.consents.get(personId) !== "shared") state.consents.set(personId, "requested");
      },
      async share(activityId, share) {
        requireActivity(activityId);
        const state = freeBusy.get(activityId) ?? { consents: new Map(), incoming: new Map() };
        freeBusy.set(activityId, state);
        state.consents.set(ME, share ? "shared" : "declined");
      },
    },
    expenses: {
      async scopes(groupId) {
        const g = requireGroup(groupId);
        const acts = [...activities.values()].filter((a) => a.groupId === groupId && [...expenses.values()].some((e) => e.activityId === a.id));
        return [{ scope: { kind: "group", id: g.id }, name: g.name }, ...acts.map((a) => ({ scope: { kind: "activity" as const, id: a.id }, name: a.title }))];
      },
      async list(scope) {
        const role = scopeRole(scope);
        return [...expenses.values()]
          .filter((e) => inScope(e, scope))
          // Activity guests and former members see only the expenses they take part in.
          .filter((e) => (scope.kind === "activity" && attendeeOf(activities.get(scope.id)!)?.guest) || !role.member ? takesPart(e) : true)
          .sort((a, b) => b.current.day.localeCompare(a.current.day) || a.id.localeCompare(b.id))
          .map((e) => expenseView(e, role));
      },
      async get(expenseId) {
        const e = expenses.get(expenseId);
        if (!e) throw new SocialError("not-found");
        const role = scopeRole(e.scope);
        if (!role.member && !takesPart(e)) throw new SocialError("not-found");
        return expenseView(e, role);
      },
      async participants(scope) {
        scopeRole(scope);
        return scopePeople(scope).map(person);
      },
      async propose(input) {
        const existing = [...expenses.values()].find((e) => e.clientOpId === input.clientOpId);
        if (existing) return existing.id;
        const scope = scopeRef(input.scope);
        const role = scopeRole(input.scope);
        if (!role.member) throw new SocialError("forbidden");
        validateVersion(input.scope, input);
        if (input.receipt && input.receipt.bytes > ALBUM_MAX_BYTES) throw new SocialError("too-large");
        const id = nextId("x");
        const activityId = input.activityId ?? (input.scope.kind === "activity" ? input.scope.id : null);
        expenses.set(id, {
          id,
          scope,
          activityId,
          status: "proposed",
          current: { title: input.title.trim(), amount: input.amount, payerId: input.payerId, day: input.day, split: clone(input.split) },
          pendingEdit: null,
          proposerId: ME,
          rejectReason: null,
          receipt: input.receipt,
          revisions: [{ at: stamp(), byId: ME, kind: "proposed", amount: input.amount, note: "" }],
          settled: false,
          clientOpId: input.clientOpId,
        });
        return id;
      },
      async approve(expenseId) {
        const e = expenses.get(expenseId);
        if (!e) throw new SocialError("not-found");
        if (!scopeRole(e.activityId && e.scope.kind === "group" ? { kind: "activity", id: e.activityId } : e.scope).approver) throw new SocialError("forbidden");
        if (e.status !== "proposed") throw new SocialError("conflict");
        e.status = "approved";
        e.revisions.push({ at: stamp(), byId: ME, kind: "approved", amount: e.current.amount, note: "" });
        const g = e.scope.kind === "group" ? live(e.scope.id) : undefined;
        if (g) event(g, "expense-approved", e.current.title);
      },
      async editAndApprove(expenseId, patch) {
        const e = expenses.get(expenseId);
        if (!e) throw new SocialError("not-found");
        if (!scopeRole(e.activityId && e.scope.kind === "group" ? { kind: "activity", id: e.activityId } : e.scope).approver) throw new SocialError("forbidden");
        if (e.status !== "proposed") throw new SocialError("conflict");
        validateVersion(e.scope, patch);
        e.current = { ...clone(patch), title: patch.title.trim() };
        e.status = "approved";
        e.revisions.push({ at: stamp(), byId: ME, kind: "edited-approved", amount: patch.amount, note: "" });
      },
      async reject(expenseId, reason) {
        const e = expenses.get(expenseId);
        if (!e) throw new SocialError("not-found");
        if (!scopeRole(e.activityId && e.scope.kind === "group" ? { kind: "activity", id: e.activityId } : e.scope).approver) throw new SocialError("forbidden");
        if (e.status !== "proposed") throw new SocialError("conflict");
        if (!reason.trim()) throw new SocialError("invalid", "reason required");
        e.status = "rejected";
        e.rejectReason = reason.trim();
        e.revisions.push({ at: stamp(), byId: ME, kind: "rejected", amount: e.current.amount, note: reason.trim() });
      },
      async revise(expenseId, patch, note) {
        const e = expenses.get(expenseId);
        if (!e) throw new SocialError("not-found");
        const view = expenseView(e);
        if (!view.canEdit) throw new SocialError(e.pendingEdit ? "conflict" : "forbidden");
        validateVersion(e.scope, patch);
        e.pendingEdit = { ...clone(patch), title: patch.title.trim(), byId: ME, note: note.trim() };
        e.revisions.push({ at: stamp(), byId: ME, kind: "edit-proposed", amount: patch.amount, note: note.trim() });
      },
      async decideEdit(expenseId, approve) {
        const e = expenses.get(expenseId);
        if (!e || !e.pendingEdit) throw new SocialError("not-found");
        if (!scopeRole(e.activityId && e.scope.kind === "group" ? { kind: "activity", id: e.activityId } : e.scope).approver) throw new SocialError("forbidden");
        const edit = e.pendingEdit;
        e.pendingEdit = null;
        if (!approve) {
          e.revisions.push({ at: stamp(), byId: ME, kind: "edit-rejected", amount: edit.amount, note: "" });
          return;
        }
        const delta = edit.amount - e.current.amount;
        e.current = { title: edit.title, amount: edit.amount, payerId: edit.payerId, day: edit.day, split: edit.split };
        e.revisions.push({ at: stamp(), byId: ME, kind: "edit-approved", amount: edit.amount, note: edit.note });
        // A settled item is never silently changed: the correction is an adjustment line.
        if (e.settled) {
          e.revisions.push({ at: stamp(), byId: ME, kind: "adjustment", amount: delta, note: "" });
          e.settled = false;
        }
      },
      async claimFinancePosting(key) {
        if (financeClaims.has(key)) return false;
        financeClaims.add(key);
        return true;
      },
      async releaseFinancePosting(key) {
        financeClaims.delete(key);
      },
    },
    balances: {
      async forScope(scope) {
        return balanceFor(scope);
      },
      async mine(groupId) {
        return balanceFor({ kind: "group", id: groupId });
      },
      async mineAll() {
        const scopes: ExpenseScope[] = [
          ...[...groups.values()].filter((g) => !g.deleted && (memberOf(g) || g.formerMembers.includes(ME))).map((g) => ({ kind: "group" as const, id: g.id })),
          ...[...activities.values()].filter((a) => a.groupId === null && canSeeActivity(a)).map((a) => ({ kind: "activity" as const, id: a.id })),
        ];
        return scopes
          .map(balanceFor)
          .filter((b) => b.counted > 0 || b.mine.net !== 0)
          .filter((b) => b.scope.kind === "activity" || memberOf(groups.get(b.scope.id)!) || b.mine.net !== 0);
      },
      async between(personId) {
        const out = new Map<SocialCurrency, number>();
        const scopes: ExpenseScope[] = [
          ...myGroupIds().map((id) => ({ kind: "group" as const, id })),
          ...[...activities.values()].filter((a) => a.groupId === null && canSeeActivity(a)).map((a) => ({ kind: "activity" as const, id: a.id })),
        ];
        for (const scope of scopes) {
          if (!scopePeople(scope).includes(personId)) continue;
          const b = balanceFor(scope);
          for (const t of b.transfers) {
            if (t.fromId === personId && t.toId === ME) out.set(b.currency, (out.get(b.currency) ?? 0) + t.amount);
            if (t.fromId === ME && t.toId === personId) out.set(b.currency, (out.get(b.currency) ?? 0) - t.amount);
          }
        }
        return [...out].filter(([, net]) => net !== 0).map(([currency, net]) => ({ currency, net }));
      },
    },
    settlements: {
      async list(scope) {
        return [...settlements.values()]
          .filter((s) => s.fromId === ME || s.toId === ME || (scope !== null && scopeRole(scope).seeAll))
          .filter((s) => scope === null || settlementInScope(s, scope))
          .sort((a, b) => b.at.localeCompare(a.at))
          .map(settlementView);
      },
      async record(input) {
        const existing = [...settlements.values()].find((s) => s.clientOpId === input.clientOpId);
        if (existing) return existing.id;
        scopeRole(input.scope);
        const people = scopePeople(input.scope);
        if (!isInt(input.amount) || input.fromId === input.toId || !people.includes(input.fromId) || !people.includes(input.toId)) throw new SocialError("invalid");
        if (input.fromId !== ME && input.toId !== ME) throw new SocialError("forbidden");
        const id = nextId("s");
        settlements.set(id, { id, scope: clone(input.scope), fromId: input.fromId, toId: input.toId, amount: input.amount, note: input.note.trim(), recordedById: ME, status: "recorded", disputeNote: null, at: stamp(), confirmedAt: null, clientOpId: input.clientOpId });
        return id;
      },
      async confirm(id) {
        const s = settlements.get(id);
        if (!s) throw new SocialError("not-found");
        if (!settlementView(s).awaitingMe) throw new SocialError("forbidden");
        s.status = "confirmed";
        s.confirmedAt = stamp();
        s.disputeNote = null;
        const g = s.scope.kind === "group" ? live(s.scope.id) : undefined;
        if (g) event(g, "settled", person(s.fromId).name);
      },
      async dispute(id, note) {
        const s = settlements.get(id);
        if (!s) throw new SocialError("not-found");
        if (!settlementView(s).awaitingMe) throw new SocialError("forbidden");
        if (!note.trim()) throw new SocialError("invalid");
        s.status = "disputed";
        s.disputeNote = note.trim();
      },
    },
    lending: {
      async groupThings(groupId) {
        const g = live(groupId);
        const guest = g && [...activities.values()].some((a) => a.groupId === groupId && attendeeOf(a)?.guest);
        if (!g || (!memberOf(g) && !guest)) throw new SocialError("not-found");
        return [...things.values()].filter((t) => t.groupId === groupId || t.sharedWith.includes(groupId)).map(thingView);
      },
      async mine() {
        return [...things.values()].filter((t) => t.ownerId === ME).map(thingView);
      },
      async loans(groupId) {
        return [...loans.values()]
          .filter((l) => l.lenderId === ME || l.borrowerId === ME || (groupId !== null && l.groupId === groupId))
          .filter((l) => groupId === null || l.groupId === groupId)
          .map(loanView)
          .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.due.localeCompare(b.due));
      },
      async addThing(input) {
        if (!input.name.trim()) throw new SocialError("invalid");
        if (input.groupId) requireGroup(input.groupId);
        const id = nextId("t");
        things.set(id, { id, name: input.name.trim(), category: input.category, condition: input.condition.trim(), notes: input.notes.trim(), ownerId: input.groupId ? null : ME, groupId: input.groupId, keeperId: ME, sharedWith: [] });
        return id;
      },
      async share(thingId, groupId, shared) {
        const t = things.get(thingId);
        if (!t || t.ownerId !== ME) throw new SocialError("not-found");
        requireGroup(groupId);
        t.sharedWith = shared ? [...new Set([...t.sharedWith, groupId])] : t.sharedWith.filter((id) => id !== groupId);
      },
      async request(thingId, from, due, place) {
        const t = things.get(thingId);
        if (!t) throw new SocialError("not-found");
        const groupId = t.groupId ?? t.sharedWith.find((gid) => myGroupIds().includes(gid)) ?? null;
        if (!groupId) throw new SocialError("not-found");
        if (t.keeperId === ME || activeLoan(thingId)) throw new SocialError("conflict");
        if (!from || due < from) throw new SocialError("invalid");
        const id = nextId("l");
        loans.set(id, { id, thingId, lenderId: t.keeperId, borrowerId: ME, groupId, from, due, place: place.trim(), status: "requested", handover: step(null, null), ret: step(null, null), issues: [] });
        return id;
      },
      async lendTo(thingId, personId, due, place) {
        const t = things.get(thingId);
        if (!t || t.ownerId !== ME) throw new SocialError("not-found");
        if (!connections.has(personId)) throw new SocialError("forbidden");
        if (activeLoan(thingId)) throw new SocialError("conflict");
        if (due < today) throw new SocialError("invalid");
        const id = nextId("l");
        loans.set(id, { id, thingId, lenderId: ME, borrowerId: personId, groupId: null, from: today, due, place: place.trim(), status: "accepted", handover: step(null, null), ret: step(null, null), issues: [] });
        return id;
      },
      async accept(loanId, accept) {
        const l = requireLoanParty(loanId);
        if (l.lenderId !== ME || l.status !== "requested") throw new SocialError("forbidden");
        l.status = accept ? "accepted" : "declined";
      },
      async step(loanId) {
        const l = requireLoanParty(loanId);
        const next = loanStep(l);
        const t = stamp();
        if (next === "record-handover") l.handover.recordedAt = t;
        else if (next === "confirm-handover") {
          l.handover.confirmedAt = t;
          l.status = "out";
        } else if (next === "record-return") l.ret.recordedAt = t;
        else if (next === "confirm-return") {
          l.ret.confirmedAt = t;
          l.status = "returned";
        } else throw new SocialError("forbidden");
      },
      async reportIssue(loanId, kind, note) {
        const l = requireLoanParty(loanId);
        if (!note.trim()) throw new SocialError("invalid");
        l.issues.push({ id: nextId("is"), kind, note: note.trim(), byId: ME, at: stamp(), lender: false, borrower: false });
      },
      async resolveIssue(loanId, issueId) {
        const l = requireLoanParty(loanId);
        const issue = l.issues.find((i) => i.id === issueId);
        if (!issue) throw new SocialError("not-found");
        if (l.lenderId === ME) issue.lender = true;
        if (l.borrowerId === ME) issue.borrower = true;
      },
    },
    lostFound: {
      async list(groupId) {
        const ids = groupId ? [requireGroup(groupId).id] : myGroupIds();
        return [...posts.values()]
          .filter((p) => ids.includes(p.groupId))
          .filter((p) => groupId !== null || p.byId === ME || p.claim?.byId === ME)
          .map((p) => ({
            id: p.id,
            group: { id: p.groupId, name: groups.get(p.groupId)!.name },
            kind: p.kind,
            title: p.title,
            note: p.note,
            by: person(p.byId),
            at: p.at,
            claim: p.claim ? { by: person(p.claim.byId), at: p.claim.at } : null,
            confirmedByPoster: p.poster,
            confirmedByClaimer: p.claimer,
            resolved: p.poster && p.claimer,
            mine: p.byId === ME,
          }))
          .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.at.localeCompare(a.at));
      },
      async post(groupId, kind, title, note) {
        requireGroup(groupId);
        if (!title.trim()) throw new SocialError("invalid");
        const id = nextId("lf");
        posts.set(id, { id, groupId, kind, title: title.trim(), note: note.trim(), byId: ME, at: stamp(), claim: null, poster: false, claimer: false });
      },
      async claim(postId) {
        const p = posts.get(postId);
        if (!p) throw new SocialError("not-found");
        requireGroup(p.groupId);
        if (p.byId === ME || p.claim) throw new SocialError("conflict");
        p.claim = { byId: ME, at: stamp() };
        p.claimer = true;
      },
      async confirm(postId) {
        const p = posts.get(postId);
        if (!p || !p.claim) throw new SocialError("not-found");
        if (p.byId === ME) p.poster = true;
        else if (p.claim.byId === ME) p.claimer = true;
        else throw new SocialError("forbidden");
      },
    },
    albums: {
      async list(groupId) {
        requireGroup(groupId);
        return [...albums.values()]
          .filter((a) => a.groupId === groupId)
          .map((a): Album => {
            const list = [...photos.values()].filter((p) => p.albumId === a.id);
            const act = a.activityId ? activities.get(a.activityId) : undefined;
            return { id: a.id, groupId, activity: act ? { id: act.id, title: act.title } : null, title: a.title, photoCount: list.length, cover: list[0] ? { url: list[0].url, hue: list[0].hue } : null };
          });
      },
      async photos(albumId) {
        const a = albums.get(albumId);
        if (!a) throw new SocialError("not-found");
        const g = requireGroup(a.groupId);
        const admin = isAdmin(g);
        return [...photos.values()]
          .filter((p) => p.albumId === albumId)
          .map((p): Photo => ({
            id: p.id,
            uploader: person(p.uploaderId),
            name: p.name,
            bytes: p.bytes,
            url: p.url,
            hue: p.hue,
            at: p.at,
            locationStripped: true,
            canRemove: p.uploaderId === ME || admin,
            canDownloadOriginal: p.uploaderId === ME || admin || !g.settings.originalsUploaderOnly,
          }));
      },
      async create(groupId, title) {
        requireGroup(groupId);
        if (!title.trim()) throw new SocialError("invalid");
        const id = nextId("al");
        albums.set(id, { id, groupId, activityId: null, title: title.trim() });
        return id;
      },
      async upload(albumId, file, onProgress) {
        const a = albums.get(albumId);
        if (!a) throw new SocialError("not-found");
        requireGroup(a.groupId);
        if (file.bytes > ALBUM_MAX_BYTES) throw new SocialError("too-large");
        for (const p of [0.25, 0.5, 0.75, 1]) onProgress?.(p);
        const id = nextId("ph");
        const rec: PhotoRec = { id, albumId, uploaderId: ME, name: file.name, bytes: file.bytes, url: file.url, hue: (photos.size * 37) % 360, at: stamp() };
        photos.set(id, rec);
        const g = groups.get(a.groupId)!;
        event(g, "photos", a.title);
        return { id, uploader: person(ME), name: rec.name, bytes: rec.bytes, url: rec.url, hue: rec.hue, at: rec.at, locationStripped: true, canRemove: true, canDownloadOriginal: true };
      },
      async remove(photoId) {
        const p = photos.get(photoId);
        if (!p) throw new SocialError("not-found");
        const g = requireGroup(albums.get(p.albumId)!.groupId);
        if (p.uploaderId !== ME && !isAdmin(g)) throw new SocialError("forbidden");
        photos.delete(photoId);
      },
    },
    challenges: {
      async list(groupId) {
        requireGroup(groupId);
        return [...challenges.values()]
          .filter((c) => c.groupId === groupId)
          .map((c): Challenge => {
            const joined = c.participants.has(ME);
            const totals = new Map<string, number>();
            for (const e of c.entries) if (c.participants.has(e.personId)) totals.set(e.personId, (totals.get(e.personId) ?? 0) + e.amount);
            return {
              id: c.id,
              groupId,
              title: c.title,
              unit: c.unit,
              target: c.target,
              startDay: c.startDay,
              endDay: c.endDay,
              total: [...totals.values()].reduce((a, b) => a + b, 0),
              participants: c.participants.size,
              joined,
              myTotal: totals.get(ME) ?? 0,
              // S9: individual totals A–Z, never ranked.
              individualTotals: c.individualTotals ? [...c.participants].map((pid) => ({ person: person(pid), total: totals.get(pid) ?? 0 })).sort((a, b) => a.person.name.localeCompare(b.person.name)) : null,
              myEntries: c.entries.filter((e) => e.personId === ME).map((e) => ({ id: e.id, day: e.day, amount: e.amount })),
            };
          });
      },
      async join(id) {
        const c = challenges.get(id);
        if (!c) throw new SocialError("not-found");
        requireGroup(c.groupId);
        c.participants.add(ME);
      },
      async leave(id) {
        const c = challenges.get(id);
        if (!c) throw new SocialError("not-found");
        c.participants.delete(ME);
      },
      async log(id, amount, day) {
        const c = challenges.get(id);
        if (!c) throw new SocialError("not-found");
        requireGroup(c.groupId);
        if (!c.participants.has(ME)) throw new SocialError("forbidden");
        if (!isInt(amount) || day < c.startDay || day > c.endDay) throw new SocialError("invalid");
        c.entries.push({ id: nextId("e"), personId: ME, day, amount });
      },
      async create(groupId, input) {
        requireGroup(groupId);
        if (!input.title.trim() || !input.unit.trim() || !isInt(input.target) || input.endDay < today) throw new SocialError("invalid");
        const id = nextId("ch");
        challenges.set(id, { id, groupId, title: input.title.trim(), unit: input.unit.trim(), target: input.target, startDay: today, endDay: input.endDay, participants: new Set([ME]), entries: [], individualTotals: false });
        return id;
      },
      async setIndividualTotals(id, on) {
        const c = challenges.get(id);
        if (!c) throw new SocialError("not-found");
        if (memberOf(requireGroup(c.groupId))?.role !== "owner") throw new SocialError("forbidden");
        c.individualTotals = on;
      },
    },
    inbox: {
      async list() {
        const items: NeedsYouItem[] = [];
        for (const r of requests.values()) {
          if (r.direction === "incoming") items.push({ id: `n-${r.id}`, kind: "connection", person: person(r.personId), subject: r.note, scopeName: "", href: socialHref.connections, money: null });
        }
        for (const s of settlements.values()) {
          const view = settlementView(s);
          if (view.awaitingMe) items.push({ id: `n-${s.id}`, kind: "payment", person: person(s.recordedById), subject: s.note, scopeName: view.scopeName, href: socialHref.settle(s.scope), money: { amount: s.amount, currency: view.currency } });
        }
        for (const l of loans.values()) {
          const view = loanView(l);
          if (view.overdue) items.push({ id: `n-${l.id}`, kind: "overdue", person: view.iAmLender ? view.borrower : view.lender, subject: view.thing.name, scopeName: view.group?.name ?? "", href: view.group ? socialHref.group(view.group.id, "lending") : socialHref.lending, money: null });
        }
        const pollActivities = new Set<string>();
        for (const p of polls.values()) {
          const a = activities.get(p.activityId);
          if (a && !pollActivities.has(a.id) && canSeeActivity(a) && !p.closed && !p.votes.has(ME) && pollActivities.add(a.id)) items.push({ id: `n-${p.id}`, kind: "poll", person: person(a.organiserId), subject: a.title, scopeName: a.groupId ? (groups.get(a.groupId)?.name ?? "") : "", href: socialHref.poll(a.id), money: null });
        }
        for (const e of expenses.values()) {
          let role: ReturnType<typeof scopeRole>;
          try {
            role = scopeRole(e.activityId && e.scope.kind === "group" ? { kind: "activity", id: e.activityId } : e.scope);
          } catch {
            continue;
          }
          if (role.approver && (e.status === "proposed" || e.pendingEdit)) {
            items.push({ id: `n-${e.id}`, kind: "approve-expense", person: person(e.pendingEdit?.byId ?? e.proposerId), subject: e.current.title, scopeName: scopeName(e.scope), href: socialHref.expense(e.scope, e.id), money: { amount: e.pendingEdit?.amount ?? e.current.amount, currency: currencyOf(e.scope) } });
          }
        }
        for (const g of groups.values()) {
          if (g.deleted || !memberOf(g) || !isAdmin(g)) continue;
          for (const r of g.requests) items.push({ id: `n-${r.id}`, kind: "join-request", person: person(r.personId), subject: r.note, scopeName: g.name, href: socialHref.group(g.id, "members"), money: null });
        }
        return items;
      },
    },
  };
  return repo;
}
