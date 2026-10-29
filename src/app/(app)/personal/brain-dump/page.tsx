import { Suspense } from "react";
import type { Metadata } from "next";
import { BrainDumpScreen } from "@/features/brain-dump/brain-dump-screen";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("braindump");
}

/** P08 · Brain Dump. ?date=YYYY-MM-DD opens an older page (default: today's). */
export default function BrainDumpPage() {
  return (
    // A hideable module: hidden in Settings, the route shows the hidden-module state.
    <ModuleGate module="braindump">
      <Suspense fallback={null}>
        <BrainDumpScreen />
      </Suspense>
    </ModuleGate>
  );
}
