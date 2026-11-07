/*
 * SAMPLE DATA inside a project (PJ01/PJ02/PJ15 boards): Website Redesign's
 * published workflow, phases, milestones, tasks, risks, activity and team
 * load. 41 tasks: 24 done (Planning 9, Design 12, Build 3) and 17 open
 * (Build 9, QA 6, Launch 2). Mock today: Tue 13 Oct 2026.
 * Other projects get the workflow only (empty lists).
 */

import type {
  ProjectActivity,
  ProjectMilestone,
  ProjectPhase,
  ProjectPriority,
  ProjectRisk,
  ProjectTask,
  ProjectWorkflow,
  TaskAssignee,
  WorkloadEntry,
} from "@/data/project-domain";
import { projectPeople } from "./projects";

const { me, sara, jonathan, kian, maryam, arash, nima } = projectPeople;

/** The project's published workflow (sample data; version 3). */
export const sampleWorkflow: ProjectWorkflow = {
  version: 3,
  statuses: [
    { id: "todo", name: "To do", key: "todo", category: "todo" },
    { id: "in-progress", name: "In progress", key: "in-progress", category: "active" },
    { id: "in-review", name: "In review", key: "in-review", category: "review" },
    { id: "done", name: "Done", key: "done", category: "done" },
    { id: "blocked", name: "Blocked", key: "blocked", category: "blocked" },
  ],
  transitions: {
    todo: ["in-progress", "blocked"],
    "in-progress": ["in-review", "blocked", "todo"],
    "in-review": ["done", "in-progress"],
    done: ["in-review"],
    blocked: ["in-progress", "todo"],
  },
  name: "Website default",
  publishedAt: "2026-10-02T09:00:00+03:30",
  publishedBy: sara,
  transitionRoles: { todo: "assignee", "in-progress": "assignee", "in-review": "manager", blocked: "manager", done: "manager" },
  wipLimits: { "in-progress": 5, "in-review": 3 },
};

export const samplePhases: readonly ProjectPhase[] = [
  {
    id: "planning",
    name: "Planning",
    start: "2026-09-01",
    end: "2026-09-14",
    progress: 100,
    done: true,
    behindDays: 0,
  },
  { id: "design", name: "Design", start: "2026-09-15", end: "2026-10-10", progress: 100, done: true, behindDays: 0 },
  { id: "build", name: "Build", start: "2026-10-11", end: "2026-11-20", progress: 25, done: false, behindDays: 4 },
  { id: "qa", name: "QA", start: "2026-11-21", end: "2026-12-10", progress: 0, done: false, behindDays: 0 },
  { id: "launch", name: "Launch", start: "2026-12-20", end: "2026-12-20", progress: 0, done: false, behindDays: 0 },
];

export const sampleMilestones: readonly ProjectMilestone[] = [
  { id: "kickoff", title: "Kickoff", due: "2026-09-01", phaseId: "planning", done: true, tasksLeft: 0 },
  { id: "scope", title: "Scope sign-off", due: "2026-09-14", phaseId: "planning", done: true, tasksLeft: 0 },
  { id: "design-signoff", title: "Design sign-off", due: "2026-10-10", phaseId: "design", done: true, tasksLeft: 0 },
  { id: "beta", title: "Beta", due: "2026-11-11", phaseId: "build", done: false, tasksLeft: 3 },
  {
    id: "payment-go-live",
    title: "Payment go-live",
    due: "2026-11-23",
    phaseId: "qa",
    done: false,
    tasksLeft: 2,
    blockedBy: "API access",
  },
  { id: "launch", title: "Launch", due: "2026-12-20", phaseId: "launch", done: false, tasksLeft: 2 },
];

const accepted = (person: TaskAssignee["person"]): TaskAssignee => ({ person, state: "accepted" });

interface TaskSeed {
  id: string;
  title: string;
  statusId: string;
  phaseId: string;
  milestoneId?: string;
  assignees?: TaskAssignee[];
  priority?: ProjectPriority;
  due?: string;
  estimateHours?: number;
  blockedBy?: string[];
  subtasks?: { done: number; total: number };
  commentCount?: number;
  completedAt?: string;
}

