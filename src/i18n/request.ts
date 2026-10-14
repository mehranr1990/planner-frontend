import { getRequestConfig } from "next-intl/server";
import { getRequestPreferences } from "@/features/preferences/request-preferences";
import { isLocale } from "@/lib/locale/config";
import { messages } from "@/messages";

/*
 * next-intl request config without locale routing: the locale comes from the
 * preferences cookie, so server components (getTranslations, getLocale) and
 * client components agree on the first render.
 */
export default getRequestConfig(async ({ locale }) => {
  const resolved = isLocale(locale) ? locale : (await getRequestPreferences()).locale;
  return { locale: resolved, messages: messages[resolved], timeZone: "Asia/Tehran" };
});
