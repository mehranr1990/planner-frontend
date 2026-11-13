import { ApprovalsScreen } from "@/features/companies/approvals/approvals-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-09 · Approval detail: /companies/[id]/approvals/[approvalId] (the screen reads the id from the path) (inside the company gate). */
export default function CompanyApprovalPage() {
  return <ApprovalsScreen />;
}
