import { Suspense } from "react";
import { HardNavigation } from "@/features/personal/hard-navigation";
import { TaskDetailDrawer } from "@/features/personal/task-detail";

type Params = Promise<{ id: string }>;

async function Drawer({ params }: { params: Params }) {
  const { id } = await params;
  // Next's interception rewrite for /personal/tasks/:id also matches the static
  // /personal/tasks/new; hand that one to a full page load (P05 is a page).
  if (id === "new") return <HardNavigation href="/personal/tasks/new" />;
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
