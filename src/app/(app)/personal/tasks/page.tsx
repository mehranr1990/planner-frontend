import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata, PersonalSkeleton } from "@/features/personal/personal-skeleton";
import { SearchParamsProbe, TaskLinksProbe } from "@/features/personal/seams";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("tasks");
}

export default function TasksPage() {
  return (
    <PersonalSkeleton page="tasks">
      <Suspense fallback={null}>
        <SearchParamsProbe names={["view","tab","group"]} />
      </Suspense>
      <TaskLinksProbe />
    </PersonalSkeleton>
  );
}
