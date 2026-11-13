import type { ChannelPolicy, MsgPerson, MsgSource, Rsvp } from "@/data/messaging-domain";

/*
 * SAMPLE DATA for Messages & Meetings (Phase 5 boards MS01–MT04). Times are
 * Tehran local (+03:30) around the sample "now" (Tue 21 Mehr 1405 · 13 Oct
 * 2026, 14:35). Names and message text are data, never translated. The mock
 * server (src/data/mock/mock-messaging.ts) owns every rule over this seed.
 */

const at = (day: string, time: string) => `${day}T${time}:00+03:30`;
export const D = {
  today: "2026-10-13",
  yesterday: "2026-10-12",
  sat: "2026-10-10",
  joined: "2026-10-04",
  older: "2026-09-28",
  tomorrow: "2026-10-14",
  thu: "2026-10-15",
  nextWeek: "2026-10-19",
  twoDaysAgo: "2026-10-11",
  lastWeek: "2026-10-06",
} as const;
export { at as fixtureAt };

const person = (id: string, name: string, initials: string, extra: Partial<MsgPerson> = {}): MsgPerson => ({ id, name, initials, ...extra });

export const msgPeople: Record<string, MsgPerson> = {
  me: person("me", "Mehran R.", "MR"),
  nazanin: person("nazanin", "Nazanin A.", "NA"),
  kian: person("kian", "Kian F.", "KF"),
  sara: person("sara", "Sara P.", "SP"),
  harry: person("harry", "Harry M.", "HM"),
  reza: person("reza", "Reza B.", "RB"),
  mom: person("mom", "Mom", "M"),
  dad: person("dad", "Dad", "D"),
  leila: person("leila", "Leila K.", "LK"),
  omid: person("omid", "Omid S.", "OS"),
  tara: person("tara", "Tara J.", "TJ"),
  // Social (Phase 6) people: friends and group members who share no workspace.
  arman: person("arman", "Arman M.", "AM"),
  babak: person("babak", "Babak H.", "BH"),
  javad: person("javad", "Javad K.", "JK"),
  parisa: person("parisa", "Parisa Z.", "PZ"),
  darya: person("darya", "Darya N.", "DN"),
  jamal: person("jamal", "Jamal R.", "JR"),
  shirin: person("shirin", "Shirin V.", "SV"),
  gone: person("gone", "Former member", "?", { deleted: true }),
};

export const msgSources = {
  personal: { kind: "personal", workspaceId: null, name: "" },
  website: { kind: "project", workspaceId: "website-redesign", name: "Website Redesign" },
  design: { kind: "team", workspaceId: "design", name: "Design Team" },
  euroly: { kind: "company", workspaceId: "euroly", name: "Euroly" },
} as const satisfies Record<string, MsgSource>;

/** Messaging-side workspace roster and admins (no implicit rights from other contexts). */
export const msgWorkspaces: { source: MsgSource; members: string[]; admins: string[]; publishers: string[]; defaults: Omit<ChannelPolicy, "inherited">; attendeesEditAgenda: boolean; busyVisible: boolean; audiences: { label: string; memberIds: string[] }[] }[] = [
  {
    source: msgSources.website,
    members: ["me", "kian", "sara", "leila", "omid", "tara", "harry", "nazanin", "gone"],
    admins: ["me", "leila"],
    publishers: ["me", "leila"],
    defaults: { authorDeleteForEveryone: false, newcomerHistory: "from-join", membersCanPin: false, mandatory: false, setBy: "Website Redesign", adminsOnlyPost: false },
    attendeesEditAgenda: true,
    busyVisible: true,
    audiences: [
      { label: "Design & content", memberIds: ["me", "sara", "tara", "leila"] },
      { label: "Engineering", memberIds: ["me", "kian", "omid"] },
    ],
  },
  {
    source: msgSources.design,
    members: ["me", "harry", "sara", "tara", "leila"],
    admins: ["me"],
    publishers: ["me"],
    defaults: { authorDeleteForEveryone: true, newcomerHistory: "full", membersCanPin: true, mandatory: false, setBy: "Design Team", adminsOnlyPost: false },
    attendeesEditAgenda: true,
    busyVisible: true,
    audiences: [{ label: "Leads", memberIds: ["me", "harry"] }],
  },
  {
    source: msgSources.euroly,
    members: ["me", "kian", "omid", "leila", "tara", "harry"],
    admins: ["leila"],
    publishers: ["leila"],
    defaults: { authorDeleteForEveryone: false, newcomerHistory: "full", membersCanPin: false, mandatory: true, setBy: "Euroly", adminsOnlyPost: false },
    attendeesEditAgenda: false,
    busyVisible: false,
    audiences: [{ label: "Engineering department", memberIds: ["me", "kian", "omid"] }],
  },
];

