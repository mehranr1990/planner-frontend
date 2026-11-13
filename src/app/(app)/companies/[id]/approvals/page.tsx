import { ApprovalsScreen } from "@/features/companies/approvals/approvals-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-09 · Approvals: /companies/[id]/approvals (inside the company gate). */
export default function CompanyApprovalsPage() {
  return <ApprovalsScreen />;
}
