import { ReportsScreen } from "@/features/companies/reports/reports-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-13 · Reports, exports, audit: /companies/[id]/reports (inside the company gate). */
export default function CompanyReportsPage() {
  return <ReportsScreen />;
}