/** People who share no workspace but are connections (Phase 6 placeholder list). */
export const msgConnections: Record<string, string[]> = {
  // + Social (Phase 6) friends and group members, so DMs and group chat work (SO-02 / SO-04).
  me: ["nazanin", "mom", "dad", "reza", "arman", "babak", "javad", "kian", "parisa", "sara", "darya", "leila", "omid", "tara", "jamal", "shirin"],
};

export interface SeedMember {
  id: string;
  joinedAt: string;
  role?: "member" | "admin";
  removedAt?: string;
  lastReadAt?: string;
  muted?: boolean;
}

export interface SeedConversation {
  id: string;
  kind: "direct" | "group" | "channel";
  name?: string;
  source: MsgSource;
  members: SeedMember[];
  policy?: Partial<ChannelPolicy>;
  newcomerHistory?: "from-join" | "full";
  linkPreviews?: boolean;
}

export interface SeedMessage {
  id: string;
  cid: string;
  author: string;
  at: string;
  body: string;
  editedAt?: string;
  deleted?: boolean;
  replyTo?: string;
  reactions?: Record<string, string[]>;
  attachments?: { kind: "image" | "file" | "voice"; name: string; bytes: number; mime: string; durationSec?: number; shareable?: boolean }[];
  pinned?: boolean;
  parentId?: string;
  hiddenFor?: string[];
  task?: { workspaceId: string; taskId: string; title: string; status: string; due: string | null; readers: string[] };
}

const all = (ids: string[], joinedAt: string, extra: Record<string, Partial<SeedMember>> = {}): SeedMember[] =>
  ids.map((id) => ({ id, joinedAt, ...extra[id] }));

export const msgConversations: SeedConversation[] = [
  {
    id: "c-nazanin",
    kind: "direct",
    source: msgSources.personal,
    members: all(["me", "nazanin"], at(D.older, "09:00"), { me: { lastReadAt: at(D.today, "09:21") }, nazanin: { lastReadAt: at(D.today, "10:42") } }),
  },
  {
    id: "c-website",
    kind: "channel",
    name: "website-redesign",
    source: msgSources.website,
    members: all(["me", "kian", "sara", "leila", "omid", "tara", "harry", "nazanin", "gone"], at(D.older, "09:00"), {
      me: { joinedAt: at(D.joined, "09:00"), lastReadAt: at(D.today, "10:30") },
      leila: { role: "admin" },
    }),
    policy: {},
  },
  {
    id: "c-build",
    kind: "channel",
    name: "build",
    source: msgSources.website,
    members: all(["me", "kian", "omid"], at(D.older, "09:00"), { me: { lastReadAt: at(D.today, "12:00"), role: "admin" } }),
    policy: {},
  },
  {
    id: "c-design-review",
    kind: "channel",
    name: "design-review",
    source: msgSources.website,
    members: all(["me", "sara", "tara", "leila"], at(D.older, "09:00"), { me: { lastReadAt: at(D.yesterday, "18:00") } }),
    policy: {},
  },
  {
    id: "c-launch",
    kind: "channel",
    name: "launch",
    source: msgSources.website,
    members: all(["me", "kian", "sara", "leila"], at(D.older, "09:00"), { me: { lastReadAt: at(D.today, "12:00"), muted: true } }),
    policy: {},
  },
  {
    id: "c-family",
    kind: "group",
    name: "Family",
    source: msgSources.personal,
    members: all(["me", "mom", "dad"], at(D.older, "09:00"), { me: { role: "admin", lastReadAt: at(D.today, "09:58") } }),
    newcomerHistory: "from-join",
  },
  {
    id: "c-design-team",
    kind: "channel",
    name: "design-team",
    source: msgSources.design,
    members: all(["me", "harry", "sara", "tara", "leila"], at(D.older, "09:00"), { me: { role: "admin", lastReadAt: at(D.today, "09:00") } }),
    policy: {},
  },
  {
    id: "c-sara",
    kind: "direct",
    source: msgSources.personal,
    members: all(["me", "sara"], at(D.older, "09:00"), { me: { lastReadAt: at(D.yesterday, "17:10") }, sara: { lastReadAt: at(D.yesterday, "16:00") } }),
  },
  {
    id: "c-euroly-ann",
    kind: "channel",
    name: "euroly-announcements",
    source: msgSources.euroly,
    members: all(["me", "kian", "omid", "leila", "tara", "harry"], at(D.older, "09:00"), { leila: { role: "admin" }, me: { lastReadAt: at(D.yesterday, "17:00") } }),
    policy: { adminsOnlyPost: true },
  },
  {
    id: "c-reza",
    kind: "direct",
    source: msgSources.personal,
    members: all(["me", "reza"], at(D.older, "09:00"), { me: { lastReadAt: at(D.joined, "20:00") } }),
  },
  {
    id: "c-hikers",
    kind: "group",
    name: "Darband hikers",
    source: msgSources.personal,
    members: all(["nazanin", "sara", "reza", "me"], at(D.older, "09:00"), {
      nazanin: { role: "admin" },
      me: { joinedAt: at(D.sat, "12:00"), lastReadAt: at(D.today, "08:00") },
    }),
    newcomerHistory: "from-join",
  },
  {
    id: "c-bookclub",
    kind: "group",
    name: "Book club",
    source: msgSources.personal,
    members: all(["me", "sara", "nazanin"], at(D.older, "09:00"), { me: { removedAt: at(D.yesterday, "12:00") }, sara: { role: "admin" } }),
  },
];

