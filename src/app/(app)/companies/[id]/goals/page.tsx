import { CompanyGoalsScreen } from "@/features/companies/goals/company-goals-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-05 · Company goals: /companies/[id]/goals (inside the company gate). */
export default function CompanyGoalsPage() {
  return <CompanyGoalsScreen />;
}
