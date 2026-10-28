"use client";

import { useEffect } from "react";
import { getPlannerToday } from "@/data/clock";
import { useCaptureInbox, useRecordFocusSessions } from "@/data/queries";
import { drain, summaryCycle, type FocusSession } from "./domain/timer";
import { focusStore } from "./focus-store";

/*
 * Writes what a session produced: finished cycles to the plan (so My Day and
 * Overview count them) and, once the session ends, parked distractions to
 * Inbox. The store is drained synchronously first, so two readers mounted at
 * once never write twice.
 */
export function useFocusSync(session: FocusSession | null) {
  const { mutate: record } = useRecordFocusSessions();
  const { mutate: capture } = useCaptureInbox();

  useEffect(() => {
    if (!session) return;
    const hasParked = session.status === "complete" && session.parked.length > 0;
    if (session.unrecorded === 0 && !hasParked) return;
    let taken: ReturnType<typeof drain> | null = null;
    focusStore.update((latest) => {
      if (!latest) return latest;
      taken = drain(latest);
      return taken.session;
    });
    const result = taken as ReturnType<typeof drain> | null;
    if (!result) return;
    if (result.cycles > 0) record({ day: getPlannerToday(), count: result.cycles, cycle: summaryCycle(session) });
    for (const text of result.parked) capture({ text, source: "note" });
  }, [session, record, capture]);
}
