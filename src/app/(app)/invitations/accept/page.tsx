import { Suspense } from "react";
import { InvitationLanding } from "@/features/invitations/invitation-landing";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** Signed-in invitation landing: explicit accept / decline (never automatic). */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <InvitationLanding />
    </Suspense>
  );
}
