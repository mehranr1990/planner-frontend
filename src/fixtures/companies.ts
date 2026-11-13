import type {
  Approval,
  ApprovalChain,
  ApprovalHistoryRow,
  AttachCandidate,
  AttachRequest,
  AuditRow,
  BudgetLine,
  CapacityHeat,
  CompanyExport,
  CompanyGoal,
  CompanyGrant,
  CompanyInvitation,
  CompanyProjectRow,
  CompanyResource,
  CompanyRole,
  CompanyRoom,
  CompanySummary,
  CompanyTeamRow,
  CorrectiveAction,
  Department,
  Expense,
  FileAccessLogRow,
  FileDocument,
  KbFolder,
  KbPage,
  PaymentRun,
  PolicyDefinition,
  PortfolioSummary,
  Reimbursement,
  ResourceRequest,
  WorkProfile,
} from "@/data/company-domain";

/*
 * Company sample data (design/company boards, Mock Mode only). Names and
 * amounts are user content. The planner day is 2026-10-13 (21 Mehr 1405).
 * Euroly: I am Org Admin with time-limited Finance + HR reviewer grants.
 * Araxitis: I am a Member in Design. Nova Labs: a pending invitation.
 */

export const ME_ID = "p-mehran";

export const companyFixtures: CompanySummary[] = [
  {
    id: "euroly",
    name: "Euroly",
    legalName: "Euroly Trading Co.",
    initials: "EU",
    tint: "purple",
    role: "admin",
    departmentId: null,
    departmentName: null,
    people: 82,
    departments: 5,
    approvalsForMe: 4,
    lifecycle: "active",
    lifecycleAt: null,
    currency: "toman",
    currencyLocked: true,
    fiscalStartMonth: 1,
    updatedAt: "2026-10-13T14:30:00+03:30",
  },
  {
    id: "araxitis",
    name: "Araxitis",
    legalName: "Araxitis Studio",
    initials: "AX",
    tint: "blue",
    role: "member",
    departmentId: "ax-design",
    departmentName: "Design",
    people: 31,
    departments: 3,
    approvalsForMe: 0,
    lifecycle: "active",
    lifecycleAt: null,
    currency: "toman",
    currencyLocked: false,
    fiscalStartMonth: 1,
    updatedAt: "2026-10-12T11:00:00+03:30",
  },
];

export const companyInvitationFixtures: CompanyInvitation[] = [
  {
    id: "inv-nova",
    companyId: "nova-labs",
    companyName: "Nova Labs",
    initials: "NL",
    role: "member",
    departmentName: "Engineering",
    inviterName: "Parisa M.",
  },
];

export const novaLabs: CompanySummary = {
  id: "nova-labs",
  name: "Nova Labs",
  legalName: "Nova Labs",
  initials: "NL",
  tint: "amber",
  role: "member",
  departmentId: "nl-eng",
  departmentName: "Engineering",
  people: 18,
  departments: 2,
  approvalsForMe: 0,
  lifecycle: "active",
  lifecycleAt: null,
  currency: "toman",
  currencyLocked: false,
  fiscalStartMonth: 1,
  updatedAt: "2026-10-10T09:00:00+03:30",
};

export const departmentFixtures: Department[] = [
  { id: "d-eng", name: "Engineering", parentId: null, managerId: "p-dariush", managerName: "Dariush K.", people: 24, teams: ["Platform", "Mobile Squad"], budget: 20_000_000_000, kind: "department" },
  { id: "d-qa", name: "QA unit", parentId: "d-eng", managerId: "p-reza", managerName: "Reza N.", people: 4, teams: [], budget: 0, kind: "unit" },
  { id: "d-design", name: "Design", parentId: null, managerId: "p-harry", managerName: "Harry B.", people: 9, teams: ["Design Team"], budget: 8_000_000_000, kind: "department" },
  { id: "d-mkt", name: "Marketing", parentId: null, managerId: "p-omid", managerName: "Omid R.", people: 14, teams: ["Growth"], budget: 10_000_000_000, kind: "department" },
  { id: "d-sales", name: "Sales", parentId: null, managerId: "p-leila", managerName: "Leila M.", people: 18, teams: ["Field Sales"], budget: 7_000_000_000, kind: "department" },
  { id: "d-ops", name: "Operations", parentId: null, managerId: "p-sara", managerName: "Sara P.", people: 17, teams: ["Ops Crew"], budget: 7_000_000_000, kind: "department" },
];

export const policyFixtures: PolicyDefinition[] = [
  { id: "pol-2fa", name: "Two-step sign-in", value: "On for everyone", level: "mandatory", security: true },
  { id: "pol-expense", name: "Expense chain", value: "Manager → Finance above 50M T", level: "mandatory", security: false },
  { id: "pol-week", name: "Work week", value: "Sat – Wed", level: "default", security: false },
  { id: "pol-checkins", name: "Check-ins in teams", value: "Off by default", level: "optional", security: false },
  { id: "pol-receipt", name: "Receipt required to submit", value: "Above 1,000,000 T", level: "default", security: false },
];

/** Default overrides per department (reason audited). */
export const policyOverrideFixtures: Record<string, Record<string, { value: string; reason: string; by: string; at: string }>> = {
  "d-eng": { "pol-week": { value: "Sat – Thu", reason: "On-call rotation", by: "Dariush K.", at: "2026-09-28" } },
  "d-ops": { "pol-week": { value: "Sat – Thu", reason: "Thu shift", by: "Sara P.", at: "2026-10-12" } },
};

const profile = (
  id: string,
  name: string,
  position: string,
  departments: [string, string][],
  supervisor: [string, string] | null,
  extra: Partial<WorkProfile> = {},
): WorkProfile => ({
  id,
  name,
  initials: name
    .replace(/[^\p{L} ]/gu, "")
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase(),
  position,
  departmentIds: departments.map(([dept]) => dept),
  departmentNames: departments.map(([, label]) => label),
  supervisorId: supervisor?.[0] ?? null,
  supervisorName: supervisor?.[1] ?? null,
  role: "member",
  status: "active",
  manualStatus: "available",
  workingOn: null,
  email: `${name.split(" ")[0]!.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")}@euroly.com`,
  phone: null,
  hoursPerWeek: 40,
  workHours: "Sat – Wed · 9:00 – 17:00",
  startedOn: "2024-03-20",
  location: "Tehran office · hybrid",
  equipment: [],
  bookedPercent: 60,
  limited: false,
  ...extra,
});

