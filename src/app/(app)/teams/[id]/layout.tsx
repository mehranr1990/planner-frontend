import { Suspense, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { TeamGate } from "@/features/teams/team-gate";

/*
 * Inside a team (/teams/[id]/…, T1). The gate loads the access answer and
 * capabilities and shows the SH-02 + TS-01 full-page states; pages render
 * inside it. Separate from the Personal and Project layouts; no catch-all.
 */
export default function TeamLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <TeamGate>{children}</TeamGate>
    </Suspense>
  );
}
