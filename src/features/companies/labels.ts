"use client";

import { useTranslations } from "next-intl";
import type { CompanyRole } from "@/data/company-domain";

/** Localised labels for company enums (roles). Board FA: مالک · ادمین سازمان · مدیر دپارتمان · سرپرست تیم · عضو · بیننده. */
export function useCompanyLabels() {
  const t = useTranslations("Company.roles");
  return { role: (role: CompanyRole) => t(role) };
}
