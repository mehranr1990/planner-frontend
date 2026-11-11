import { Suspense } from "react";
import { TeamTaskDrawer } from "@/features/teams/task-detail/team-task-drawer";

type Params = Promise<{ taskId: string }>;

async function Drawer({ params }: { params: Params }) {
  const { taskId } = await params;
  return <TeamTaskDrawer taskId={decodeURIComponent(taskId)} />;
}

/** Soft navigation inside a team: the TM-15 drawer over the list it was opened from. */
export default function InterceptedTeamTaskDetail({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Drawer params={params} />
    </Suspense>
  );
}
