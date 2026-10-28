import { Suspense } from "react";
import type { Metadata } from "next";
import { GoalsScreen } from "@/features/goals/goals-screen";
import { personalPageMetadata } from "@/features/personal/personal-skeleton";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("goals");
}

type Params = Promise<{ id?: string[] }>;

async function Screen({ params }: { params: Params }) {
  const { id } = await params;
  const goalId = id?.[0] ? decodeURIComponent(id[0]) : null;
  return <GoalsScreen goalId={goalId} />;
}

/** P11 · Goals: /personal/goals and /personal/goals/:id; ?tab=journey|results|linked|notes is read by the screen. */
export default function GoalsPage({ params }: { params: Params }) {
  return (
    // Goals is a hideable module: hidden, the route shows "Module hidden".
    <ModuleGate module="goals">
      <Suspense fallback={null}>
        <Screen params={params} />
      </Suspense>
    </ModuleGate>
  );
}
