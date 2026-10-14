"use client";

import { useTranslations } from "next-intl";
import { NoResultsState, UnavailableState } from "@/components/feedback/state-views";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DemoGroup } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/** No results, unavailable, skeleton anatomy and spinners. */
export function IndicatorsSection() {
  const t = useTranslations("Styleguide.components.indicators");

  return (
    <StyleguideSection tier="utility" id="indicators" span="half" title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <NoResultsState variant="card" size="compact" query={t("query")} className="bg-subtle" />
        <UnavailableState variant="dashed" size="compact" />
      </div>

      <DemoGroup title={t("skeleton")}>
        <div className="flex items-center gap-3 rounded-tile bg-subtle p-4">
          <Skeleton shape="circle" className="w-10" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton shape="line" className="w-1/2" />
            <Skeleton className="w-4/5" />
          </div>
          <Skeleton shape="pill" className="w-16" />
        </div>
      </DemoGroup>

      <DemoGroup title={t("spinner")}>
        <div className="flex flex-wrap items-center gap-5 text-scope-deep">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" label={t("spinnerLabel")} />
          <span className="type-caption text-fg-muted">{t("spinnerHint")}</span>
        </div>
      </DemoGroup>
    </StyleguideSection>
  );
}
