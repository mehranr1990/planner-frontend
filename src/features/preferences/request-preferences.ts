import { cookies } from "next/headers";
import { cache } from "react";
import { parsePreferencesCookie, PREFERENCES_COOKIE } from "./preferences-cookie";
import type { Preferences } from "./preferences-store";

/**
 * Server-side preference resolution for the current request. This is the
 * seam for account-level sync: a signed-in user's stored preferences can be
 * read here later without touching any consumer.
 */
export const getRequestPreferences = cache(async (): Promise<Preferences> => {
  const cookieStore = await cookies();
  return parsePreferencesCookie(cookieStore.get(PREFERENCES_COOKIE)?.value);
});
