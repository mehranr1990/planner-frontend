import { DepartmentsScreen } from "@/features/companies/departments/departments-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** CO-02 · Departments: /companies/[id]/departments (inside the company gate). */
export default function CompanyDepartmentsPage() {
  return <DepartmentsScreen />;
}
