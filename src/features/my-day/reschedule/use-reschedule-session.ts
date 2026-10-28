"use client";

import { useMyDay, type RescheduleRequest } from "../my-day-context";
import { useRescheduleSession as useSharedSession, type RescheduleSession } from "@/features/reschedule/use-reschedule-session";

export type { RescheduleSession };

/** My Day's Reschedule session: the shared session around the day on screen. */
export function useRescheduleSession(request: Pick<RescheduleRequest, "target" | "preselect">): RescheduleSession {
  const { day } = useMyDay();
  return useSharedSession(request, day);
}
