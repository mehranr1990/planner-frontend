import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata } from "@/features/personal/personal-skeleton";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";
import { TaskCreateScreen } from "@/features/tasks/create/task-create-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("taskNew");
}

/** P05 · Task Create. Prefilled from Quick Add: ?title= ?date= ?time= ?duration= ?priority= ?energy= ?area= ?scope= ?from=. */
export default function TaskCreatePage() {
  return (
    <ModuleGate module="tasks">
      <Suspense fallback={null}>
        <TaskCreateScreen />
      </Suspense>
    </ModuleGate>
  );
}