const ENG: [string, string] = ["d-eng", "Engineering"];
const DES: [string, string] = ["d-design", "Design"];
const MKT: [string, string] = ["d-mkt", "Marketing"];
const SAL: [string, string] = ["d-sales", "Sales"];
const OPS: [string, string] = ["d-ops", "Operations"];
const HARRY: [string, string] = ["p-harry", "Harry B."];

export const staffFixtures: WorkProfile[] = [
  profile("p-navid", "Navid E.", "Chief Executive", [OPS], null, { role: "owner", bookedPercent: 72 }),
  profile(ME_ID, "Mehran R.", "Chief Operating Officer", [OPS], ["p-navid", "Navid E."], { role: "admin", bookedPercent: 81, workingOn: "Q4 budget review" }),
  profile("p-dariush", "Dariush K.", "Engineering Manager", [ENG], [ME_ID, "Mehran R."], { role: "manager", bookedPercent: 90 }),
  profile("p-jonathan", "Jonathan K.", "Mobile Lead", [ENG], ["p-dariush", "Dariush K."], { role: "lead", bookedPercent: 96, manualStatus: "busy" }),
  profile("p-reza", "Reza N.", "QA Lead", [ENG], ["p-dariush", "Dariush K."], { role: "lead", bookedPercent: 85 }),
  profile("p-omid", "Omid R.", "Head of Marketing", [MKT], [ME_ID, "Mehran R."], { role: "manager", bookedPercent: 64 }),
  profile("p-mina", "Mina H.", "Content Marketer", [MKT], ["p-omid", "Omid R."], { bookedPercent: 58 }),
  profile("p-leila", "Leila M.", "Head of Sales", [SAL], [ME_ID, "Mehran R."], { role: "manager", bookedPercent: 77 }),
  profile("p-kian", "Kian A.", "Account Executive", [SAL], ["p-leila", "Leila M."], { bookedPercent: 70, status: "active" }),
  profile("p-sara", "Sara P.", "Head of Operations", [OPS], [ME_ID, "Mehran R."], { role: "manager", bookedPercent: 88 }),
  profile("p-tina", "Tina S.", "Finance Lead", [OPS], ["p-sara", "Sara P."], { bookedPercent: 74 }),
  profile("p-harry", "Harry B.", "Head of Design", [DES], [ME_ID, "Mehran R."], { role: "manager", bookedPercent: 94, manualStatus: "busy" }),
  profile("p-amelie", "Amélie L.", "UX Designer", [DES], HARRY, { bookedPercent: 70 }),
  profile("p-ava", "Ava R.", "Researcher", [DES], HARRY, { bookedPercent: 76, manualStatus: "away" }),
  profile("p-katy", "Katy F.", "Design Engineer", [DES, ENG], HARRY, {
    bookedPercent: 103,
    manualStatus: "busy",
    equipment: ["MacBook Pro 14", "Monitor 27″"],
    hoursPerWeek: 40,
  }),
  profile("p-lina", "Lina K.", "UI Designer", [DES], HARRY, { bookedPercent: 40 }),
  profile("p-nina", "Nina T.", "Illustrator", [DES], HARRY, { bookedPercent: 0, status: "leave", manualStatus: "off" }),
  profile("p-sarah", "Sarah P.", "Visual Designer", [DES], HARRY, { bookedPercent: 88 }),
  profile("p-wade", "Wade W.", "Content Designer", [DES], HARRY, { bookedPercent: 62, manualStatus: "away" }),
  profile("p-yasmin", "Yasmin Z.", "Motion Designer", [DES], HARRY, { bookedPercent: 55, workingOn: "Launch motion kit" }),
];

/** Joined this quarter (CO-03 "New this quarter"). */
export const newThisQuarterIds = ["p-yasmin", "p-mina", "p-kian"];

export const pendingInviteFixtures = [
  { id: "ci-1", email: "farid@euroly.com", role: "member" as CompanyRole, departmentName: "Sales" },
  { id: "ci-2", email: "roya@euroly.com", role: "lead" as CompanyRole, departmentName: "Engineering" },
];

export const grantFixtures: (CompanyGrant & { personName: string })[] = [
  { kind: "finance", personId: ME_ID, personName: "Mehran R.", until: "2027-03-20" },
  { kind: "finance", personId: "p-tina", personName: "Tina S.", until: null },
  { kind: "hr", personId: ME_ID, personName: "Mehran R.", until: "2026-10-31" },
  { kind: "security", personId: "p-reza", personName: "Reza N.", until: null },
];

export const portfolioFixture: PortfolioSummary = {
  quarter: "Q4 1405",
  onTrack: 12,
  active: 14,
  atRisk: 2,
  offTrack: 0,
  history: [
    { label: "Q1", onTrack: 9, active: 11 },
    { label: "Q2", onTrack: 10, active: 12 },
    { label: "Q3", onTrack: 11, active: 13 },
    { label: "Q4", onTrack: 12, active: 14 },
  ],
};

export const departmentProgressFixtures = [
  { departmentId: "d-eng", progress: 68, status: "watch" as const, capacity: 92 },
  { departmentId: "d-design", progress: 74, status: "on-track" as const, capacity: 81 },
  { departmentId: "d-mkt", progress: 59, status: "on-track" as const, capacity: 64 },
  { departmentId: "d-sales", progress: 81, status: "on-track" as const, capacity: 77 },
  { departmentId: "d-ops", progress: 45, status: "at-risk" as const, capacity: 88 },
];

export const teamRowFixtures: CompanyTeamRow[] = [
  { id: "platform", name: "Platform", initials: "PL", departmentId: "d-eng", departmentName: "Engineering", lead: "Dariush K.", people: 8, planCompletion: 72, custody: "company" },
  { id: "mobile", name: "Mobile Squad", initials: "MS", departmentId: "d-eng", departmentName: "Engineering", lead: "Jonathan K.", people: 5, planCompletion: 64, custody: "company" },
  { id: "design", name: "Design Team", initials: "DT", departmentId: "d-design", departmentName: "Design", lead: "Harry B.", people: 8, planCompletion: 81, custody: "attached" },
  { id: "growth", name: "Growth", initials: "GR", departmentId: "d-mkt", departmentName: "Marketing", lead: "Omid R.", people: 6, planCompletion: 58, custody: "company" },
  { id: "field-sales", name: "Field Sales", initials: "FS", departmentId: "d-sales", departmentName: "Sales", lead: "Leila M.", people: 9, planCompletion: 77, custody: "company" },
  { id: "ops-crew", name: "Ops Crew", initials: "OC", departmentId: "d-ops", departmentName: "Operations", lead: "Sara P.", people: 7, planCompletion: 49, custody: "company" },
];

