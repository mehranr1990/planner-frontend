import type { NavItemId } from "@/features/navigation/types";

/*
 * Route segments under /companies/[id] and the rail item each belongs to
 * (CS-01). Built screens get their own static segment, which wins over
 * [module]. Server-safe.
 */
export const companyModuleSegments: Readonly<Record<string, NavItemId>> = {
  departments: "departments",
  people: "people",
  work: "work",
  goals: "goals",
  resources: "resources",
  expenses: "expenses",
  approvals: "approvals",
  budgets: "budgets",
  knowledge: "knowledge",
  reports: "reports",
  settings: "settings",
};
