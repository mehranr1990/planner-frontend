import { GroupChat } from "@/features/social/group/group-chat";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-04 · Chat: the group conversation in Messages (Phase 5 engine) */
export default function Page() {
  return <GroupChat />;
}