const project = (
  id: string,
  name: string,
  dept: [string, string],
  health: CompanyProjectRow["health"],
  progress: number,
  spent: number,
  budget: number,
  lead: string,
  custody: CompanyProjectRow["custody"] = "company",
  extra: Partial<CompanyProjectRow> = {},
): CompanyProjectRow => ({
  id,
  name,
  initials: name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase(),
  departmentId: dept[0],
  departmentName: dept[1],
  health,
  progress,
  spent,
  budget,
  custody,
  lead,
  lifecycle: "active",
  nextMilestone: null,
  openRisks: 0,
  attachedAt: custody === "attached" ? "2026-07-24" : null,
  ...extra,
});

export const projectRowFixtures: CompanyProjectRow[] = [
  project("website-redesign", "Website Redesign", DES, "on-track", 62, 1_840_000_000, 2_500_000_000, "Harry B.", "attached", { nextMilestone: { title: "Beta", due: "2026-11-11" }, openRisks: 2 }),
  project("planner-app", "Planner App", ENG, "on-track", 48, 3_100_000_000, 5_000_000_000, "Dariush K.", "company", { nextMilestone: { title: "Wave 2", due: "2026-10-22" } }),
  project("mobile-onboarding", "Mobile Onboarding", ENG, "at-risk", 35, 1_200_000_000, 1_500_000_000, "Jonathan K.", "company", { openRisks: 1 }),
  project("payments-v2", "Payments v2", ENG, "on-track", 71, 2_400_000_000, 3_800_000_000, "Dariush K."),
  project("qa-automation", "QA Automation", ENG, "on-track", 55, 600_000_000, 900_000_000, "Reza N."),
  project("data-platform", "Data Platform", ENG, "on-track", 40, 1_900_000_000, 4_000_000_000, "Dariush K."),
  project("brand-refresh", "Brand Refresh", DES, "on-track", 80, 900_000_000, 1_200_000_000, "Harry B.", "company", { lifecycle: "paused" }),
  project("spring-campaign", "Spring Campaign", MKT, "on-track", 66, 2_200_000_000, 3_000_000_000, "Omid R.", "company", { nextMilestone: { title: "Launch", due: "2027-02-20" }, openRisks: 1 }),
  project("seo-sprint", "SEO Sprint", MKT, "on-track", 90, 300_000_000, 500_000_000, "Mina H."),
  project("partner-program", "Partner Program", SAL, "on-track", 52, 700_000_000, 1_500_000_000, "Leila M."),
  project("crm-cleanup", "CRM Cleanup", SAL, "on-track", 85, 150_000_000, 300_000_000, "Kian A."),
  project("warehouse-move", "Warehouse Move", OPS, "at-risk", 30, 2_600_000_000, 3_000_000_000, "Sara P.", "company", { nextMilestone: { title: "Move-out", due: "2026-12-06" }, openRisks: 3 }),
  project("vendor-audit", "Vendor Audit", OPS, "on-track", 74, 120_000_000, 400_000_000, "Tina S."),
  project("office-network", "Office Network", OPS, "on-track", 58, 480_000_000, 800_000_000, "Sara P."),
];

export const attachRequestFixtures: AttachRequest[] = [
  {
    id: "att-research",
    kind: "team",
    subjectId: "research",
    subjectName: "Research Guild",
    ownerName: "Mehran R.",
    departmentId: "d-design",
    departmentName: "Design",
    members: 8,
    linkedProjects: [
      { id: "lp-1", name: "User Study 2026", consent: "pending" },
      { id: "lp-2", name: "Insight Library", consent: "pending" },
      { id: "lp-3", name: "Survey Toolkit", consent: "pending" },
    ],
    status: "pending",
    requestedAt: "2026-10-11T09:20:00+03:30",
    iAmOwner: true,
  },
  {
    id: "att-launch",
    kind: "project",
    subjectId: "launch-site",
    subjectName: "Launch Site",
    ownerName: "Omid R.",
    departmentId: "d-mkt",
    departmentName: "Marketing",
    members: 4,
    linkedProjects: [],
    status: "pending",
    requestedAt: "2026-10-09T15:00:00+03:30",
    iAmOwner: false,
  },
];

export const attachCandidateFixtures: AttachCandidate[] = [
  { id: "growth-lab", kind: "team", name: "Growth Lab", ownerName: "Omid R." },
  { id: "data-migration", kind: "project", name: "Data Migration", ownerName: "Dariush K." },
];

