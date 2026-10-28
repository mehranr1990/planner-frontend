import type { Metadata } from "next";
import { OverviewScreen } from "@/features/overview/overview-screen";
import { personalPageMetadata } from "@/features/personal/personal-skeleton";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("overview");
}

/** P01 · Personal Overview (mobile: the Today tab's Overview side). */
export default function PersonalOverviewPage() {
  return (
    // Overview is a core module (never hidden); the gate keeps every Personal page on one rule.
    <ModuleGate module="overview">
      <OverviewScreen />
    </ModuleGate>
  );
}
