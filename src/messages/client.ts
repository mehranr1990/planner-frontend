import type { Locale } from "@/lib/locale/config";
import enBrainDump from "./en/brainDump.json";
import enCalendar from "./en/calendar.json";
import enCommon from "./en/common.json";
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
import enSettings from "./en/settings.json";
import enShell from "./en/shell.json";
import enShutdown from "./en/shutdown.json";
import enTasks from "./en/tasks.json";
import enUi from "./en/ui.json";
import faBrainDump from "./fa/brainDump.json";
import faCalendar from "./fa/calendar.json";
import faCommon from "./fa/common.json";
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
import faSettings from "./fa/settings.json";
import faShell from "./fa/shell.json";
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
};

export type ClientMessages = typeof en;

const fa: ClientMessages = {
  Common: faCommon,
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
};

export const clientMessages: Record<Locale, ClientMessages> = { en, fa };
