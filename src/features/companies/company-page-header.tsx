"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/navigation/breadcrumbs";
import { PageHeader } from "@/components/shell/page-header";
import { companyHref } from "@/features/navigation/contexts";
import type { NavItemId } from "@/features/navigation/types";
import { CompanyBanner, useCompany } from "./company-gate";
import { DepartmentScopeChip } from "./department-scope";

/*
 * Page header for every company screen (same anatomy as Projects / Teams):
 * breadcrumb Companies › company › module › resource, title, the department
 * scope chip beside it (screens whose data it narrows), actions, and the
 * one banner directly under it.
 */
export interface CompanyPageHeaderProps {
  module?: NavItemId;
  resource?: string;
  /** Extra crumbs between the module and the resource (e.g. Expenses › Reimbursements). */
  trail?: BreadcrumbItem[];
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Show the department scope chip (narrows only). */
  scope?: boolean;
  /** More controls beside the title (CO-01 quarter). */
  titleExtra?: ReactNode;
}

export function CompanyPageHeader({ module, resource, trail = [], title, subtitle, actions, scope = false, titleExtra }: CompanyPageHeaderProps) {
  const tNav = useTranslations("Navigation");
  const t = useTranslations("Company");
  const { company } = useCompany();
  const items: BreadcrumbItem[] = [
    { label: t("breadcrumb"), href: "/companies" },
    { label: company.name, href: companyHref(company.id) },
  ];
  if (module && module !== "overview") {
    items.push({ label: tNav(module === "work" ? "items.companyWork" : `items.${module}`), href: companyHref(company.id, module) });
  }
  items.push(...trail);
  if (resource) items.push({ label: resource });
  else items[items.length - 1] = { label: items[items.length - 1]!.label };
  const addon =
    scope || titleExtra ? (
      <div className="flex flex-wrap items-center gap-2">
        {scope ? <DepartmentScopeChip /> : null}
        {titleExtra}
      </div>
    ) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        breadcrumb={<Breadcrumbs scope="company" items={items} middleTruncate />}
        title={title}
        titleAddon={addon}
        subtitle={subtitle}
        actions={actions}
      />
      <CompanyBanner />
    </div>
  );
}
