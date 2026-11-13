import { ResourcesScreen } from "@/features/companies/resources/resources-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-06 · Resources & capacity: /companies/[id]/resources (inside the company gate). */
export default function CompanyResourcesPage() {
  return <ResourcesScreen />;
}
