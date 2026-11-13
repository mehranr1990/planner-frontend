import { CompanyWorkScreen } from "@/features/companies/work/company-work-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-04 · Projects & teams: /companies/[id]/work (inside the company gate). */
export default function CompanyWorkPage() {
  return <CompanyWorkScreen />;
}
