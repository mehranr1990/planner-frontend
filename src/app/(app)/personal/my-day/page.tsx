import { Suspense } from "react";
import type { Metadata } from "next";
import { MyDayScreen } from "@/features/my-day/my-day-screen";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("myday");
}

/** P02 · My Day. ?date=1405-07-21 and ?view=3days are read by the screen's provider. */
export default function MyDayPage() {
  return (
    // My Day is a core module (never hidden); the gate keeps every Personal page on one rule.
    <ModuleGate module="myday">
      <Suspense fallback={null}>
        <MyDayScreen />
      </Suspense>
    </ModuleGate>
  );
}