export const companyGoalFixtures: CompanyGoal[] = [
  {
    id: "g-revenue",
    level: "company",
    parentId: null,
    departmentId: null,
    departmentName: null,
    title: "Grow recurring revenue 30%",
    ownerId: "p-navid",
    ownerName: "Navid E.",
    quarter: "Q4 1405",
    progress: 64,
    onPace: true,
    keyResults: [
      { id: "kr-1", title: "Department goals on pace", current: 2, target: 3, unit: "", source: { kind: "auto", children: 3, onPace: 2 } },
      { id: "kr-2", title: "New partner accounts", current: 18, target: 30, unit: "", source: { kind: "manual", by: "Leila M.", at: "2026-10-10" } },
    ],
    links: [],
  },
  {
    id: "g-launch",
    level: "department",
    parentId: "g-revenue",
    departmentId: "d-eng",
    departmentName: "Engineering",
    title: "Ship Planner App v2",
    ownerId: "p-dariush",
    ownerName: "Dariush K.",
    quarter: "Q4 1405",
    progress: 58,
    onPace: true,
    keyResults: [
      { id: "kr-3", title: "Release milestones done", current: 4, target: 7, unit: "", source: { kind: "auto", children: 2, onPace: 2 } },
    ],
    links: [
      { id: "l-1", kind: "project", name: "Planner App", progress: 48, href: "/projects/planner-app" },
      { id: "l-2", kind: "team-goal", name: "Mobile Squad · Onboarding beta", progress: 35, href: "/teams/mobile/goals" },
    ],
  },
  {
    id: "g-brand",
    level: "department",
    parentId: "g-revenue",
    departmentId: "d-design",
    departmentName: "Design",
    title: "Relaunch the brand site",
    ownerId: ME_ID,
    ownerName: "Mehran R.",
    quarter: "Q4 1405",
    progress: 71,
    onPace: true,
    keyResults: [
      { id: "kr-4", title: "Pages migrated", current: 34, target: 48, unit: "", source: { kind: "manual", by: "Harry B.", at: "2026-10-12" } },
    ],
    links: [
      { id: "l-3", kind: "project", name: "Website Redesign", progress: 62, href: "/projects/website-redesign" },
      { id: "l-4", kind: "team-goal", name: "Design Team · Design system 2.0", progress: 70, href: "/teams/design/goals" },
    ],
  },
  {
    id: "g-pipeline",
    level: "department",
    parentId: "g-revenue",
    departmentId: "d-sales",
    departmentName: "Sales",
    title: "Double qualified pipeline",
    ownerId: "p-leila",
    ownerName: "Leila M.",
    quarter: "Q4 1405",
    progress: 41,
    onPace: false,
    keyResults: [
      { id: "kr-5", title: "Qualified leads", current: 120, target: 300, unit: "", source: { kind: "manual", by: "Kian A.", at: "2026-10-08" } },
    ],
    links: [{ id: "l-5", kind: "project", name: "Partner Program", progress: 52, href: "/projects/partner-program" }],
  },
  {
    id: "g-cost",
    level: "company",
    parentId: null,
    departmentId: null,
    departmentName: null,
    title: "Keep operating cost within budget",
    ownerId: ME_ID,
    ownerName: "Mehran R.",
    quarter: "Q4 1405",
    progress: 74,
    onPace: true,
    keyResults: [
      { id: "kr-6", title: "Budget used vs plan", current: 74, target: 100, unit: "%", source: { kind: "manual", by: "Mehran R.", at: "2026-10-12" } },
    ],
    links: [],
  },
];

export const resourceFixtures: CompanyResource[] = [
  { id: "r-1", tag: "EU-LT-014", name: "MacBook Pro 14", type: "laptop", assigneeId: "p-katy", assigneeName: "Katy F.", departmentId: "d-design", departmentName: "Design", status: "assigned", note: null, since: "2026-03-21", busy: [{ from: "2026-01-01", to: "2027-12-31" }] },
  { id: "r-2", tag: "EU-LT-021", name: "MacBook Pro 14", type: "laptop", assigneeId: null, assigneeName: null, departmentId: "d-design", departmentName: "Design", status: "requested", note: null, since: null, busy: [{ from: "2026-10-14", to: "2026-10-28" }] },
  { id: "r-3", tag: "EU-MN-007", name: "Monitor 27″", type: "monitor", assigneeId: "p-katy", assigneeName: "Katy F.", departmentId: "d-design", departmentName: "Design", status: "assigned", note: null, since: "2026-03-21", busy: [{ from: "2026-01-01", to: "2027-12-31" }] },
  { id: "r-4", tag: "EU-MN-011", name: "Monitor 27″", type: "monitor", assigneeId: null, assigneeName: null, departmentId: null, departmentName: null, status: "available", note: "IT shelf", since: null, busy: [] },
  { id: "r-5", tag: "EU-PH-003", name: "Test phone · Pixel 9", type: "phone", assigneeId: null, assigneeName: null, departmentId: "d-eng", departmentName: "Engineering", status: "available", note: "QA cabinet", since: null, busy: [{ from: "2026-10-15", to: "2026-10-20" }] },
  { id: "r-6", tag: "EU-LC-030", name: "Figma seat", type: "license", assigneeId: "p-lina", assigneeName: "Lina K.", departmentId: "d-design", departmentName: "Design", status: "assigned", note: null, since: "2026-01-05", busy: [{ from: "2026-01-01", to: "2027-12-31" }] },
  { id: "r-7", tag: "EU-LT-009", name: "ThinkPad X1", type: "laptop", assigneeId: null, assigneeName: null, departmentId: "d-eng", departmentName: "Engineering", status: "repair", note: "back 25 Mehr", since: null, busy: [] },
  { id: "r-8", tag: "EU-VH-001", name: "Delivery van", type: "vehicle", assigneeId: null, assigneeName: null, departmentId: "d-ops", departmentName: "Operations", status: "available", note: "Garage", since: null, busy: [{ from: "2026-10-13", to: "2026-10-16" }] },
  { id: "r-9", tag: "EU-LT-002", name: "MacBook Air 2019", type: "laptop", assigneeId: null, assigneeName: null, departmentId: null, departmentName: null, status: "retired", note: "Retired 1404", since: null, busy: [] },
];

export const resourceRequestFixtures: ResourceRequest[] = [
  {
    id: "rr-1",
    resourceId: "r-2",
    resourceName: "MacBook Pro 14",
    tag: "EU-LT-021",
    requesterId: "p-lina",
    requesterName: "Lina K.",
    departmentName: "Design",
    from: "2026-10-14",
    to: "2026-10-28",
    reason: "Prototype testing for the Website Redesign launch",
    status: "pending",
    approvalId: "ap-macbook",
    createdAt: "2026-10-12T10:00:00+03:30",
  },
];

export const roomFixtures: Omit<CompanyRoom, "bookings">[] = [
  { id: "room-alborz", name: "Alborz", seats: 12, floor: "3rd floor" },
  { id: "room-damavand", name: "Damavand", seats: 6, floor: "3rd floor" },
  { id: "room-focus", name: "Focus room", seats: 2, floor: "2nd floor" },
];

export const roomBookingFixtures: Record<string, CompanyRoom["bookings"]> = {
  "room-alborz": [
    { id: "b-1", from: "10:00", to: "11:30", title: "Q4 budget review", mine: true },
    { id: "b-2", from: "14:00", to: "15:00", title: null, mine: false },
  ],
  "room-damavand": [{ id: "b-3", from: "09:00", to: "10:00", title: null, mine: false }],
  "room-focus": [],
};

export const capacityFixture: CapacityHeat = {
  months: [7, 8, 9],
  rows: [
    { departmentId: "d-eng", name: "Engineering", values: [84, 92, 104] },
    { departmentId: "d-design", name: "Design", values: [78, 81, 70] },
    { departmentId: "d-mkt", name: "Marketing", values: [60, 64, 72] },
    { departmentId: "d-ops", name: "Operations", values: [80, 88, 86] },
  ],
};

