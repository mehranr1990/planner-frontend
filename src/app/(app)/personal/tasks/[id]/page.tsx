import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { TaskDetailBody } from "@/features/personal/task-detail";
import { TaskDetailLoading } from "@/features/tasks/detail/task-detail-view";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("taskDetail");
}

type Params = Promise<{ id: string }>;

async function Detail({ params }: { params: Params }) {
  const { id } = await params;
  return <TaskDetailBody id={id} />;
}

/**
 * Hard navigation (shared link, refresh) and mobile: the full P06 page.
 * data-skeleton is the route marker the e2e specs look for.
 */
export default function TaskDetailPage({ params }: { params: Params }) {
  return (
    <section data-skeleton="taskDetail" data-scope="personal" className="mx-auto flex w-full max-w-[560px] flex-col">
      <Suspense fallback={<TaskDetailLoading />}>
        <Detail params={params} />
      </Suspense>
    </section>
  );
}
