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
import enFiles from "./en/files.json";
import enMembers from "./en/members.json";
import enWorkload from "./en/workload.json";
import enAnalytics from "./en/analytics.json";
import enProjectSettings from "./en/projectSettings.json";
import enSettings from "./en/settings.json";
import enShell from "./en/shell.json";
import enReview from "./en/review.json";
import enShutdown from "./en/shutdown.json";
import enTasks from "./en/tasks.json";
import enUi from "./en/ui.json";
import enTeams from "./en/teams.json";
import enPeopleWorkload from "./en/peopleWorkload.json";
import enCaseFlow from "./en/caseFlow.json";
import enTeam from "./en/team.json";
import enTeamWork from "./en/teamWork.json";
import enTeamTask from "./en/teamTask.json";
import enTeamNew from "./en/teamNew.json";
import enTeamInvite from "./en/teamInvite.json";
import enTeamStatus from "./en/teamStatus.json";
import enTeamCal from "./en/teamCal.json";
import enPlanning from "./en/planning.json";
import enSprint from "./en/sprint.json";
import enBacklog from "./en/backlog.json";
import enTeamProjects from "./en/teamProjects.json";
import enTeamGoals from "./en/teamGoals.json";
import enPeople from "./en/people.json";
import enTeamSettings from "./en/teamSettings.json";
import enTeamAnalytics from "./en/teamAnalytics.json";
import enTeamFeedback from "./en/teamFeedback.json";
import enRecognition from "./en/recognition.json";
import enCheckins from "./en/checkins.json";
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
import faFiles from "./fa/files.json";
import faMembers from "./fa/members.json";
import faWorkload from "./fa/workload.json";
import faAnalytics from "./fa/analytics.json";
import faProjectSettings from "./fa/projectSettings.json";
import faSettings from "./fa/settings.json";
import faShell from "./fa/shell.json";
import faReview from "./fa/review.json";
import faShutdown from "./fa/shutdown.json";
import faTasks from "./fa/tasks.json";
import faUi from "./fa/ui.json";
import faTeams from "./fa/teams.json";
import faPeopleWorkload from "./fa/peopleWorkload.json";
import faCaseFlow from "./fa/caseFlow.json";
import faTeam from "./fa/team.json";
import faTeamWork from "./fa/teamWork.json";
import faTeamTask from "./fa/teamTask.json";
import faTeamNew from "./fa/teamNew.json";
import faTeamInvite from "./fa/teamInvite.json";
import faTeamStatus from "./fa/teamStatus.json";
import faTeamCal from "./fa/teamCal.json";
import faPlanning from "./fa/planning.json";
import faSprint from "./fa/sprint.json";
import faBacklog from "./fa/backlog.json";
import faTeamProjects from "./fa/teamProjects.json";
import faTeamGoals from "./fa/teamGoals.json";
import faPeople from "./fa/people.json";
import faTeamSettings from "./fa/teamSettings.json";
import faTeamAnalytics from "./fa/teamAnalytics.json";
import faTeamFeedback from "./fa/teamFeedback.json";
import faRecognition from "./fa/recognition.json";
import faCheckins from "./fa/checkins.json";

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
  Files: enFiles,
  Members: enMembers,
  Workload: enWorkload,
  Analytics: enAnalytics,
  ProjectSettings: enProjectSettings,
  Teams: enTeams,
  PeopleWorkload: enPeopleWorkload,
  CaseFlow: enCaseFlow,
  Team: enTeam,
  TeamWork: enTeamWork,
  TeamTask: enTeamTask,
  TeamNew: enTeamNew,
  TeamInvite: enTeamInvite,
  TeamStatus: enTeamStatus,
  TeamCal: enTeamCal,
  Planning: enPlanning,
  Sprint: enSprint,
  Backlog: enBacklog,
  TeamProjects: enTeamProjects,
  TeamGoals: enTeamGoals,
  People: enPeople,
  TeamSettings: enTeamSettings,
  TeamAnalytics: enTeamAnalytics,
  TeamFeedback: enTeamFeedback,
  Recognition: enRecognition,
  Checkins: enCheckins,
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
  Files: faFiles,
  Members: faMembers,
  Workload: faWorkload,
  Analytics: faAnalytics,
  ProjectSettings: faProjectSettings,
  Teams: faTeams,
  PeopleWorkload: faPeopleWorkload,
  CaseFlow: faCaseFlow,
  Team: faTeam,
  TeamWork: faTeamWork,
  TeamTask: faTeamTask,
  TeamNew: faTeamNew,
  TeamInvite: faTeamInvite,
  TeamStatus: faTeamStatus,
  TeamCal: faTeamCal,
  Planning: faPlanning,
  Sprint: faSprint,
  Backlog: faBacklog,
  TeamProjects: faTeamProjects,
  TeamGoals: faTeamGoals,
  People: faPeople,
  TeamSettings: faTeamSettings,
  TeamAnalytics: faTeamAnalytics,
  TeamFeedback: faTeamFeedback,
  Recognition: faRecognition,
  Checkins: faCheckins,
};

export const clientMessages: Record<Locale, ClientMessages> = { en, fa };