const task = (seed: TaskSeed): ProjectTask => ({
  projectId: "website-redesign",
  milestoneId: null,
  assignees: [],
  priority: "medium",
  due: null,
  estimateHours: null,
  blockedBy: [],
  subtasks: { done: 0, total: 0 },
  commentCount: 0,
  revision: 1,
  updatedAt: "2026-10-12T10:00:00+03:30",
  ...seed,
});

/** When each phase's finished tasks were completed (Done collapses cards older than 7 days). */
const COMPLETED_AT: Record<string, string> = {
  planning: "2026-09-14T17:00:00+03:30",
  design: "2026-10-10T17:00:00+03:30",
  build: "2026-10-12T10:00:00+03:30",
};

const doneTasks = (phaseId: string, titles: readonly string[], who: TaskAssignee["person"]) =>
  titles.map((title, index) =>
    task({
      completedAt: COMPLETED_AT[phaseId],
      id: `${phaseId}-${index + 1}`,
      title,
      statusId: "done",
      phaseId,
      assignees: [accepted(who)],
      priority: "medium",
    }),
  );

export const sampleTasks: readonly ProjectTask[] = [
  ...doneTasks(
    "planning",
    [
      "Kickoff workshop",
      "Stakeholder interviews",
      "Analytics audit",
      "Content inventory",
      "Sitemap draft",
      "Success metrics",
      "Tech stack decision",
      "Budget sign-off",
      "Project plan",
    ],
    sara,
  ),
  ...doneTasks(
    "design",
    [
      "Moodboard",
      "Wireframes · home",
      "Wireframes · checkout",
      "Design tokens",
      "Type scale",
      "Icon style",
      "Home page design",
      "Product page design",
      "Checkout design",
      "Mobile layouts",
      "Prototype review",
      "Design sign-off deck",
    ],
    jonathan,
  ),
  ...doneTasks("build", ["Header and navigation", "Product grid", "Search UI"], kian),
  task({
    id: "checkout-flow",
    title: "Checkout flow",
    statusId: "blocked",
    phaseId: "build",
    assignees: [accepted(kian), accepted(jonathan)],
    priority: "urgent",
    due: "2026-10-15",
    estimateHours: 8,
    blockedBy: ["payment-api-keys"],
    subtasks: { done: 1, total: 6 },
    commentCount: 7,
  }),
  task({
    id: "api-integration",
    title: "API integration",
    statusId: "in-progress",
    phaseId: "build",
    milestoneId: "beta",
    assignees: [accepted(me)],
    priority: "high",
    due: "2026-10-20",
    estimateHours: 12,
    commentCount: 3,
  }),
  task({
    id: "payment-errors-copy",
    title: "Payment errors copy",
    statusId: "todo",
    phaseId: "build",
    milestoneId: "beta",
    assignees: [{ person: me, state: "pending", by: sara }],
    priority: "medium",
    due: "2026-10-24",
    estimateHours: 3,
    blockedBy: ["checkout-flow"],
    commentCount: 2,
  }),
  task({
    id: "empty-states",
    title: "Empty states",
    statusId: "todo",
    phaseId: "build",
    assignees: [{ person: arash, state: "declined", by: sara, reason: "no-capacity", note: "no capacity this sprint" }],
    priority: "low",
    due: "2026-10-26",
    estimateHours: 4,
  }),
  task({
    id: "icon-set",
    title: "Icon set",
    statusId: "todo",
    phaseId: "build",
    milestoneId: "beta",
    priority: "low",
    due: "2026-11-02",
    estimateHours: 6,
  }),
  task({
    id: "design-qa-handoff",
    title: "Design QA handoff",
    statusId: "in-review",
    phaseId: "build",
    assignees: [accepted(me), accepted(sara)],
    priority: "medium",
    due: "2026-10-18",
    estimateHours: 2,
  }),
  task({
    id: "error-states",
    title: "Error states",
    statusId: "todo",
    phaseId: "build",
    milestoneId: "beta",
    assignees: [accepted(me)],
    priority: "medium",
    due: "2026-10-26",
    estimateHours: 4,
  }),
  task({
    id: "payment-api-keys",
    title: "Payment API keys",
    statusId: "in-progress",
    phaseId: "build",
    assignees: [accepted(sara)],
    priority: "urgent",
    due: "2026-10-09",
    estimateHours: 2,
    commentCount: 5,
  }),
  task({
    id: "cart-analytics",
    title: "Cart analytics events",
    statusId: "todo",
    phaseId: "build",
    assignees: [accepted(maryam)],
    priority: "medium",
    due: "2026-10-11",
    estimateHours: 3,
  }),
  task({
    id: "regression-plan",
    title: "Regression plan",
    statusId: "todo",
    phaseId: "qa",
    assignees: [accepted(nima)],
    priority: "medium",
    due: "2026-11-25",
    estimateHours: 5,
  }),
  task({
    id: "checkout-qa-pass",
    title: "Checkout QA pass",
    statusId: "todo",
    phaseId: "qa",
    milestoneId: "payment-go-live",
    assignees: [{ person: me, state: "pending", by: kian }],
    priority: "high",
    due: "2026-11-02",
    estimateHours: 4,
    blockedBy: ["checkout-flow"],
  }),
  task({
    id: "a11y-audit",
    title: "Accessibility audit",
    statusId: "todo",
    phaseId: "qa",
    due: "2026-11-28",
    estimateHours: 6,
  }),
  task({
    id: "cross-browser",
    title: "Cross-browser pass",
    statusId: "todo",
    phaseId: "qa",
    assignees: [accepted(jonathan)],
    due: "2026-11-30",
    estimateHours: 4,
  }),
  task({
    id: "bug-bash",
    title: "Bug bash",
    statusId: "todo",
    phaseId: "qa",
    assignees: [accepted(sara)],
    due: "2026-12-05",
    estimateHours: 3,
  }),
  task({
    id: "uat-signoff",
    title: "UAT sign-off",
    statusId: "todo",
    phaseId: "qa",
    milestoneId: "payment-go-live",
    assignees: [{ person: kian, state: "pending", by: sara }],
    priority: "high",
    due: "2026-12-08",
    estimateHours: 2,
  }),
  task({
    id: "launch-checklist",
    title: "Launch checklist",
    statusId: "todo",
    phaseId: "launch",
    milestoneId: "launch",
    due: "2026-12-18",
    estimateHours: 2,
  }),
  task({
    id: "go-live-comms",
    title: "Go-live comms",
    statusId: "todo",
    phaseId: "launch",
    milestoneId: "launch",
    assignees: [accepted(sara)],
    due: "2026-12-20",
    estimateHours: 3,
  }),
];

