import { ReimbursementsScreen } from "@/features/companies/reimbursements/reimbursements-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-11 · Reimbursements: /companies/[id]/expenses/reimbursements (inside the company gate). */
export default function CompanyReimbursementsPage() {
  return <ReimbursementsScreen />;
}