export const kbFolderFixtures: KbFolder[] = [
  { id: "kf-handbook", name: "Handbook", parentId: null, restricted: false, pages: 3 },
  { id: "kf-policies", name: "Policies", parentId: "kf-handbook", restricted: false, pages: 2 },
  { id: "kf-eng", name: "Engineering", parentId: null, restricted: false, pages: 2 },
  { id: "kf-hr", name: "HR", parentId: null, restricted: true, pages: 1 },
];

export const kbPageFixtures: KbPage[] = [
  {
    id: "kp-security",
    folderId: "kf-policies",
    title: "Security policy",
    version: 4,
    updatedAt: "2026-10-10T11:00:00+03:30",
    updatedBy: "Reza N.",
    ackRequired: true,
    acknowledged: false,
    body: "Two-step sign-in is mandatory for every account.\n\nLock your screen when you leave your desk. Report lost devices to IT within one hour.\n\nCompany data stays in company tools: do not copy it to personal storage.",
    versions: [
      { version: 4, at: "2026-10-10T11:00:00+03:30", by: "Reza N.", note: "Lost-device reporting window" },
      { version: 3, at: "2026-07-02T09:00:00+03:30", by: "Reza N.", note: "Two-step sign-in now mandatory" },
      { version: 2, at: "2026-03-14T09:00:00+03:30", by: "Mehran R.", note: "Screen-lock rule" },
      { version: 1, at: "2025-12-01T09:00:00+03:30", by: "Mehran R.", note: "First version" },
    ],
    files: [{ id: "f-1", name: "security-checklist.pdf", size: "240 KB" }],
    ackCount: 61,
    audience: 82,
    canEdit: true,
    remindedVersion: null,
  },
  {
    id: "kp-expenses",
    folderId: "kf-policies",
    title: "Expense guidelines",
    version: 2,
    updatedAt: "2026-09-20T09:00:00+03:30",
    updatedBy: "Tina S.",
    ackRequired: false,
    acknowledged: false,
    body: "Submit every expense with its receipt. Expenses above 50,000,000 T also go to Finance.\n\nApproved is not paid: reimbursements are settled in payment runs.",
    versions: [
      { version: 2, at: "2026-09-20T09:00:00+03:30", by: "Tina S.", note: "Finance threshold" },
      { version: 1, at: "2026-02-01T09:00:00+03:30", by: "Tina S.", note: "First version" },
    ],
    files: [],
    ackCount: 0,
    audience: 82,
    canEdit: true,
    remindedVersion: null,
  },
  {
    id: "kp-welcome",
    folderId: "kf-handbook",
    title: "Welcome to Euroly",
    version: 1,
    updatedAt: "2026-01-10T09:00:00+03:30",
    updatedBy: "Navid E.",
    ackRequired: false,
    acknowledged: false,
    body: "Start here: how we plan, how we decide, and where things live.",
    versions: [{ version: 1, at: "2026-01-10T09:00:00+03:30", by: "Navid E.", note: "First version" }],
    files: [],
    ackCount: 0,
    audience: 82,
    canEdit: true,
    remindedVersion: null,
  },
  {
    id: "kp-release",
    folderId: "kf-eng",
    title: "Release checklist",
    version: 3,
    updatedAt: "2026-10-01T09:00:00+03:30",
    updatedBy: "Dariush K.",
    ackRequired: false,
    acknowledged: false,
    body: "Freeze, test on the QA phones, write release notes, ship behind a flag.",
    versions: [
      { version: 3, at: "2026-10-01T09:00:00+03:30", by: "Dariush K.", note: "Feature flags" },
      { version: 2, at: "2026-06-01T09:00:00+03:30", by: "Reza N.", note: "QA phones" },
      { version: 1, at: "2026-02-01T09:00:00+03:30", by: "Dariush K.", note: "First version" },
    ],
    files: [{ id: "f-2", name: "release-template.md", size: "4 KB" }],
    ackCount: 0,
    audience: 24,
    canEdit: true,
    remindedVersion: null,
  },
  {
    id: "kp-hiring",
    folderId: "kf-hr",
    title: "Hiring process",
    version: 1,
    updatedAt: "2026-05-01T09:00:00+03:30",
    updatedBy: "Sara P.",
    ackRequired: false,
    acknowledged: false,
    body: "Restricted: HR only.",
    versions: [{ version: 1, at: "2026-05-01T09:00:00+03:30", by: "Sara P.", note: "First version" }],
    files: [],
    ackCount: 0,
    audience: 4,
    canEdit: false,
    remindedVersion: null,
  },
];

/** Restricted folders the viewer holds a grant for (none by default: HR stays hidden). */
export const kbGrantedFolderIds: string[] = [];