export const sampleRisks: readonly ProjectRisk[] = [
  {
    id: "payment-api-delay",
    kind: "issue",
    title: "Payment API access delayed",
    severity: "high",
    probability: "high",
    open: true,
    owner: sara,
    blocksTasks: 2,
    mitigation: "sandbox keys",
  },
  {
    id: "qa-capacity",
    kind: "risk",
    title: "QA capacity in November",
    severity: "medium",
    probability: "medium",
    open: true,
    owner: kian,
    blocksTasks: 0,
  },
  {
    id: "font-licence",
    kind: "risk",
    title: "Web font licence",
    severity: "low",
    probability: "low",
    open: false,
    owner: jonathan,
    blocksTasks: 0,
  },
];

export const sampleActivity: readonly ProjectActivity[] = [
  {
    id: "act-1",
    kind: "status",
    actor: sara,
    at: "2026-10-11T10:20:00+03:30",
    health: "at-risk",
    note: "API access is 4 days late",
  },
  {
    id: "act-2",
    kind: "moved",
    actor: kian,
    at: "2026-10-13T11:35:00+03:30",
    task: "Checkout flow",
    status: "blocked",
  },
  { id: "act-3", kind: "completed", actor: jonathan, at: "2026-10-13T09:35:00+03:30", task: "Search UI" },
  { id: "act-4", kind: "milestone", actor: me, at: "2026-10-12T09:00:00+03:30", title: "Beta", due: "2026-11-11" },
];

