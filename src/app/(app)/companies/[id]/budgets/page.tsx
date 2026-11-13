import { BudgetsScreen } from "@/features/companies/budgets/budgets-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-10 · Budgets: /companies/[id]/budgets (inside the company gate). */
export default function CompanyBudgetsPage() {
  return <BudgetsScreen />;
}
