import { CompanyPeopleScreen } from "@/features/companies/people/people-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-03 · People directory: /companies/[id]/people (inside the company gate). */
export default function CompanyPeoplePage() {
  return <CompanyPeopleScreen />;
}
