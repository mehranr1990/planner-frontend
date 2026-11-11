import { Suspense } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { TeamTaskDetailView } from "@/features/teams/task-detail/team-task-detail-view";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

type Params = Promise<{ taskId: string }>;

async function Detail({ params }: { params: Params }) {
  const { taskId } = await params;
  return <TeamTaskDetailView taskId={decodeURIComponent(taskId)} variant="page" />;
}

/** TM-15 full page: hard navigation (shared link, refresh) and phones. */
export default function TeamTaskDetailPage({ params }: { params: Params }) {
  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-col">
      <Suspense fallback={<AccessLoading />}>
        <Detail params={params} />
      </Suspense>
    </section>
  );
}
