import { Suspense } from "react";
import type { Metadata } from "next";
import { InsightsScreen } from "@/features/insights/insights-screen";
import { personalPageMetadata } from "@/features/personal/personal-skeleton";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("insights");
}

/** P15 · Insights: /personal/insights; ?tab=focus|time|signals|estimates|habits and ?period=4w|3m|year are read by the screen. */
export default function InsightsPage() {
  return (
    // Insights is a hideable module: hidden, the route shows "Module hidden".
    <ModuleGate module="insights">
      <Suspense fallback={null}>
        <InsightsScreen />
      </Suspense>
    </ModuleGate>
  );
}