export const msgMessages: SeedMessage[] = [
  /* direct · Nazanin */
  { id: "m-n0", cid: "c-nazanin", author: "me", at: at(D.sat, "18:10"), body: "Sent you the trail map link from last year" },
  { id: "m-n1", cid: "c-nazanin", author: "nazanin", at: at(D.yesterday, "21:04"), body: "Are you free on Sunday morning?" },
  { id: "m-n2", cid: "c-nazanin", author: "me", at: at(D.yesterday, "21:06"), body: "Yes! Darband at 7?" },
  { id: "m-n3", cid: "c-nazanin", author: "nazanin", at: at(D.yesterday, "21:07"), body: "Perfect. I'll bring tea ☕", replyTo: "m-n2", reactions: { "👍": ["me"] } },
  { id: "m-n4", cid: "c-nazanin", author: "nazanin", at: at(D.today, "09:12"), body: "Trail map from last time", attachments: [{ kind: "image", name: "IMG_2041.jpg", bytes: 1_800_000, mime: "image/jpeg", shareable: true }] },
  { id: "m-n5", cid: "c-nazanin", author: "nazanin", at: at(D.today, "09:13"), body: "", attachments: [{ kind: "voice", name: "voice-0913.webm", bytes: 210_000, mime: "audio/webm;codecs=opus", durationSec: 42, shareable: true }] },
  { id: "m-n6", cid: "c-nazanin", author: "me", at: at(D.today, "09:20"), body: "Let's meet at Tajrish square instead", editedAt: at(D.today, "09:21") },
  { id: "m-n7", cid: "c-nazanin", author: "me", at: at(D.today, "09:21"), body: "", deleted: true },
  { id: "m-n8", cid: "c-nazanin", author: "nazanin", at: at(D.today, "10:41"), body: "Weather says light rain after 11" },
  { id: "m-n9", cid: "c-nazanin", author: "nazanin", at: at(D.today, "10:42"), body: "Sunday hike — are we still on?" },

  /* project channel · website-redesign (I joined 12 Mehr; earlier history hidden by policy) */
  { id: "m-w0", cid: "c-website", author: "leila", at: at(D.older, "10:00"), body: "Kick-off notes: budget approved for the payment rework" },
  { id: "m-w1", cid: "c-website", author: "leila", at: at(D.yesterday, "09:00"), body: "Launch checklist v3 — please read before Beta", pinned: true },
  { id: "m-w1b", cid: "c-website", author: "kian", at: at(D.yesterday, "11:00"), body: "Staging is green again", pinned: true },
  { id: "m-w2", cid: "c-website", author: "kian", at: at(D.today, "10:31"), body: "Payment API keys arrived 🎉 sandbox → live switch tomorrow 10:00", reactions: { "🎉": ["sara", "leila", "omid", "tara", "harry"], "👀": ["sara", "me"] } },
  { id: "m-w3", cid: "c-website", author: "sara", at: at(D.today, "10:33"), body: "@[Mehran](me) can you confirm the copy for 3DS failure?" },
  { id: "m-w3a", cid: "c-website", author: "me", at: at(D.today, "10:36"), body: "Checking the error table now", parentId: "m-w3" },
  { id: "m-w3b", cid: "c-website", author: "kian", at: at(D.today, "10:38"), body: "The bank sends code 05 for most of them", parentId: "m-w3" },
  { id: "m-w3c", cid: "c-website", author: "sara", at: at(D.today, "10:40"), body: "Then one message for 05 and a generic one", parentId: "m-w3" },
  { id: "m-w4", cid: "c-website", author: "me", at: at(D.today, "10:35"), body: "On it — will post in the task too." },
  { id: "m-w5", cid: "c-website", author: "kian", at: at(D.today, "10:36"), body: "Linked task", task: { workspaceId: "website-redesign", taskId: "t-payment-copy", title: "Payment errors copy", status: "To do", due: "2026-10-24", readers: ["me", "kian", "sara", "leila"] } },
  { id: "m-w6", cid: "c-website", author: "gone", at: at(D.today, "11:10"), body: "Handing over the analytics dashboard to Omid" },
  { id: "m-w7", cid: "c-website", author: "omid", at: at(D.today, "11:20"), body: "Restricted roadmap item", task: { workspaceId: "website-redesign", taskId: "t-secret", title: "Pricing experiment", status: "In progress", due: null, readers: ["omid", "leila"] } },

  { id: "m-b1", cid: "c-build", author: "omid", at: at(D.today, "11:45"), body: "Nightly build fixed" },
  { id: "m-dr1", cid: "c-design-review", author: "sara", at: at(D.today, "12:10"), body: "New checkout screens are in Files › Checkout v4" },
  { id: "m-l1", cid: "c-launch", author: "leila", at: at(D.today, "11:00"), body: "Beta date stays 1 Aban" },

  /* family group */
  { id: "m-f1", cid: "c-family", author: "dad", at: at(D.yesterday, "20:00"), body: "Dinner on Friday at ours" },
  { id: "m-f2", cid: "c-family", author: "mom", at: at(D.today, "09:58"), body: "", attachments: [{ kind: "image", name: "garden.jpg", bytes: 2_400_000, mime: "image/jpeg", shareable: true }] },

  /* team channel · design-team (policy allows author delete-for-everyone) */
  { id: "m-d1", cid: "c-design-team", author: "me", at: at(D.yesterday, "16:00"), body: "Uploaded the icon set draft" },
  { id: "m-d2", cid: "c-design-team", author: "harry", at: at(D.today, "09:20"), body: "Critique moved to 15:00", pinned: true },

  /* direct · Sara */
  { id: "m-s1", cid: "c-sara", author: "sara", at: at(D.yesterday, "16:58"), body: "Can you send the deck?" },
  { id: "m-s2", cid: "c-sara", author: "me", at: at(D.yesterday, "17:05"), body: "Here it is", attachments: [{ kind: "file", name: "Q4-review.pdf", bytes: 3_200_000, mime: "application/pdf", shareable: false }] },

  /* company channel */
  { id: "m-e1", cid: "c-euroly-ann", author: "leila", at: at(D.yesterday, "17:30"), body: "Expense policy v7 published" },

  /* blocked direct */
  { id: "m-r1", cid: "c-reza", author: "reza", at: at(D.joined, "19:00"), body: "Did you get my invoice?" },

  /* private group joined later (history from join) */
  { id: "m-h0", cid: "c-hikers", author: "nazanin", at: at(D.lastWeek, "08:00"), body: "Private planning before Mehran joined" },
  { id: "m-h1", cid: "c-hikers", author: "reza", at: at(D.today, "07:50"), body: "Bringing the stove" },
  { id: "m-h2", cid: "c-hikers", author: "sara", at: at(D.today, "08:10"), body: "I'll bring snacks" },

  /* removed group */
  { id: "m-k1", cid: "c-bookclub", author: "sara", at: at(D.yesterday, "11:00"), body: "Next book: The Blind Owl" },
];

