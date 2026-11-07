import { MembersScreen } from "@/features/projects/members/members-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-13 · Members: /projects/[id]/members (?view=invitations | guests). */
export default function ProjectMembersPage() {
  return <MembersScreen />;
}
