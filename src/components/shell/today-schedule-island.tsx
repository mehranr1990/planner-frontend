"use client";

import { useEffect, useMemo, useState } from "react";
import { isLiveApi } from "@/api/runtime";
import { getPlannerNow } from "@/data/clock";
import { useBlocks } from "@/data/queries";
import { dayOfInstant } from "@/lib/dates/clock-time";
import type { ScheduleBlock } from "./schedule";
import { ScheduleIsland } from "./schedule-island";

/*
 * The top-bar schedule island on real data: today's time blocks from the
 * same repository and cache entry as My Day (useBlocks(day)), so a block
 * added, moved or completed there shows here too. The planner clock is
 * re-read every minute, which moves the now-dot and rolls over at midnight.
 * Mock mode keeps the boards' sample day and says so with the sample tag.
 */

const TICK_MS = 60_000;

function usePlannerInstant(): string {
  const [instant, setInstant] = useState(getPlannerNow);
  useEffect(() => {
    if (!isLiveApi()) return;
    const timer = window.setInterval(() => setInstant(getPlannerNow()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return instant;
}

export function TodayScheduleIsland() {
  const instant = usePlannerInstant();
  const day = dayOfInstant(instant);
  const { data, isPending } = useBlocks(day);
  const blocks = useMemo<ScheduleBlock[]>(
    () =>
      (data ?? []).map((block) => ({
        id: block.id,
        title: block.title,
        start: new Date(block.start),
        end: new Date(block.end),
        scope: block.scope,
      })),
    [data],
  );
  const now = new Date(instant);
  return <ScheduleIsland date={now} now={now} blocks={blocks} loading={isPending} sample={!isLiveApi()} />;
}