export const expenseFixtures: Expense[] = [
  {
    id: "ex-travel",
    title: "Conference travel ×3",
    amount: 180_000_000,
    date: "2026-10-08",
    category: "travel",
    departmentId: "d-mkt",
    departmentName: "Marketing",
    projectId: "spring-campaign",
    projectName: "Spring Campaign",
    payer: "card",
    receipt: { name: "flights.pdf" },
    authorId: "p-mina",
    authorName: "Mina H.",
    status: "pending",
    step: 2,
    approvalId: "ap-travel",
    revision: 1,
    changesNote: null,
    createdAt: "2026-10-08T10:00:00+03:30",
  },
  {
    id: "ex-licences",
    title: "Design tool licences",
    amount: 46_000_000,
    date: "2026-10-11",
    category: "software",
    departmentId: "d-design",
    departmentName: "Design",
    projectId: null,
    projectName: null,
    payer: "card",
    receipt: { name: "invoice-figma.pdf" },
    authorId: "p-harry",
    authorName: "Harry B.",
    status: "pending",
    step: 1,
    approvalId: "ap-licences",
    revision: 1,
    changesNote: null,
    createdAt: "2026-10-11T12:00:00+03:30",
  },
  {
    id: "ex-lunch",
    title: "Team lunch",
    amount: 4_200_000,
    date: "2026-10-04",
    category: "meals",
    departmentId: "d-design",
    departmentName: "Design",
    projectId: null,
    projectName: null,
    payer: "me",
    receipt: null,
    authorId: ME_ID,
    authorName: "Mehran R.",
    status: "changes",
    step: 1,
    approvalId: "ap-lunch",
    revision: 1,
    changesNote: { by: "Harry B.", text: "please attach the receipt." },
    createdAt: "2026-10-04T14:00:00+03:30",
  },
  {
    id: "ex-taxi",
    title: "Taxi to client workshop",
    amount: 1_850_000,
    date: "2026-09-29",
    category: "travel",
    departmentId: "d-ops",
    departmentName: "Operations",
    projectId: null,
    projectName: null,
    payer: "me",
    receipt: { name: "snapp-receipt.jpg" },
    authorId: ME_ID,
    authorName: "Mehran R.",
    status: "approved",
    step: null,
    approvalId: "ap-taxi",
    revision: 1,
    changesNote: null,
    createdAt: "2026-09-29T18:00:00+03:30",
  },
  {
    id: "ex-hubs",
    title: "USB-C hubs ×6",
    amount: 12_600_000,
    date: "2026-10-05",
    category: "equipment",
    departmentId: "d-eng",
    departmentName: "Engineering",
    projectId: null,
    projectName: null,
    payer: "card",
    receipt: { name: "hubs.pdf" },
    authorId: "p-jonathan",
    authorName: "Jonathan K.",
    status: "rejected",
    step: null,
    approvalId: "ap-hubs",
    revision: 1,
    changesNote: null,
    createdAt: "2026-10-05T09:00:00+03:30",
  },
  {
    id: "ex-books",
    title: "Research books",
    amount: 3_400_000,
    date: "2026-10-02",
    category: "training",
    departmentId: "d-design",
    departmentName: "Design",
    projectId: null,
    projectName: null,
    payer: "me",
    receipt: { name: "books.jpg" },
    authorId: "p-ava",
    authorName: "Ava R.",
    status: "approved",
    step: null,
    approvalId: "ap-books",
    revision: 1,
    changesNote: null,
    createdAt: "2026-10-02T09:00:00+03:30",
  },
  {
    id: "ex-catering",
    title: "Offsite catering",
    amount: 62_500_000,
    date: "2026-10-12",
    category: "meals",
    departmentId: "d-ops",
    departmentName: "Operations",
    projectId: null,
    projectName: null,
    payer: "me",
    receipt: { name: "catering.pdf" },
    authorId: ME_ID,
    authorName: "Mehran R.",
    status: "pending",
    step: 1,
    approvalId: "ap-catering",
    revision: 1,
    changesNote: null,
    createdAt: "2026-10-12T16:00:00+03:30",
  },
  {
    id: "ex-draft",
    title: "Printer toner",
    amount: 2_100_000,
    date: "2026-10-13",
    category: "equipment",
    departmentId: "d-ops",
    departmentName: "Operations",
    projectId: null,
    projectName: null,
    payer: "card",
    receipt: null,
    authorId: ME_ID,
    authorName: "Mehran R.",
    status: "draft",
    step: null,
    approvalId: null,
    revision: 1,
    changesNote: null,
    createdAt: "2026-10-13T09:00:00+03:30",
  },
];

export const chainFixtures: ApprovalChain[] = [
  {
    id: "ch-exp-3",
    subject: "expenses",
    version: 3,
    status: "published",
    publishedAt: "2026-07-01T09:00:00+03:30",
    steps: [
      { id: "s-mgr", label: "Department manager", approver: "dept-manager", minAmount: null, escalateAfterDays: 3, escalateTo: "admin" },
      { id: "s-fin", label: "Finance reviewer", approver: "finance", minAmount: 50_000_000, escalateAfterDays: 3, escalateTo: "admin" },
      { id: "s-own", label: "Owner", approver: "owner", minAmount: 500_000_000, escalateAfterDays: 5, escalateTo: "admin" },
    ],
  },
  {
    id: "ch-res-1",
    subject: "resources",
    version: 1,
    status: "published",
    publishedAt: "2026-02-01T09:00:00+03:30",
    steps: [{ id: "s-adm", label: "Org Admin", approver: "admin", minAmount: null, escalateAfterDays: 2, escalateTo: "owner" }],
  },
  {
    id: "ch-hc-2",
    subject: "headcount",
    version: 2,
    status: "published",
    publishedAt: "2026-05-01T09:00:00+03:30",
    steps: [
      { id: "s-hr", label: "HR reviewer", approver: "hr", minAmount: null, escalateAfterDays: 3, escalateTo: "admin" },
      { id: "s-own2", label: "Owner", approver: "owner", minAmount: null, escalateAfterDays: 5, escalateTo: "admin" },
    ],
  },
  {
    id: "ch-bud-1",
    subject: "budget",
    version: 1,
    status: "published",
    publishedAt: "2026-04-01T09:00:00+03:30",
    steps: [
      { id: "s-fin2", label: "Finance reviewer", approver: "finance", minAmount: null, escalateAfterDays: 3, escalateTo: "admin" },
      { id: "s-own3", label: "Owner", approver: "owner", minAmount: null, escalateAfterDays: 5, escalateTo: "admin" },
    ],
  },
];

const step = (
  stepId: string,
  label: string,
  state: Approval["steps"][number]["state"],
  reviewer: [string, string] | null,
  extra: Partial<Approval["steps"][number]> = {},
): Approval["steps"][number] => ({
  stepId,
  label,
  reviewerId: reviewer?.[0] ?? null,
  reviewerName: reviewer?.[1] ?? null,
  routedNote: null,
  state,
  decision: null,
  escalatesOn: null,
  ...extra,
});

const ME: [string, string] = [ME_ID, "Mehran R."];
const EXPENSE_OUTCOMES = ["Budget commit", "Reimbursement", "Notify requester", "Audit entry"];

