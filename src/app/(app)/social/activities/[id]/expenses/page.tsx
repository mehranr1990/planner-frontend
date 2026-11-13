import { ActivityExpensesScreen } from "@/features/social/expenses/expenses-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-07 · Shared expenses (activity scope) */
export default function Page() {
  return <ActivityExpensesScreen />;
}
