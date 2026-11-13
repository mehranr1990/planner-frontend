import { EmployeeFileScreen } from "@/features/companies/file/employee-file-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-12 · Employee file (sealed): /companies/[id]/people/[personId]/file (inside the company gate). */
export default function CompanyEmployeeFilePage() {
  return <EmployeeFileScreen />;
}
