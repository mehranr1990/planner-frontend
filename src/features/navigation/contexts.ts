import {
  Activity,
  Archive,
  Award,
  Box,
  Briefcase,
  Building2,
  Contact,
  Image,
  Map as MapIcon,
  MessageCircle,
  Package,
  Scale,
  Trophy,
  Calendar,
  ChartGantt,
  ChartNoAxesColumn,
  ChartNoAxesGantt,
  CircleCheck,
  CreditCard,
  FileText,
  Flag,
  FileChartColumn,
  Folder,
  FolderKanban,
  HeartHandshake,
  House,
  Inbox,
  Kanban,
  LayoutDashboard,
  ListTodo,
  Lightbulb,
  MessageSquareCheck,
  MessagesSquare,
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
  Wallet,
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
  planning: ListTodo,
  recognition: Award,
  resources: Archive,
  expenses: Wallet,
  budgets: CreditCard,
  knowledge: FileText,
  channels: MessagesSquare,
  connections: Contact,
  groups: UsersRound,
  activities: MapIcon,
  balances: Scale,
  lending: Package,
  chat: MessageCircle,
  album: Image,
  challenges: Trophy,
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
  planning: "planning",
  recognition: "recognition",
  resources: "resources",
  expenses: "expenses",
  budgets: "budgets",
  knowledge: "knowledge",
  channels: "channels",
  connections: "connections",
  groups: "groups",
  activities: "activities",
  balances: "balances",
  lending: "lending",
  chat: "chat",
  album: "album",
  challenges: "challenges",
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
    ...(id === "checkins" ? { badge: "checkins" as const } : {}),
    ...(id === "approvals" ? { badge: "approvals" as const } : {}),
    // Channels (MS-03): unread mentions; announcements live inside it (MT-04).
    ...(id === "channels" ? { badge: "channels" as const, alsoActiveOn: [`${basePath}/announcements`] } : {}),
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
const TEAMS_BASE = "/teams";
const COMPANIES_BASE = "/companies";
const SOCIAL_BASE = "/social";

/** Contexts in display order: Personal, Projects, Teams, Companies, Social. */
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
  // The collection (/teams, TS-01): "All teams"; the rail lists teams instead.
  defineContext({
    id: "team",
    basePath: TEAMS_BASE,
    icon: Users,
    canAddWorkspace: true,
    nav: ["overview"],
    mobile: ["overview"],
    available: "all",
    collection: true,
    mobileNav: (basePath) => [
      {
        id: "overview",
        labelKey: "items.allTeams",
        icon: Users,
        href: basePath,
        status: "available",
        mobileOrder: 1,
      },
    ],
  }),
  // The collection (/companies, CS-01): "All companies"; the rail lists companies instead.
  defineContext({
    id: "company",
    basePath: COMPANIES_BASE,
    icon: Building2,
    canAddWorkspace: true,
    nav: ["overview"],
    mobile: ["overview"],
    available: "all",
    collection: true,
    mobileNav: (basePath) => [
      {
        id: "overview",
        labelKey: "items.allCompanies",
        icon: Building2,
        href: basePath,
        status: "available",
        mobileOrder: 1,
      },
    ],
  }),
  /*
   * Social (SO-01, 5th context, coral): the home rail is
   * Home · Connections | Groups · Activities | My balances · Lending and a
   * New (+) action; the bottom bar is Home · Groups · (+) · Activities · More.
   */
  defineContext({
    id: "social",
    basePath: SOCIAL_BASE,
    icon: HeartHandshake,
    canAddWorkspace: true,
    nav: ["overview", "connections", "groups", "activities", "balances", "lending"],
    mobile: ["overview", "groups", "activities"],
    available: "all",
    rail: {
      groups: [
        ["overview", "connections"],
        ["groups", "activities"],
        ["balances", "lending"],
      ],
      footer: [],
    },
  }),
].map((context) =>
  context.id === "social"
    ? {
        ...context,
        nav: context.nav.map((item) =>
          item.id === "overview" ? { ...item, labelKey: "items.socialHome" as const, icon: House } : item.id === "lending" ? { ...item, labelKey: "items.socialLending" as const } : item,
        ),
      }
    : context,
);

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
    ["channels", "members", "files", "analytics"],
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

/*
 * Inside a team (TS-01, T1/T2/T11): routes are /teams/[id]/…, the rail is
 * three groups + Settings (Activity is an Overview tab, not a route), and the
 * bottom bar is Overview · Work · (+) · Calendar · More. Built per team id,
 * cached. Items the role cannot open are hidden by the nav filter.
 */
export const teamRail = {
  groups: [
    ["overview", "work", "calendar", "planning"],
    ["projects", "goals", "people", "analytics"],
    ["channels", "checkins", "recognition", "files"],
  ],
  footer: ["settings"],
} as const satisfies AppContext["rail"];

