import { Suspense } from "react";
import { ProjectTaskDrawer } from "@/features/projects/task-detail/project-task-drawer";

type Params = Promise<{ taskId: string }>;

async function Drawer({ params }: { params: Params }) {
  const { taskId } = await params;
  return <ProjectTaskDrawer taskId={decodeURIComponent(taskId)} />;
}

/** Soft navigation inside a project: the PJ-15 drawer over the list it was opened from. */
export default function InterceptedProjectTaskDetail({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Drawer params={params} />
    </Suspense>
  );
}
