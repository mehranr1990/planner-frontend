import { Suspense, type ReactNode } from "react";
import { CompanySheetHost } from "@/features/companies/sheets/company-sheet-host";

/*
 * Companies (Phase 4): the collection and every /companies/[id]/… route.
 * The company sheet host serves ?sheet=company-new · company-invite ·
 * department-new · expense-new (CO-90, CO-08); it reads search params, hence
 * Suspense.
 */
export default function CompaniesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <CompanySheetHost />
      </Suspense>
    </>
  );
}
