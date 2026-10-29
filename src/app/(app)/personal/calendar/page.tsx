import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarScreen } from "@/features/calendar/calendar-screen";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("calendar");
}

/** P04 · Calendar. ?view=day/week/month/agenda · ?cal=shamsi/gregorian · ?date=1405-07-21. */
export default function CalendarPage() {
  return (
    <ModuleGate module="calendar">
      <Suspense fallback={null}>
        <CalendarScreen />
      </Suspense>
    </ModuleGate>
  );
}