const teamNavIds: readonly NavItemId[] = [...teamRail.groups.flat(), ...teamRail.footer];
const teamContexts = new Map<string, AppContext>();

/** The team context for one team id (nav hrefs carry the id). */
export function getTeamContext(teamId: string): AppContext {
  const cached = teamContexts.get(teamId);
  if (cached) return cached;
  const base = getAppContext("team");
  const basePath = `${TEAMS_BASE}/${encodeURIComponent(teamId)}`;
  const mobile: NavItemId[] = ["overview", "work", "calendar"];
  const context: AppContext = {
    ...base,
    basePath,
    nav: teamNavIds.map((id) => navItem(id, basePath, mobile, "all")),
    rail: teamRail,
    workspaceId: teamId,
  };
  delete context.collection;
  delete context.mobileNav;
  teamContexts.set(teamId, context);
  return context;
}

/** Route of a team module (overview = the team root). */
export function teamHref(teamId: string, item: NavItemId = "overview"): string {
  const basePath = `${TEAMS_BASE}/${encodeURIComponent(teamId)}`;
  return item === "overview" ? basePath : `${basePath}/${segments[item]}`;
}

/*
 * Inside a company (CS-01, C1/C2/C11): routes are /companies/[id]/…, the
 * rail is four groups + Settings (organisation · work · money · knowledge),
 * Reimbursements live inside Expenses, and the bottom bar is
 * Overview · Work · (+) · Approvals · More. Items the role cannot open are
 * hidden by the nav filter. Built per company id, cached.
 */
export const companyRail = {
  groups: [
    ["overview", "departments", "people"],
    ["work", "goals", "resources"],
    ["expenses", "approvals", "budgets"],
    ["channels", "knowledge", "reports"],
  ],
  footer: ["settings"],
} as const satisfies AppContext["rail"];

const companyNavIds: readonly NavItemId[] = [...companyRail.groups.flat(), ...companyRail.footer];
const companyContexts = new Map<string, AppContext>();

/** The company context for one company id (nav hrefs carry the id). */
export function getCompanyContext(companyId: string): AppContext {
  const cached = companyContexts.get(companyId);
  if (cached) return cached;
  const base = getAppContext("company");
  const basePath = `${COMPANIES_BASE}/${encodeURIComponent(companyId)}`;
  const mobile: NavItemId[] = ["overview", "work", "approvals"];
  const context: AppContext = {
    ...base,
    basePath,
    nav: companyNavIds.map((id) => {
      const item = navItem(id, basePath, mobile, "all");
      return id === "work" ? { ...item, labelKey: "items.companyWork" as const, tabLabelKey: "items.companyWorkTab" as const } : item;
    }),
    rail: companyRail,
    workspaceId: companyId,
  };
  delete context.collection;
  delete context.mobileNav;
  companyContexts.set(companyId, context);
  return context;
}

/** Route of a company module (overview = the company root). */
export function companyHref(companyId: string, item: NavItemId = "overview"): string {
  const basePath = `${COMPANIES_BASE}/${encodeURIComponent(companyId)}`;
  return item === "overview" ? basePath : `${basePath}/${segments[item]}`;
}

/*
 * Inside a social group (SO-01): routes are /social/groups/[id]/…; the rail
 * is Back · Overview · Activities · Calendar · Chat | Expenses · Lending &
 * found · Album · Challenges | Members | Settings, and the bottom bar is
 * Overview · Activities · (+) · Chat · More. Chat opens the group's
 * conversation in Messages (Phase 5 engine). Built per group id, cached.
 */
export const socialGroupRail = {
  groups: [
    ["overview", "activities", "calendar", "chat"],
    ["expenses", "lending", "album", "challenges"],
    ["members"],
  ],
  footer: ["settings"],
} as const satisfies AppContext["rail"];

const socialGroupNavIds: readonly NavItemId[] = [...socialGroupRail.groups.flat(), ...socialGroupRail.footer];
const socialGroupContexts = new Map<string, AppContext>();

/** The social group context for one group id (nav hrefs carry the id). */
export function getSocialGroupContext(groupId: string): AppContext {
  const cached = socialGroupContexts.get(groupId);
  if (cached) return cached;
  const base = getAppContext("social");
  const basePath = `${SOCIAL_BASE}/groups/${encodeURIComponent(groupId)}`;
  const mobile: NavItemId[] = ["overview", "activities", "chat"];
  const context: AppContext = {
    ...base,
    basePath,
    nav: socialGroupNavIds.map((id) => navItem(id, basePath, mobile, "all")),
    rail: socialGroupRail,
    workspaceId: groupId,
  };
  socialGroupContexts.set(groupId, context);
  return context;
}
