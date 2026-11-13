import { ExpensesScreen } from "@/features/companies/expenses/expenses-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-08 · Expenses: /companies/[id]/expenses (+ ?sheet=expense-new) (inside the company gate). */
export default function CompanyExpensesPage() {
  return <ExpensesScreen />;
}
