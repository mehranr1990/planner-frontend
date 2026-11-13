import { GroupExpensesScreen } from "@/features/social/expenses/expenses-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-07 · Shared expenses & balances (group) */
export default function Page() {
  return <GroupExpensesScreen />;
}
