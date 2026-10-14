import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata, PersonalSkeleton } from "@/features/personal/personal-skeleton";
import { RouteParamProbe } from "@/features/personal/route-param-probe";
import { TaskDetailBody } from "@/features/personal/task-detail";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("taskDetail");
}

type Params = Promise<{ id: string }>;

async function Detail({ params }: { params: Params }) {
  const { id } = await params;
  return (
    <>
      <RouteParamProbe name="id" value={id} />
      <TaskDetailBody id={id} />
    </>
  );
}

/** Hard navigation (shared link, refresh) and mobile: the full P06 page. */
export default function TaskDetailPage({ params }: { params: Params }) {
  return (
    <PersonalSkeleton page="taskDetail">
      <Suspense fallback={null}>
        <Detail params={params} />
      </Suspense>
    </PersonalSkeleton>
  );
}
