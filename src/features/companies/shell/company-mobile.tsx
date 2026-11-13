"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { MoreTile } from "@/components/shell/personal-mobile";
import { Icon } from "@/components/ui/icon";
import type { AppContext } from "@/features/navigation/types";
import { useNavItemFilter } from "@/features/navigation/use-nav-state";
import { useOpenCompanySheet } from "../sheets/company-sheet-params";
import { useCurrentCompanyAccess } from "../use-current-company";

/*
 * The Companies "More" sheet (CS-01 Mobile, C11): inside a company, a
 * 3-column grid of every module not in the bottom bar (Departments, People,
 * Goals, Resources, Expenses, Budgets, Knowledge, Reports, Settings) under
 * the company name, capability-filtered like the rail. On the collection it
 * offers New company. No Assistant.
 */
export function CompanyMoreContent({ context, onNavigate }: { context: AppContext; onNavigate: () => void }) {
  const tNav = useTranslations("Navigation");
  const visible = useNavItemFilter(context);
  const { company } = useCurrentCompanyAccess();
  const openSheet = useOpenCompanySheet();
  const items = context.nav.filter((item) => item.mobileOrder === undefined && visible(item));

  return (
    <div className="flex flex-col gap-2" data-scope="company">
      {company ? (
        <p className="px-3.5 pt-1 type-title text-fg">
          <bdi>{company.name}</bdi>
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul aria-label={tNav("moreLabel", { context: tNav(context.labelKey) })} className="grid grid-cols-3 gap-1">
          {items.map((item) => (
            <MoreTile key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
      {context.workspaceId ? null : (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            onNavigate();
            openSheet("company-new");
          }}
          className="flex h-12 w-full items-center gap-3 rounded-pill px-3.5 text-start text-sm font-medium text-fg transition-colors hover:bg-subtle"
        >
          <Icon icon={Plus} className="text-fg-secondary" />
          <span className="min-w-0 flex-1 truncate">{tNav("contexts.company.add")}</span>
        </button>
      )}
    </div>
  );
}
