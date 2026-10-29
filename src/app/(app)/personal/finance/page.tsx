import { Suspense } from "react";
import type { Metadata } from "next";
import { FinanceScreen } from "@/features/finance/finance-screen";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("finance");
}

/** P13 · Finance: /personal/finance; ?tab=overview|trends|breakdown|transactions and ?month=1405-07 are read by the screen. */
export default function FinancePage() {
  return (
    // Finance is a hideable module: hidden, the route shows "Module hidden".
    <ModuleGate module="finance">
      <Suspense fallback={null}>
        <FinanceScreen />
      </Suspense>
    </ModuleGate>
  );
}
