import { DEFAULT_PLANNER_SETTINGS, parsePlannerSettings, type PlannerSettings } from "./planner-settings";

/*
 * Planner settings travel in one first-party cookie, next to the display
 * preferences (mp-preferences), so the server renders the rail and hidden
 * module pages correctly on the first byte. Shared by server (reading) and
 * client (writing); no server-only or browser-only imports.
 */

export const PLANNER_SETTINGS_COOKIE = "mp-planner";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function serializePlannerSettings(settings: PlannerSettings): string {
  return encodeURIComponent(JSON.stringify(settings));
}

/** Accepts the raw (encoded) or already-decoded cookie value. */
export function parsePlannerSettingsCookie(raw: string | null | undefined): PlannerSettings {
  if (!raw) return DEFAULT_PLANNER_SETTINGS;
  for (const candidate of [raw, safeDecode(raw)]) {
    try {
      return parsePlannerSettings(JSON.parse(candidate));
    } catch {
      // try the next form
    }
  }
  return DEFAULT_PLANNER_SETTINGS;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The full Set-Cookie style string for document.cookie. */
export function plannerSettingsCookieString(settings: PlannerSettings): string {
  return `${PLANNER_SETTINGS_COOKIE}=${serializePlannerSettings(settings)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
