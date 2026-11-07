import {
  Activity,
  Box,
  Briefcase,
  Building2,
  Calendar,
  ChartGantt,
  ChartNoAxesColumn,
  ChartNoAxesGantt,
  CircleCheck,
  CreditCard,
  Flag,
  FileChartColumn,
  Folder,
  FolderKanban,
  House,
  Inbox,
  Kanban,
  LayoutDashboard,
  Lightbulb,
  MessageSquareCheck,
  NotebookText,
  PenLine,
  RefreshCw,
  Route,
  Settings,
  ShieldAlert,
  SquareCheck,
  Sun,
  Target,
  UserRoundCog,
  User,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { AppContext, ContextId, NavItem, NavItemId } from "./types";

/*
 * Declarative navigation map (Shell board). Each context owns a base path and
 * an ordered nav list; hrefs for planned items are reserved now so links and
 * tests stay stable when the routes ship. Only the overviews exist in Step 2.
 */

/** Glyphs matching the Shell board's rail icons. */
export const navItemIcons: Record<NavItemId, LucideIcon> = {
  overview: LayoutDashboard,
  myday: Sun,
  tasks: SquareCheck,
  calendar: Calendar,
  goals: Target,
  habits: RefreshCw,
  finance: CreditCard,
  journal: NotebookText,
  insights: Lightbulb,
  inbox: Inbox,
  braindump: PenLine,
  settings: Settings,
  board: Kanban,
  timeline: ChartNoAxesGantt,
  gantt: ChartGantt,
  flow: Route,
  analytics: ChartNoAxesColumn,
  milestones: Flag,
  risks: ShieldAlert,
  workload: UserRoundCog,
  members: UsersRound,
  work: Briefcase,
  people: Users,
  checkins: MessageSquareCheck,
  activity: Activity,
  files: Folder,
  departments: Building2,
  projects: FolderKanban,
  assets: Box,
  approvals: CircleCheck,
  reports: FileChartColumn,
};

/** URL segment per item; the overview lives at the context base path itself. */
const segments: Record<Exclude<NavItemId, "overview">, string> = {
  myday: "my-day",
  tasks: "tasks",
  calendar: "calendar",
  goals: "goals",
  habits: "habits",
  finance: "finance",
  journal: "journal",
  insights: "insights",
  inbox: "inbox",
  braindump: "brain-dump",
  settings: "settings",
  board: "board",
  timeline: "timeline",
  gantt: "gantt",
  flow: "flow",
  analytics: "analytics",
  milestones: "milestones",
  risks: "risks",
  workload: "workload",
  members: "members",
  work: "work",
  people: "people",
  checkins: "check-ins",
  activity: "activity",
  files: "files",
  departments: "departments",
  projects: "projects",
  assets: "assets",
  approvals: "approvals",
  reports: "reports",
};

interface ContextSpec {
  id: ContextId;
  basePath: string;
  icon: LucideIcon;
  canAddWorkspace: boolean;
  nav: readonly NavItemId[];
  /** Bottom-bar items in slot order (the FAB sits after the second). */
  mobile: readonly NavItemId[];
  /** Items with real routes; the rest render as "Coming soon". Defaults to the overview only. */
  available?: "all" | "overview";
  rail?: AppContext["rail"];
  collection?: boolean;
  /** Replaces the bottom-bar items (built from `mobile` otherwise). */
  mobileNav?: (basePath: string) => readonly NavItem[];
}

function navItem(
  id: NavItemId,
  basePath: string,
  mobile: readonly NavItemId[],
  available: "all" | "overview" = "overview",
): NavItem {
  const slot = mobile.indexOf(id);
  return {
    id,
    labelKey: `items.${id}`,
    icon: navItemIcons[id],
    href: id === "overview" ? basePath : `${basePath}/${segments[id]}`,
    status: available === "all" || id === "overview" ? "available" : "planned",
    ...(slot >= 0 ? { mobileOrder: slot + 1 } : {}),
    ...(id === "inbox" ? { badge: "inbox" as const } : {}),
    ...(id === "risks" ? { badge: "risks" as const } : {}),
  };
}

function defineContext({
  id,
  basePath,
  icon,
  canAddWorkspace,
  nav,
  mobile,
  available,
  rail,
  collection,
  mobileNav,
}: ContextSpec): AppContext {
  return {
    id,
    basePath,
    labelKey: `contexts.${id}.label`,
    descriptionKey: `contexts.${id}.description`,
    addLabelKey: `contexts.${id}.add`,
    canAddWorkspace,
    icon,
    nav: nav.map((itemId) => navItem(itemId, basePath, mobile, available)),
    ...(rail ? { rail } : {}),
    ...(collection ? { collection } : {}),
    ...(mobileNav ? { mobileNav: mobileNav(basePath) } : {}),
  };
}

/*
 * Personal (P00PersonalIA · PM01). The rail is three icon-only groups plus
 * Settings at the bottom; contextual flows (Focus, Daily shutdown, Weekly
 * review, Task create/detail) have no nav item. The bottom bar is
 * Today · Tasks · (+) · Calendar · More, where Today covers Overview and
 * My Day (the pages switch between them).
 */
const personalMobileNav = (basePath: string): NavItem[] => [
  {
    id: "overview",
    labelKey: "items.today",
    icon: House,
    href: basePath,
    status: "available",
    mobileOrder: 1,
    alsoActiveOn: [`${basePath}/${segments.myday}`],
  },
  { ...navItem("tasks", basePath, [], "all"), mobileOrder: 2 },
  { ...navItem("calendar", basePath, [], "all"), mobileOrder: 3 },
];

const PROJECTS_BASE = "/projects";

/** Contexts in display order: Personal, Projects, Teams, Companies. */
export const appContexts: readonly AppContext[] = [
  defineContext({
    id: "personal",
    basePath: "/personal",
    icon: User,
    canAddWorkspace: false,
    nav: [
      "overview",
      "myday",
      "tasks",
      "calendar",
      "goals",
      "habits",
      "finance",
      "journal",
      "insights",
      "inbox",
      "braindump",
      "settings",
    ],
    mobile: ["overview", "tasks", "calendar"],
    available: "all",
    rail: {
      groups: [
        ["overview", "myday", "tasks", "calendar", "goals", "habits"],
        ["finance", "journal", "insights"],
        ["inbox", "braindump"],
      ],
      footer: ["settings"],
    },
    mobileNav: personalMobileNav,
  }),
  // The collection (/projects, D7): "All projects"; the rail lists projects instead.
  defineContext({
    id: "project",
    basePath: PROJECTS_BASE,
    icon: FolderKanban,
    canAddWorkspace: true,
    nav: ["overview"],
    mobile: ["overview"],
    available: "all",
    collection: true,
    mobileNav: (basePath) => [
      {
        id: "overview",
        labelKey: "items.allProjects",
        icon: FolderKanban,
        href: basePath,
        status: "available",
        mobileOrder: 1,
      },
    ],
  }),
  defineContext({
    id: "team",
    basePath: "/teams",
    icon: Users,
    canAddWorkspace: true,
    nav: ["overview", "work", "people", "calendar", "checkins", "activity", "files"],
    mobile: ["overview", "work", "calendar"],
  }),
  defineContext({
    id: "company",
    basePath: "/companies",
    icon: Building2,
    canAddWorkspace: true,
    nav: ["overview", "departments", "projects", "people", "goals", "finance", "assets", "approvals", "reports"],
    mobile: ["overview", "projects", "approvals"],
  }),
];

const contextById = new Map<ContextId, AppContext>(appContexts.map((context) => [context.id, context]));

export function getAppContext(id: ContextId): AppContext {
  const context = contextById.get(id);
  if (!context) throw new Error(`Unknown navigation context: ${id}`);
  return context;
}

/** The context shown when the URL is outside every context (e.g. "/"). */
export const defaultContextId: ContextId = "personal";

/*
 * Inside a project (SH01, D1–D3, D6, D8): routes are /projects/[id]/…, the
 * rail is three groups + Settings, List/Board/Flow are view modes of Tasks
 * (their routes stay and keep Tasks current), and the bottom bar is
 * Overview · Tasks · (+) · Calendar · More. Built per project id, cached.
 */
export const projectRail = {
  groups: [
    ["overview", "tasks", "timeline", "gantt", "calendar"],
    ["milestones", "risks", "workload"],
    ["members", "files", "analytics"],
  ],
  footer: ["settings"],
} as const satisfies AppContext["rail"];

const projectNavIds: readonly NavItemId[] = [...projectRail.groups.flat(), ...projectRail.footer];
const projectContexts = new Map<string, AppContext>();

/** The project context for one project id (nav hrefs carry the id). */
export function getProjectContext(projectId: string): AppContext {
  const cached = projectContexts.get(projectId);
  if (cached) return cached;
  const base = getAppContext("project");
  const basePath = `${PROJECTS_BASE}/${encodeURIComponent(projectId)}`;
  const mobile: NavItemId[] = ["overview", "tasks", "calendar"];
  const nav = projectNavIds.map((id) => {
    const item = navItem(id, basePath, mobile, "all");
    return id === "tasks"
      ? {
          ...item,
          alsoActiveOn: [`${basePath}/${segments.board}`, `${basePath}/${segments.flow}`],
        }
      : item;
  });
  const context: AppContext = {
    ...base,
    basePath,
    nav,
    rail: projectRail,
    workspaceId: projectId,
  };
  delete context.collection;
  delete context.mobileNav;
  projectContexts.set(projectId, context);
  return context;
}

/** Route of a project module (overview = the project root). */
export function projectHref(projectId: string, item: NavItemId | "board" = "overview"): string {
  const basePath = `${PROJECTS_BASE}/${encodeURIComponent(projectId)}`;
  return item === "overview" ? basePath : `${basePath}/${segments[item]}`;
}
