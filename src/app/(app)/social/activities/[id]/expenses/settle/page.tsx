import { ActivitySettleScreen } from "@/features/social/expenses/settle-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-09 · Settle up (activity scope) */
export default function Page() {
  return <ActivitySettleScreen />;
}
