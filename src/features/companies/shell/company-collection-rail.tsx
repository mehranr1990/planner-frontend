"use client";

import { LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useCompanyDirectory } from "@/data/company-queries";
import { companyHref } from "@/features/navigation/contexts";
import { ProjectTile } from "@/features/projects/project-visuals";
import { cn } from "@/lib/cn";
import { useOpenCompanySheet } from "../sheets/company-sheet-params";

const RECENT_IN_RAIL = 4;

/**
 * CompanyCollectionRail (/companies, CS-01 "Rails"): All companies, my
 * active companies as initials tiles (recent first, max 4), New company.
 * Only companies I belong to; nothing shows while the directory loads.
 */
export function CompanyCollectionRail({
  ariaLabel,
  tooltipSide,
  className,
}: {
  ariaLabel: string;
  tooltipSide: "left" | "right";
  className?: string;
}) {
  const t = useTranslations("Navigation");
  const tCompany = useTranslations("Company");
  const pathname = usePathname();
  const directory = useCompanyDirectory();
  const openSheet = useOpenCompanySheet();
  const live = (directory.data?.companies ?? []).filter((company) => company.lifecycle === "active");
  const recentIds = directory.data?.recentIds ?? [];
  const ordered = [
    ...recentIds.map((id) => live.find((company) => company.id === id)).filter((company) => company !== undefined),
    ...live.filter((company) => !recentIds.includes(company.id)),
  ].slice(0, RECENT_IN_RAIL);
  const allActive = pathname === "/companies";

  return (
    <nav
      aria-label={ariaLabel}
      data-scope="company"
      data-rail="collection"
      className={cn("flex max-h-full w-16 shrink-0 flex-col rounded-card bg-surface p-1 text-fg shadow-island", className)}
    >
      <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]">
        <Tooltip side={tooltipSide} content={t("items.allCompanies")}>
          <Link
            href="/companies"
            aria-current={allActive ? "page" : undefined}
            className={cn(
              "flex h-12 w-full items-center justify-center rounded-pill transition-colors",
              allActive ? "bg-scope-soft text-scope-deep" : "text-fg-secondary hover:bg-subtle",
            )}
          >
            <Icon icon={LayoutDashboard} />
            <span className="sr-only">{t("items.allCompanies")}</span>
          </Link>
        </Tooltip>
        {ordered.length > 0 ? (
          <>
            <span aria-hidden="true" data-slot="rail-separator" className="mx-2 my-1.5 h-px bg-line" />
            <ul aria-label={tCompany("rail.yours")} className="flex flex-col gap-1">
              {ordered.map((company) => (
                <li key={company.id}>
                  <Tooltip side={tooltipSide} content={company.name}>
                    <Link
                      href={companyHref(company.id)}
                      className="flex h-12 w-full items-center justify-center rounded-pill transition-colors hover:bg-subtle"
                    >
                      <ProjectTile initials={company.initials} tint={company.tint} size="sm" />
                      <span className="sr-only">
                        <bdi>{company.name}</bdi>
                      </span>
                    </Link>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      <div className="mt-auto flex shrink-0 flex-col gap-1 px-1 pt-3 pb-1">
        <Tooltip side={tooltipSide} content={t("contexts.company.add")}>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => openSheet("company-new")}
            className="flex h-12 w-full items-center justify-center rounded-pill bg-primary text-on-accent transition-colors hover:bg-primary-hover"
          >
            <Icon icon={Plus} />
            <span className="sr-only">{t("contexts.company.add")}</span>
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
