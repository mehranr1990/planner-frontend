import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata } from "@/features/personal/personal-skeleton";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";
import { TasksScreen } from "@/features/tasks/tasks-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("tasks");
}

/** P03 · Tasks (List). ?view= ?tab= ?group= ?sort= ?q= and the filter params are read by the screen's provider. */
export default function TasksPage() {
  return (
    // Tasks is a core module (never hidden); the gate keeps every Personal page on one rule.
    <ModuleGate module="tasks">
      <Suspense fallback={null}>
        <TasksScreen />
      </Suspense>
    </ModuleGate>
  );
}
