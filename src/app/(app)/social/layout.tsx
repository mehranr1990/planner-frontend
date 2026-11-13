import { Suspense, type ReactNode } from "react";
import { SocialAvailability } from "@/features/social/social-gate";
import { SocialSheetHost } from "@/features/social/sheets/social-sheets";

/*
 * Social (Phase 6, SO-01): /social and every route below it. Live API mode
 * has no Social backend yet → one "not available" state. The sheet host
 * serves ?sheet=group-new · activity-new · connect · expense-propose ·
 * thing-new · item-lend; it reads search params, hence Suspense.
 */
export default function SocialLayout({ children }: { children: ReactNode }) {
  return (
    <SocialAvailability>
      {children}
      <Suspense fallback={null}>
        <SocialSheetHost />
      </Suspense>
    </SocialAvailability>
  );
}
