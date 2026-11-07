import { Suspense } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ProjectTaskDetailView } from "@/features/projects/task-detail/project-task-detail-view";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

type Params = Promise<{ taskId: string }>;

async function Detail({ params }: { params: Params }) {
  const { taskId } = await params;
  return <ProjectTaskDetailView taskId={decodeURIComponent(taskId)} variant="page" />;
}

/** PJ-15 full page: hard navigation (shared link, refresh) and phones. */
export default function ProjectTaskDetailPage({ params }: { params: Params }) {
  return (
    <section data-skeleton="projectTaskDetail" className="mx-auto flex w-full max-w-[560px] flex-col">
      <Suspense fallback={<AccessLoading />}>
        <Detail params={params} />
      </Suspense>
    </section>
  );
}
