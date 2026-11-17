"use client";

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRepositories } from "@/data/provider";
import { serviceKeys, useScheduleCapacity, useWorkingHours } from "@/data/personal-services-queries";
import { addDaysToDay, weekdayOfDay } from "@/lib/dates/clock-time";

/*
 * Server capacity for the seven days from `start` (the weekly review's next
 * week). The weekly read needs a week start that follows the account's
 * week-start setting; when the planner's week starts on another day, the
 * seven day reads are used instead (shared with My Day's cache). Returns
 * undefined while not served (mock mode or loading: the local model stays),
 * else ISO day → available minutes (null = unknown or failed, never invented).
 */
export function useNextWeekCapacity(start: string | null): ReadonlyMap<string, number | null> | undefined {
  const { workingHours } = useRepositories();
  const account = useWorkingHours(start !== null);
  const aligned = start !== null && account.data !== undefined && weekdayOfDay(start) === account.data.firstDayOfWeek;
  const weekly = useScheduleCapacity(aligned ? { weekStartDate: start } : null);
  const dates = start !== null && account.data !== undefined && !aligned ? Array.from({ length: 7 }, (_, index) => addDaysToDay(start, index)) : [];
  const daily = useQueries({
    queries: dates.map((date) => ({ queryKey: serviceKeys.capacity({ date }), queryFn: () => workingHours.capacity({ date }), staleTime: 30_000 })),
  });
  const dailyData = daily.map((query) => query.data);
  const dailyKey = JSON.stringify(dailyData);
  const failed = account.isError || weekly.isError || daily.some((query) => query.isError);

  return useMemo(() => {
    if (failed && start !== null) return new Map(Array.from({ length: 7 }, (_, index) => [addDaysToDay(start, index), null]));
    const results = aligned ? [weekly.data] : dailyData;
    if (results.length === 0 || results.some((result) => !result)) return undefined;
    const map = new Map<string, number | null>();
    for (const result of results) for (const day of result!.days) map.set(day.date, day.state === "CONFIGURED" ? day.availableMinutes : null);
    return map;
    // dailyKey stands in for the per-render dailyData array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, start, aligned, weekly.data, dailyKey]);
}