/* ── Meetings ── */

export interface SeedMeeting {
  id: string;
  title: string;
  source: MsgSource;
  start: string;
  end: string;
  link: string | null;
  location: string | null;
  organizer: string;
  minuteTaker: string | null;
  invitees: Record<string, Rsvp>;
  agenda: { id: string; title: string; owner: string | null; minutes: number; done: boolean }[];
  notes: string;
  files: { id: string; name: string; bytes: number; linked: boolean }[];
  channelId: string | null;
  description: string;
  minutes?: {
    status: "draft" | "in-review" | "approved" | "final";
    summary: string;
    decisions: { id: string; text: string; by: string }[];
    actions: { id: string; text: string; assignee: string | null; due: string | null }[];
    reviewers: Record<string, "pending" | "approved" | "changes">;
    version: number;
  };
}

export const msgMeetings: SeedMeeting[] = [
  {
    id: "mt-critique",
    title: "Design critique",
    source: msgSources.design,
    start: at(D.today, "15:00"),
    end: at(D.today, "16:00"),
    link: "https://meet.example.com/design-critique",
    location: null,
    organizer: "harry",
    minuteTaker: "sara",
    invitees: { harry: "going", sara: "going", me: "none", tara: "maybe", leila: "going" },
    agenda: [
      { id: "a1", title: "Checkout v4 walkthrough", owner: "sara", minutes: 20, done: false },
      { id: "a2", title: "Icon set feedback", owner: "me", minutes: 15, done: false },
      { id: "a3", title: "Next steps", owner: "harry", minutes: 10, done: false },
    ],
    notes: "",
    files: [{ id: "f1", name: "Checkout v4.fig", bytes: 12_400_000, linked: true }],
    channelId: "c-design-team",
    description: "Weekly critique of in-progress work.",
  },
  {
    id: "mt-sprint",
    title: "Sprint review",
    source: msgSources.website,
    start: at(D.tomorrow, "10:00"),
    end: at(D.tomorrow, "11:00"),
    link: "https://zoom.example.com/j/123",
    location: null,
    organizer: "me",
    minuteTaker: "me",
    invitees: { me: "going", kian: "going", sara: "maybe", leila: "none", omid: "going" },
    agenda: [{ id: "a1", title: "Demo payment flow", owner: "kian", minutes: 25, done: false }],
    notes: "",
    files: [],
    channelId: "c-website",
    description: "",
  },
  {
    id: "mt-coffee",
    title: "Coffee with Sara",
    source: msgSources.personal,
    start: at(D.thu, "16:30"),
    end: at(D.thu, "17:30"),
    link: null,
    location: "Café Lamiz",
    organizer: "me",
    minuteTaker: null,
    invitees: { me: "going", sara: "going" },
    agenda: [],
    notes: "",
    files: [],
    channelId: null,
    description: "",
  },
  {
    id: "mt-allhands",
    title: "All-hands Q4",
    source: msgSources.euroly,
    start: at(D.nextWeek, "11:00"),
    end: at(D.nextWeek, "12:00"),
    link: "https://teams.example.com/l/allhands",
    location: null,
    organizer: "leila",
    minuteTaker: "leila",
    invitees: { leila: "going", me: "maybe", kian: "going", omid: "none" },
    agenda: [],
    notes: "",
    files: [],
    channelId: "c-euroly-ann",
    description: "",
  },
  {
    id: "mt-kickoff",
    title: "Payment flow kickoff",
    source: msgSources.website,
    start: at(D.yesterday, "11:00"),
    end: at(D.yesterday, "12:00"),
    link: "https://meet.example.com/payment-kickoff",
    location: null,
    organizer: "leila",
    minuteTaker: "me",
    invitees: { leila: "going", me: "going", kian: "going", sara: "going" },
    agenda: [
      { id: "a1", title: "Scope of v1", owner: "leila", minutes: 20, done: true },
      { id: "a2", title: "3DS failure copy", owner: "sara", minutes: 15, done: true },
    ],
    notes: "Agreed to ship cards first. Sara drafts 3DS error copy.",
    files: [],
    channelId: "c-website",
    description: "",
    minutes: {
      status: "draft",
      summary: "Agreed to ship cards first; wallets follow in the next release.",
      decisions: [{ id: "d1", text: "Cards first, wallets in v1.1", by: "leila" }],
      actions: [
        { id: "ai1", text: "Draft 3DS failure copy", assignee: "sara", due: "2026-10-20" },
        { id: "ai2", text: "Request live API keys", assignee: "kian", due: "2026-10-15" },
      ],
      reviewers: {},
      version: 1,
    },
  },
  {
    id: "mt-retro",
    title: "Sprint 14 retro",
    source: msgSources.design,
    start: at(D.twoDaysAgo, "14:00"),
    end: at(D.twoDaysAgo, "15:00"),
    link: null,
    location: "Room Azadi",
    organizer: "harry",
    minuteTaker: "sara",
    invitees: { harry: "going", sara: "going", me: "going", tara: "going" },
    agenda: [{ id: "a1", title: "What went well", owner: "harry", minutes: 20, done: true }],
    notes: "",
    files: [],
    channelId: "c-design-team",
    description: "",
    minutes: {
      status: "in-review",
      summary: "Good pace; handoff to engineering was late twice.",
      decisions: [
        { id: "d1", text: "Design handoff every Wednesday", by: "harry" },
        { id: "d2", text: "Tokens file becomes the source of truth", by: "sara" },
      ],
      actions: [
        { id: "ai1", text: "Set up Wednesday handoff slot", assignee: "me", due: "2026-10-15" },
        { id: "ai2", text: "Clean up unused tokens", assignee: "tara", due: null },
      ],
      reviewers: { me: "pending", tara: "approved" },
      version: 2,
    },
  },
  {
    id: "mt-1on1",
    title: "1:1 Leila",
    source: msgSources.euroly,
    start: at(D.lastWeek, "10:00"),
    end: at(D.lastWeek, "10:30"),
    link: null,
    location: null,
    organizer: "leila",
    minuteTaker: "leila",
    invitees: { leila: "going", me: "going" },
    agenda: [],
    notes: "",
    files: [],
    channelId: null,
    description: "",
    minutes: { status: "final", summary: "Career plan reviewed.", decisions: [], actions: [], reviewers: { me: "approved" }, version: 3 },
  },
  {
    id: "mt-private-team",
    title: "Hiring panel",
    source: msgSources.design,
    start: at(D.today, "17:00"),
    end: at(D.today, "18:00"),
    link: "https://meet.example.com/hiring",
    location: null,
    organizer: "harry",
    minuteTaker: null,
    invitees: { harry: "going", leila: "going" },
    agenda: [],
    notes: "",
    files: [],
    channelId: null,
    description: "",
  },
];

