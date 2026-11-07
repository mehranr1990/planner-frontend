import { Suspense, type ReactNode } from "react";
import { ProjectSheetHost } from "@/features/projects/sheets/project-sheet-host";

/*
 * Projects (Phase 2): the collection and every /projects/[id]/… route. The
 * project sheet host serves ?sheet=project-new · project-invite ·
 * assignment-reassign here (PJ-90); it reads search params, hence Suspense.
 */
export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <ProjectSheetHost />
      </Suspense>
    </>
  );
}
