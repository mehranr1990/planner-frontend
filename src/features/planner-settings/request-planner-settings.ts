import { cookies } from "next/headers";
import { cache } from "react";
import type { PlannerSettings } from "./planner-settings";
import { parsePlannerSettingsCookie, PLANNER_SETTINGS_COOKIE } from "./planner-settings-cookie";

/**
 * Server-side planner settings for the current request. This is the seam for
 * account-level sync: a signed-in user's stored settings can be read here
 * later without touching any consumer.
 */
export const getRequestPlannerSettings = cache(async (): Promise<PlannerSettings> => {
  const cookieStore = await cookies();
  return parsePlannerSettingsCookie(cookieStore.get(PLANNER_SETTINGS_COOKIE)?.value);
});
