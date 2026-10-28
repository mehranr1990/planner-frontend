import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { dayToDate, getPlannerToday } from "@/data/clock";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { isOptionalModule } from "@/features/planner-settings/modules";
import { ModuleGate } from "@/features/planner-settings/module-hidden-state";
import { getRequestPreferences } from "@/features/preferences/request-preferences";
import { formatDate } from "@/lib/dates/format";
import { convertDigits } from "@/lib/locale/digits";
import { personalPages, type PersonalPageId } from "./pages";

/*
 * STEP 3 SKELETON — every Personal route renders this until its screen is
 * built. It shows the page header (eyebrow · title · purpose), the board and
 * step that replace it, the states to build, and whatever seam probes the
 * route passes in (route params, sample-data counts). No screen UI.
 *
 * A page of an optional module renders "Module hidden · Turn on" instead
 * when the module is hidden (P17), with a 200 response — never a 404.
 */

export interface PersonalSkeletonProps {
  page: PersonalPageId;
  /** Seam probes: route params, data hooks. */
  children?: ReactNode;
}

export async function PersonalSkeleton({ page, children }: PersonalSkeletonProps) {
  const t = await getTranslations("Personal");
  const { locale, digits, calendar } = await getRequestPreferences();
  const spec = personalPages[page];
  const today = formatDate(dayToDate(getPlannerToday()), "dayMonth", { locale, digits, calendar });

  const body = (
    <ProductCard as="section" aria-labelledby={`skeleton-${page}`} data-skeleton={page} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-7 items-center rounded-pill border border-dashed border-outline px-3 text-xs font-semibold text-fg-secondary">
          {t("skeleton.badge")}
        </span>
        <span className="text-xs font-semibold text-fg-muted" dir="ltr">
          {spec.board}
        </span>
      </div>
      <p id={`skeleton-${page}`} className="type-body text-fg-secondary">
        {t("skeleton.note", { step: convertDigits(spec.step, digits), board: spec.board })}
      </p>
      <div className="flex flex-col gap-1">
        <h2 className="type-label text-fg-muted">{t("skeleton.states")}</h2>
        <p className="text-sm text-fg">{t(`pages.${page}.states`)}</p>
      </div>
      {children}
    </ProductCard>
  );

  return (
    <>
      <PageHeader
        breadcrumb={<p className="text-sm font-semibold text-fg-muted">{t("eyebrow", { date: today })}</p>}
        title={t(`pages.${page}.title`)}
        subtitle={t(`pages.${page}.purpose`)}
      />
      {spec.module && isOptionalModule(spec.module) ? <ModuleGate module={spec.module}>{body}</ModuleGate> : body}
    </>
  );
}

/** Localised <title> for a Personal page ("My Day · Mehran Planner"). */
export async function personalPageMetadata(page: PersonalPageId) {
  const t = await getTranslations("Personal");
  return { title: t(`pages.${page}.title`) };
}
