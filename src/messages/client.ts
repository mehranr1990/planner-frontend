import type { Locale } from "@/lib/locale/config";
import enAccess from "./en/access.json";
import enAuth from "./en/auth.json";
import enBrainDump from "./en/brainDump.json";
import enCalendar from "./en/calendar.json";
import enCommon from "./en/common.json";
import enContextShell from "./en/contextShell.json";
import enFeedback from "./en/feedback.json";
import enFinance from "./en/finance.json";
import enFocus from "./en/focus.json";
import enGoals from "./en/goals.json";
import enHabits from "./en/habits.json";
import enInbox from "./en/inbox.json";
import enInsights from "./en/insights.json";
import enJournal from "./en/journal.json";
import enMyDay from "./en/myDay.json";
import enNavigation from "./en/navigation.json";
import enOverview from "./en/overview.json";
import enPersonal from "./en/personal.json";
import enProject from "./en/project.json";
import enProjects from "./en/projects.json";
import enProjectTask from "./en/projectTask.json";
import enProjectTasks from "./en/projectTasks.json";
import enTimeline from "./en/timeline.json";
import enProjectCalendar from "./en/projectCalendar.json";
import enGantt from "./en/gantt.json";
import enMilestones from "./en/milestones.json";
import enProjectBoard from "./en/projectBoard.json";
import enRisks from "./en/risks.json";
import enRisk from "./en/risk.json";
import enSettings from "./en/settings.json";
import enShell from "./en/shell.json";
import enReview from "./en/review.json";
import enShutdown from "./en/shutdown.json";
import enTasks from "./en/tasks.json";
import enUi from "./en/ui.json";
import faAccess from "./fa/access.json";
import faAuth from "./fa/auth.json";
import faBrainDump from "./fa/brainDump.json";
import faCalendar from "./fa/calendar.json";
import faCommon from "./fa/common.json";
import faContextShell from "./fa/contextShell.json";
import faFeedback from "./fa/feedback.json";
import faFinance from "./fa/finance.json";
import faFocus from "./fa/focus.json";
import faGoals from "./fa/goals.json";
import faHabits from "./fa/habits.json";
import faInbox from "./fa/inbox.json";
import faInsights from "./fa/insights.json";
import faJournal from "./fa/journal.json";
import faMyDay from "./fa/myDay.json";
import faNavigation from "./fa/navigation.json";
import faOverview from "./fa/overview.json";
import faPersonal from "./fa/personal.json";
import faProject from "./fa/project.json";
import faProjects from "./fa/projects.json";
import faProjectTask from "./fa/projectTask.json";
import faProjectTasks from "./fa/projectTasks.json";
import faTimeline from "./fa/timeline.json";
import faProjectCalendar from "./fa/projectCalendar.json";
import faGantt from "./fa/gantt.json";
import faMilestones from "./fa/milestones.json";
import faProjectBoard from "./fa/projectBoard.json";
import faRisks from "./fa/risks.json";
import faRisk from "./fa/risk.json";
import faSettings from "./fa/settings.json";
import faShell from "./fa/shell.json";
import faReview from "./fa/review.json";
import faShutdown from "./fa/shutdown.json";
import faTasks from "./fa/tasks.json";
import faUi from "./fa/ui.json";

/*
 * The namespaces client components read outside the styleguide. The root
 * client provider ships these for both locales (so switching language is
 * instant) and nothing else: Home is rendered on the server only, and the
 * styleguide supplies its own namespace (see ./styleguide.ts).
 *
 * Reading a new namespace with useTranslations in a client component outside
 * the styleguide? Add it here; messages.test.ts checks this list against the source.
 */
const en = {
  Common: enCommon,
  Auth: enAuth,
  UI: enUi,
  Feedback: enFeedback,
  Navigation: enNavigation,
  Personal: enPersonal,
  MyDay: enMyDay,
  Overview: enOverview,
  Tasks: enTasks,
  Inbox: enInbox,
  BrainDump: enBrainDump,
  Calendar: enCalendar,
  Shell: enShell,
  Settings: enSettings,
  Focus: enFocus,
  Shutdown: enShutdown,
  Goals: enGoals,
  Habits: enHabits,
  Finance: enFinance,
  Insights: enInsights,
  Journal: enJournal,
  Review: enReview,
  Access: enAccess,
  ContextShell: enContextShell,
  Projects: enProjects,
  Project: enProject,
  ProjectTasks: enProjectTasks,
  ProjectTask: enProjectTask,
  Timeline: enTimeline,
  ProjectCalendar: enProjectCalendar,
  Gantt: enGantt,
  Milestones: enMilestones,
  ProjectBoard: enProjectBoard,
  Risks: enRisks,
  Risk: enRisk,
};

export type ClientMessages = typeof en;

const fa: ClientMessages = {
  Common: faCommon,
  Auth: faAuth,
  UI: faUi,
  Feedback: faFeedback,
  Navigation: faNavigation,
  Personal: faPersonal,
  MyDay: faMyDay,
  Overview: faOverview,
  Tasks: faTasks,
  Inbox: faInbox,
  BrainDump: faBrainDump,
  Calendar: faCalendar,
  Shell: faShell,
  Settings: faSettings,
  Focus: faFocus,
  Shutdown: faShutdown,
  Goals: faGoals,
  Habits: faHabits,
  Finance: faFinance,
  Insights: faInsights,
  Journal: faJournal,
  Review: faReview,
  Access: faAccess,
  ContextShell: faContextShell,
  Projects: faProjects,
  Project: faProject,
  ProjectTasks: faProjectTasks,
  ProjectTask: faProjectTask,
  Timeline: faTimeline,
  ProjectCalendar: faProjectCalendar,
  Gantt: faGantt,
  Milestones: faMilestones,
  ProjectBoard: faProjectBoard,
  Risks: faRisks,
  Risk: faRisk,
};

export const clientMessages: Record<Locale, ClientMessages> = { en, fa };
