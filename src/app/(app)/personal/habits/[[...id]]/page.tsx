import { Suspense } from "react";
import type { Metadata } from "next";
import { HabitsScreen } from "@/features/habits/habits-screen";
import { personalPageMetadata } from "@/features/personal/personal-skeleton";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("habits");
}

type Params = Promise<{ id?: string[] }>;

async function Screen({ params }: { params: Params }) {
  const { id } = await params;
  const habitId = id?.[0] ? decodeURIComponent(id[0]) : null;
  return <HabitsScreen habitId={habitId} />;
}

/** P12 · Habits: /personal/habits and /personal/habits/:id; ?period=14d|month|year is read by the screen. */
export default function HabitsPage({ params }: { params: Params }) {
  return (
    // Habits is a hideable module: hidden, the route shows "Module hidden".
    <ModuleGate module="habits">
      <Suspense fallback={null}>
        <Screen params={params} />
      </Suspense>
    </ModuleGate>
  );
}
