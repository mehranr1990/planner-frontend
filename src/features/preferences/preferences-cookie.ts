import { defaultPreferences, parsePreferences, type Preferences } from "./preferences-store";

/*
 * Preferences travel in one first-party cookie so the server can render the
 * right language, direction and formats on the first byte. Shared by server
 * (reading) and client (writing); no server-only or browser-only imports.
 */

export const PREFERENCES_COOKIE = "mp-preferences";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function serializePreferences(preferences: Preferences): string {
  return encodeURIComponent(JSON.stringify(preferences));
}

/** Accepts the raw (encoded) or already-decoded cookie value. */
export function parsePreferencesCookie(raw: string | null | undefined): Preferences {
  if (!raw) return defaultPreferences;
  for (const candidate of [raw, safeDecode(raw)]) {
    try {
      return parsePreferences(JSON.parse(candidate));
    } catch {
      // try the next form
    }
  }
  return defaultPreferences;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The full Set-Cookie style string for document.cookie. */
export function preferencesCookieString(preferences: Preferences): string {
  return `${PREFERENCES_COOKIE}=${serializePreferences(preferences)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
