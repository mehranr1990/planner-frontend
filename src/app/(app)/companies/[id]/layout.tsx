import { Suspense, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { CompanyGate } from "@/features/companies/company-gate";

/*
 * Inside a company (/companies/[id]/…, C1). The gate loads the access answer
 * and capabilities, shows the SH-02 + CS-01 full-page states and owns the
 * department scope; pages render inside it. Separate custody per company.
 */
export default function CompanyLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <CompanyGate>{children}</CompanyGate>
    </Suspense>
  );
}
