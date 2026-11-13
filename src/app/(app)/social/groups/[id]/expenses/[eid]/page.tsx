import { ExpenseDetailScreen } from "@/features/social/expenses/expense-detail-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-08 · Expense detail & split */
export default function Page() {
  return <ExpenseDetailScreen />;
}