/** Hours of open estimates this week vs weekly project capacity (Members page). */
export const sampleWorkload: readonly WorkloadEntry[] = [
  { person: kian, hours: 34, capacity: 30 },
  { person: jonathan, hours: 22, capacity: 30 },
  { person: sara, hours: 12, capacity: 20 },
  { person: me, hours: 18, capacity: 24 },
];

/** Per project: everything above (only Website Redesign has work in the sample). */
export const projectWorkFixtures: Readonly<
  Record<
    string,
    {
      phases: readonly ProjectPhase[];
      milestones: readonly ProjectMilestone[];
      tasks: readonly ProjectTask[];
      risks: readonly ProjectRisk[];
      activity: readonly ProjectActivity[];
      workload: readonly WorkloadEntry[];
    }
  >
> = {
  "website-redesign": {
    phases: samplePhases,
    milestones: sampleMilestones,
    tasks: sampleTasks,
    risks: sampleRisks,
    activity: sampleActivity,
    workload: sampleWorkload,
  },
};

/** Detail extras per task (PJ-15); tasks without an entry get an empty detail. */
export interface TaskDetailSeed {
  start?: string;
  section?: string;
  customFields?: { label: string; value: string }[];
  loggedHours?: number;
  subtasks?: { id: string; title: string; done: boolean }[];
  dependencies?: { id: string; predecessorId: string; type: "FS" | "SS" | "FF" | "SF"; lagDays: number }[];
  files?: { id: string; name: string }[];
  comments?: { id: string; author: (typeof projectPeople)[keyof typeof projectPeople]; at: string; body: string }[];
  unreadComments?: number;
  assignedAt?: string;
}

export const sampleTaskDetails: Readonly<Record<string, TaskDetailSeed>> = {
  "payment-errors-copy": {
    start: "2026-10-20",
    section: "Checkout",
    customFields: [
      { label: "Platform", value: "Web" },
      { label: "Story points", value: "2" },
    ],
    loggedHours: 0,
    subtasks: [
      { id: "st-1", title: "Card declined", done: false },
      { id: "st-2", title: "Card expired", done: false },
      { id: "st-3", title: "3DS failed", done: false },
    ],
    dependencies: [{ id: "dep-1", predecessorId: "checkout-flow", type: "FS", lagDays: 0 }],
    files: [
      { id: "file-1", name: "payments-errors.csv" },
      { id: "file-2", name: "checkout-copy.docx" },
    ],
    comments: [
      {
        id: "c-1",
        author: sara,
        at: "2026-10-13T12:35:00+03:30",
        body: "Copy for card declined / expired / 3DS fail. Tone: calm, one action each.",
      },
      {
        id: "c-2",
        author: kian,
        at: "2026-10-13T13:35:00+03:30",
        body: "Error codes list is in Files › payments-errors.csv",
      },
    ],
    unreadComments: 2,
    assignedAt: "2026-10-13T12:35:00+03:30",
  },
  "checkout-flow": {
    start: "2026-10-11",
    section: "Checkout",
    loggedHours: 5,
    subtasks: [
      { id: "cf-1", title: "Cart summary", done: true },
      { id: "cf-2", title: "Address form", done: false },
      { id: "cf-3", title: "Shipping options", done: false },
      { id: "cf-4", title: "Payment step", done: false },
      { id: "cf-5", title: "Review step", done: false },
      { id: "cf-6", title: "Confirmation", done: false },
    ],
    dependencies: [{ id: "dep-2", predecessorId: "payment-api-keys", type: "FS", lagDays: 0 }],
  },
};
