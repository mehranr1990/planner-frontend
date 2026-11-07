import { Suspense, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ProjectGate } from "@/features/projects/project-gate";
import { ProjectDrawerGate } from "@/features/projects/task-detail/project-task-drawer";

/*
 * Inside a project (/projects/[id]/…, D1). The gate loads the access answer
 * and capabilities and shows the SH-02 full-page states; pages render inside
 * it. `drawer` is this layout's own @drawer slot: a soft navigation to
 * /projects/[id]/tasks/[taskId] is intercepted there (PJ-15 drawer); a hard
 * load renders the full page. Separate from Personal's slot; no catch-all.
 */
export default function ProjectLayout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <ProjectGate>
        {children}
        <ProjectDrawerGate>{drawer}</ProjectDrawerGate>
      </ProjectGate>
    </Suspense>
  );
}
