import { Suspense, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { TeamGate } from "@/features/teams/team-gate";
import { TeamDrawerGate } from "@/features/teams/task-detail/team-task-drawer";

/*
 * Inside a team (/teams/[id]/…, T1). The gate loads the access answer and
 * capabilities and shows the SH-02 + TS-01 full-page states; pages render
 * inside it. `drawer` is this layout's own @drawer slot: a soft navigation to
 * /teams/[id]/work/[taskId] is intercepted there (TM-15 drawer); a hard load
 * renders the full page. Separate from Personal and Project; no catch-all.
 */
export default function TeamLayout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <TeamGate>
        {children}
        <TeamDrawerGate>{drawer}</TeamDrawerGate>
      </TeamGate>
    </Suspense>
  );
}