/* ── Announcements ── */

export interface SeedAnnouncement {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  author: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  audience: { kind: "workspace" | "subset"; label: string; memberIds: string[] };
  pinnedUntil: string | null;
  requireAck: boolean;
  acks: string[];
  lastReminderAt: string | null;
}

export const msgAnnouncements: SeedAnnouncement[] = [
  {
    id: "an-expense",
    workspaceId: "euroly",
    title: "Expense policy v7",
    body: "Receipts are now required for every expense over 2,000,000 Toman. The new chain applies to requests from 1 Aban.",
    author: "leila",
    publishedAt: at(D.yesterday, "17:30"),
    scheduledFor: null,
    audience: { kind: "workspace", label: "", memberIds: [] },
    pinnedUntil: at("2026-10-20", "23:59"),
    requireAck: true,
    acks: ["kian", "omid"],
    lastReminderAt: null,
  },
  {
    id: "an-office",
    workspaceId: "euroly",
    title: "Office closed on Thursday",
    body: "Building maintenance; work from home.",
    author: "leila",
    publishedAt: at(D.lastWeek, "09:00"),
    scheduledFor: null,
    audience: { kind: "workspace", label: "", memberIds: [] },
    pinnedUntil: null,
    requireAck: false,
    acks: [],
    lastReminderAt: null,
  },
  {
    id: "an-hr-only",
    workspaceId: "euroly",
    title: "Salary review timeline",
    body: "Managers only.",
    author: "leila",
    publishedAt: at(D.yesterday, "10:00"),
    scheduledFor: null,
    audience: { kind: "subset", label: "Managers", memberIds: ["leila", "harry"] },
    pinnedUntil: null,
    requireAck: false,
    acks: [],
    lastReminderAt: null,
  },
  {
    id: "an-freeze",
    workspaceId: "website-redesign",
    title: "Beta freeze starts Sunday",
    body: "No new features after Sunday 25 Mehr. Bug fixes only until Beta.",
    author: "me",
    publishedAt: at(D.yesterday, "12:00"),
    scheduledFor: null,
    audience: { kind: "workspace", label: "", memberIds: [] },
    pinnedUntil: at("2026-10-18", "23:59"),
    requireAck: true,
    acks: ["me", "kian", "sara", "leila", "omid"],
    lastReminderAt: null,
  },
];
