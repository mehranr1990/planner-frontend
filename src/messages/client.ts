import type { Locale } from "@/lib/locale/config";
import enCommon from "./en/common.json";
import enFeedback from "./en/feedback.json";
import enNavigation from "./en/navigation.json";
import enPersonal from "./en/personal.json";
import enSettings from "./en/settings.json";
import enShell from "./en/shell.json";
import enUi from "./en/ui.json";
import faCommon from "./fa/common.json";
import faFeedback from "./fa/feedback.json";
import faNavigation from "./fa/navigation.json";
import faPersonal from "./fa/personal.json";
import faSettings from "./fa/settings.json";
import faShell from "./fa/shell.json";
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
  Shell: enShell,
  Settings: enSettings,
};

export type ClientMessages = typeof en;

const fa: ClientMessages = {
  Common: faCommon,
  UI: faUi,
  Feedback: faFeedback,
  Navigation: faNavigation,
  Personal: faPersonal,
  Shell: faShell,
  Settings: faSettings,
};

export const clientMessages: Record<Locale, ClientMessages> = { en, fa };
