import { Suspense, type ReactNode } from "react";
import { TeamSheetHost } from "@/features/teams/sheets/team-sheet-host";

/*
 * Teams (Phase 3): the collection and every /teams/[id]/… route. The team
 * sheet host serves ?sheet=team-new · team-invite · team-status here
 * (TM-90); it reads search params, hence Suspense.
 */
export default function TeamsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <TeamSheetHost />
      </Suspense>
    </>
  );
}
