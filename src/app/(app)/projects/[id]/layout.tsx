import { Suspense, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ProjectGate } from "@/features/projects/project-gate";

/*
 * Inside a project (/projects/[id]/…, D1). The gate loads the access answer
 * and capabilities and shows the SH-02 full-page states; pages render inside
 * it. (Search params are read by the gate, hence the Suspense boundary.)
 */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <ProjectGate>{children}</ProjectGate>
    </Suspense>
  );
}
