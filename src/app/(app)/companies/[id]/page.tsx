import { CompanyOverviewScreen } from "@/features/companies/overview/company-overview-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-01 · Company overview: /companies/[id] (inside the company gate). */
export default function CompanyOverviewPage() {
  return <CompanyOverviewScreen />;
}
