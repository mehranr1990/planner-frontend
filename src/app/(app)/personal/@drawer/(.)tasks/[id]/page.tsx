import { Suspense } from "react";
import { TaskDetailDrawer } from "@/features/personal/task-detail";

type Params = Promise<{ id: string }>;

async function Drawer({ params }: { params: Params }) {
  const { id } = await params;
  return <TaskDetailDrawer id={id} />;
}

/** Soft navigation inside Personal: P06 drawer over the page it was opened from. */
export default function InterceptedTaskDetail({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Drawer params={params} />
    </Suspense>
  );
}