export const approvalFixtures: Approval[] = [
  {
    id: "ap-hire",
    subject: "headcount",
    subjectId: "hc-1",
    title: "Hire: senior front-end",
    departmentName: "Engineering",
    amount: null,
    amountNote: "headcount request",
    requesterId: "p-dariush",
    requesterName: "Dariush K.",
    chainVersion: 2,
    status: "pending",
    currentStep: 1,
    steps: [
      step("s-hr", "HR reviewer", "current", ME, { escalatesOn: "2026-10-15" }),
      step("s-own2", "Owner", "waiting", ["p-navid", "Navid E."]),
    ],
    submittedAt: "2026-10-11T09:00:00+03:30",
    outcomes: ["Open position", "Notify requester", "Audit entry"],
    forMe: true,
    mine: false,
  },
  {
    id: "ap-travel",
    subject: "expenses",
    subjectId: "ex-travel",
    title: "Conference travel ×3",
    departmentName: "Marketing",
    amount: 180_000_000,
    amountNote: null,
    requesterId: "p-mina",
    requesterName: "Mina H.",
    chainVersion: 3,
    status: "pending",
    currentStep: 2,
    steps: [
      step("s-mgr", "Department manager", "done", ["p-omid", "Omid R."], {
        decision: { kind: "approved", by: "Omid R.", at: "2026-10-12T11:00:00+03:30", note: null },
      }),
      step("s-fin", "Finance reviewer", "current", ME, { escalatesOn: "2026-10-15" }),
      step("s-own", "Owner", "skipped", null, { routedNote: "Below 500,000,000 T" }),
    ],
    submittedAt: "2026-10-11T10:00:00+03:30",
    outcomes: EXPENSE_OUTCOMES,
    forMe: true,
    mine: false,
  },
  {
    id: "ap-licences",
    subject: "expenses",
    subjectId: "ex-licences",
    title: "Design tool licences",
    departmentName: "Design",
    amount: 46_000_000,
    amountNote: "per year",
    requesterId: "p-harry",
    requesterName: "Harry B.",
    chainVersion: 3,
    status: "pending",
    currentStep: 1,
    steps: [
      step("s-mgr", "Department manager", "current", ME, {
        routedNote: "Requester is the department manager → next eligible (Org Admin)",
        escalatesOn: "2026-10-14",
      }),
      step("s-fin", "Finance reviewer", "skipped", null, { routedNote: "Below 50,000,000 T" }),
      step("s-own", "Owner", "skipped", null, { routedNote: "Below 500,000,000 T" }),
    ],
    submittedAt: "2026-10-11T12:00:00+03:30",
    outcomes: EXPENSE_OUTCOMES,
    forMe: true,
    mine: false,
  },
  {
    id: "ap-macbook",
    subject: "resources",
    subjectId: "rr-1",
    title: "MacBook Pro 14 for Lina K.",
    departmentName: "Design",
    amount: null,
    amountNote: "14 – 28 Oct",
    requesterId: "p-lina",
    requesterName: "Lina K.",
    chainVersion: 1,
    status: "pending",
    currentStep: 1,
    steps: [step("s-adm", "Org Admin", "current", ME, { escalatesOn: "2026-10-14" })],
    submittedAt: "2026-10-12T10:00:00+03:30",
    outcomes: ["Assign resource", "Notify requester", "Audit entry"],
    forMe: true,
    mine: false,
  },
  {
    id: "ap-catering",
    subject: "expenses",
    subjectId: "ex-catering",
    title: "Offsite catering",
    departmentName: "Operations",
    amount: 62_500_000,
    amountNote: null,
    requesterId: ME_ID,
    requesterName: "Mehran R.",
    chainVersion: 3,
    status: "pending",
    currentStep: 1,
    steps: [
      step("s-mgr", "Department manager", "current", ["p-sara", "Sara P."], { escalatesOn: "2026-10-15" }),
      step("s-fin", "Finance reviewer", "waiting", ["p-tina", "Tina S."], {
        routedNote: "Requester holds the Finance grant → next eligible (Tina S.)",
      }),
      step("s-own", "Owner", "skipped", null, { routedNote: "Below 500,000,000 T" }),
    ],
    submittedAt: "2026-10-12T16:00:00+03:30",
    outcomes: EXPENSE_OUTCOMES,
    forMe: false,
    mine: true,
  },
  {
    id: "ap-lunch",
    subject: "expenses",
    subjectId: "ex-lunch",
    title: "Team lunch",
    departmentName: "Design",
    amount: 4_200_000,
    amountNote: null,
    requesterId: ME_ID,
    requesterName: "Mehran R.",
    chainVersion: 3,
    status: "changes",
    currentStep: 1,
    steps: [
      step("s-mgr", "Department manager", "current", ["p-harry", "Harry B."], {
        decision: { kind: "changes", by: "Harry B.", at: "2026-10-07T10:00:00+03:30", note: "please attach the receipt." },
      }),
    ],
    submittedAt: "2026-10-04T14:00:00+03:30",
    outcomes: EXPENSE_OUTCOMES,
    forMe: false,
    mine: true,
  },
];

export const approvalHistoryFixtures: ApprovalHistoryRow[] = [
  { id: "h-1", approvalId: "ap-travel", at: "2026-10-12T11:00:00+03:30", title: "Conference travel ×3", decision: "approved", step: 1, note: null, by: "Omid R.", subject: "expenses", chainVersion: 3 },
  { id: "h-2", approvalId: "ap-hubs", at: "2026-10-10T09:00:00+03:30", title: "USB-C hubs ×6", decision: "rejected", step: 1, note: "duplicate of IT stock", by: "Dariush K.", subject: "expenses", chainVersion: 3 },
  { id: "h-3", approvalId: "ap-lunch", at: "2026-10-07T10:00:00+03:30", title: "Team lunch", decision: "changes", step: 1, note: "receipt", by: "Harry B.", subject: "expenses", chainVersion: 3 },
  { id: "h-4", approvalId: "ap-taxi", at: "2026-09-30T10:00:00+03:30", title: "Taxi to client workshop", decision: "approved", step: 1, note: null, by: "Sara P.", subject: "expenses", chainVersion: 3 },
];

const line = (
  id: string,
  kind: BudgetLine["kind"],
  name: string,
  dept: [string, string],
  budget: number,
  approved: number,
  committed: number,
  pending: number,
): BudgetLine => ({
  id,
  kind,
  name,
  departmentId: dept[0],
  departmentName: dept[1],
  budget,
  approved,
  committed,
  pending,
  versions: [{ version: 1, at: "2026-09-23T09:00:00+03:30", budget, note: "Q4 plan" }],
  changeRequest: null,
});

export const budgetFixtures: BudgetLine[] = [
  line("b-eng", "department", "Engineering", ENG, 20_000_000_000, 14_200_000_000, 2_300_000_000, 1_200_000_000),
  line("b-design", "department", "Design", DES, 8_000_000_000, 5_600_000_000, 900_000_000, 450_000_000),
  line("b-mkt", "department", "Marketing", MKT, 10_000_000_000, 8_100_000_000, 1_400_000_000, 900_000_000),
  line("b-sales", "department", "Sales", SAL, 7_000_000_000, 4_900_000_000, 600_000_000, 250_000_000),
  line("b-ops", "department", "Operations", OPS, 7_000_000_000, 5_600_000_000, 1_000_000_000, 300_000_000),
  line("b-p-planner", "project", "Planner App", ENG, 5_000_000_000, 3_100_000_000, 700_000_000, 200_000_000),
  line("b-p-website", "project", "Website Redesign", DES, 2_500_000_000, 1_840_000_000, 300_000_000, 120_000_000),
  line("b-p-spring", "project", "Spring Campaign", MKT, 3_000_000_000, 2_200_000_000, 500_000_000, 180_000_000),
  line("b-p-warehouse", "project", "Warehouse Move", OPS, 3_000_000_000, 2_600_000_000, 600_000_000, 0),
];

