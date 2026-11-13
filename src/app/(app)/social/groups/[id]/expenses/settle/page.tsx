import { GroupSettleScreen } from "@/features/social/expenses/settle-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-09 · Settle up (group) */
export default function Page() {
  return <GroupSettleScreen />;
}
