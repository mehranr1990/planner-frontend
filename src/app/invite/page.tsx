import { InviteCatcher } from "@/features/invitations/invite-catcher";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** Invitation email link (public): hands the in-memory proof to the signed-in landing. */
export default function Page() {
  return <InviteCatcher />;
}
