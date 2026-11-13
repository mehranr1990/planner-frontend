"use client";

import { useTranslations } from "next-intl";
import { UnavailableState } from "@/components/feedback/state-views";
import type { NavItemId } from "@/features/navigation/types";
import { useCompany } from "./company-gate";
import { CompanyPageHeader } from "./company-page-header";

/*
 * Company screens not built yet render the "coming soon" page state until
 * their prompt (CS-01: routes /companies/[id]/… exist from C1). Unknown
 * segments 404.
 */
export function CompanyModulePlaceholder({ module }: { module: NavItemId }) {
  const tNav = useTranslations("Navigation");
  const t = useTranslations("Company.comingSoon");
  const { company } = useCompany();
  const label = module === "overview" ? company.name : tNav(module === "work" ? "items.companyWork" : `items.${module}`);
  return (
    <>
      <CompanyPageHeader module={module} title={label} />
      <UnavailableState title={t("title", { module: label })} description={t("body")} titleAs="h2" />
    </>
  );
}

/** Shown when the role cannot open a module (hidden in the rail; direct URL). */
export function CompanyModuleForbidden({ module }: { module: NavItemId }) {
  const tNav = useTranslations("Navigation");
  const t = useTranslations("Access.states");
  const label = tNav(module === "work" ? "items.companyWork" : `items.${module}`);
  return (
    <>
      <CompanyPageHeader module={module} title={label} />
      <UnavailableState title={t("notAvailable.title")} description={t("notAvailable.description")} titleAs="h2" />
    </>
  );
}
