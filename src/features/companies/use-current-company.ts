"use client";

import { usePathname } from "next/navigation";
import { useCompanyAccess } from "@/data/company-queries";
import { getCompanyIdFromPathname } from "@/features/navigation/paths";
import { companyDemoAccessOptions, useCompanyDemoState } from "./demo-state";

/*
 * The company in the URL (/companies/[id]/…) with the viewer's access
 * answer, for shell islands outside the company layout (rail, mobile More,
 * switcher, sheet host). Shares the gate's query, demo preview included.
 */
export function useCurrentCompanyAccess() {
  const companyId = getCompanyIdFromPathname(usePathname());
  const demo = useCompanyDemoState();
  const query = useCompanyAccess(companyId, companyDemoAccessOptions(demo));
  const access = query.data;
  return {
    companyId,
    query,
    company: access?.status === "ok" ? access.company : undefined,
    capabilities: access?.status === "ok" ? access.capabilities : undefined,
    myDepartmentIds: access?.status === "ok" ? access.myDepartmentIds : [],
  };
}