export const reimbursementFixtures: Reimbursement[] = [
  { id: "rb-taxi", expenseId: "ex-taxi", title: "Taxi to client workshop", amount: 1_850_000, recipientId: ME_ID, recipientName: "Mehran R.", departmentName: "Operations", approvedAt: "2026-09-30T10:00:00+03:30", status: "settled", runId: "run-sep", settledAt: "2026-10-05T12:00:00+03:30", disputeNote: null, recordedInPersonal: false },
  { id: "rb-books", expenseId: "ex-books", title: "Research books", amount: 3_400_000, recipientId: "p-ava", recipientName: "Ava R.", departmentName: "Design", approvedAt: "2026-10-03T10:00:00+03:30", status: "to-settle", runId: null, settledAt: null, disputeNote: null, recordedInPersonal: false },
  { id: "rb-parking", expenseId: "ex-parking", title: "Client parking", amount: 650_000, recipientId: "p-kian", recipientName: "Kian A.", departmentName: "Sales", approvedAt: "2026-10-06T10:00:00+03:30", status: "to-settle", runId: null, settledAt: null, disputeNote: null, recordedInPersonal: false },
  { id: "rb-course", expenseId: "ex-course", title: "Online course", amount: 9_800_000, recipientId: "p-reza", recipientName: "Reza N.", departmentName: "Engineering", approvedAt: "2026-10-07T10:00:00+03:30", status: "in-run", runId: "run-oct", settledAt: null, disputeNote: null, recordedInPersonal: false },
  { id: "rb-supplies", expenseId: "ex-supplies", title: "Workshop supplies", amount: 5_250_000, recipientId: "p-mina", recipientName: "Mina H.", departmentName: "Marketing", approvedAt: "2026-10-08T10:00:00+03:30", status: "in-run", runId: "run-oct", settledAt: null, disputeNote: null, recordedInPersonal: false },
];

export const paymentRunFixtures: PaymentRun[] = [
  { id: "run-oct", label: "Run 14 · Mehr", itemIds: ["rb-course", "rb-supplies"], total: 15_050_000, status: "open", reference: null, confirmedAt: null, confirmedBy: null },
  { id: "run-sep", label: "Run 13 · Mehr", itemIds: ["rb-taxi"], total: 1_850_000, status: "confirmed", reference: "TRX-88213", confirmedAt: "2026-10-05T12:00:00+03:30", confirmedBy: "Tina S." },
];

/** Sealed employee files: the viewer's grants per person (HR reviewer covers Katy F.). */
export const fileGrantFixtures: Record<string, { kind: "hr" | "supervisor"; until: string | null }> = {
  "p-katy": { kind: "hr", until: "2026-10-31" },
};

export const fileDocumentFixtures: Record<string, FileDocument[]> = {
  "p-katy": [
    { id: "fd-1", name: "Employment contract.pdf", kind: "contract", addedAt: "2025-03-21", grantedTo: [], readable: true },
    { id: "fd-2", name: "ID card.jpg", kind: "id", addedAt: "2025-03-21", grantedTo: [], readable: true },
    { id: "fd-3", name: "Security training certificate.pdf", kind: "certificate", addedAt: "2026-06-02", grantedTo: ["Harry B."], readable: true },
    { id: "fd-4", name: "Mid-year review.pdf", kind: "review", addedAt: "2026-08-15", grantedTo: ["Harry B."], readable: true },
  ],
  [ME_ID]: [{ id: "fd-me", name: "Employment contract.pdf", kind: "contract", addedAt: "2024-01-01", grantedTo: [], readable: true }],
};

export const fileLogFixtures: Record<string, FileAccessLogRow[]> = {
  "p-katy": [
    { id: "fl-1", at: "2026-10-04T10:00:00+03:30", who: "Katy F.", what: "responded to corrective action" },
    { id: "fl-2", at: "2026-09-25T10:00:00+03:30", who: "Harry B.", what: "opened corrective action" },
  ],
  [ME_ID]: [{ id: "fl-me", at: "2026-08-01T10:00:00+03:30", who: "Tina S.", what: "opened file (grant: HR reviewer)" }],
};

export const correctiveFixtures: Record<string, CorrectiveAction[]> = {
  "p-katy": [
    {
      id: "ca-1",
      reason: "Missed security training",
      evidence: "training-log.csv",
      visibleTo: "HR, supervisor, employee",
      openedBy: "Harry B.",
      openedAt: "2026-09-25T10:00:00+03:30",
      status: "responded",
      response: "I was on leave during the session; I completed the recorded course on 2 Mehr.",
      appeal: null,
      outcome: null,
    },
  ],
};

export const exportFixtures: CompanyExport[] = [
  { id: "x-1", report: "variance", format: "csv", requestedAt: "2026-10-11T11:00:00+03:30", requestedBy: "Mehran R.", status: "expired", expiresAt: "2026-10-12T11:00:00+03:30", watermark: "Mehran R. · 19 Mehr 11:00" },
];

export const auditFixtures: AuditRow[] = [
  { id: "a-1", at: "2026-10-13T10:02:00+03:30", who: "Mehran R.", action: "opened sealed file (grant HR reviewer)", subject: "Katy F. · employee file", kind: "file" },
  { id: "a-2", at: "2026-10-12T16:40:00+03:30", who: "Omid R.", action: "approved step 1", subject: "Conference travel ×3", kind: "approval" },
  { id: "a-3", at: "2026-10-12T09:12:00+03:30", who: "Sara P.", action: "overrode default policy (reason: Thu shift)", subject: "Operations · work week", kind: "policy" },
  { id: "a-4", at: "2026-10-11T11:00:00+03:30", who: "Mehran R.", action: "exported CSV", subject: "Budget variance Q4", kind: "export" },
  { id: "a-5", at: "2026-09-01T09:00:00+03:30", who: "Navid E.", action: "added Org Admin", subject: "Mehran R.", kind: "ownership" },
];
