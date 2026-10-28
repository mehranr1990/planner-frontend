import { Suspense } from "react";
import type { Metadata } from "next";
import { JournalScreen } from "@/features/journal/journal-screen";
import { personalPageMetadata } from "@/features/personal/personal-skeleton";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("journal");
}

type Params = Promise<{ date?: string[] }>;

async function Screen({ params }: { params: Params }) {
  const { date } = await params;
  return <JournalScreen date={date?.[0] ? decodeURIComponent(date[0]) : null} />;
}

/** P14 · Journal: /personal/journal and /personal/journal/:date (YYYY-MM-DD); locked → lock screen. */
export default function JournalPage({ params }: { params: Params }) {
  return (
    // Journal is a hideable module: hidden, the route shows "Module hidden".
    <ModuleGate module="journal">
      <Suspense fallback={null}>
        <Screen params={params} />
      </Suspense>
    </ModuleGate>
  );
}
