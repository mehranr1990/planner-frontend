"use client";

import { useTranslations } from "next-intl";
import { FloatingRail } from "@/components/navigation/floating-rail";
import { getAppContext } from "@/features/navigation/contexts";
import type { ContextId } from "@/features/navigation/types";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

interface RailSectionProps {
  context: ContextId;
}

/** The floating rail, collapsed and expanded, for the preview context. */
export function RailSection({ context }: RailSectionProps) {
  const t = useTranslations("Styleguide.navigationPage.rail");
  const tNav = useTranslations("Navigation");
  const landmark = tNav("rail.landmark", { context: tNav(getAppContext(context).labelKey) });
  const frame = "flex h-136 items-center justify-center";

  return (
    <StyleguideSection tier="utility" id="rail" span="half" title={t("title")} description={t("description")}>
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <PreviewFrame label={t("collapsed")} contentClassName={frame}>
          {/* Keyed by context so each preview starts in its documented state. */}
          <FloatingRail
            key={`collapsed-${context}`}
            context={context}
            defaultExpanded={false}
            activeItemId="overview"
            aria-label={`${landmark} · ${t("collapsed")}`}
          />
        </PreviewFrame>
        <PreviewFrame label={t("expanded")} contentClassName={frame}>
          <FloatingRail
            key={`expanded-${context}`}
            context={context}
            defaultExpanded
            activeItemId="overview"
            aria-label={`${landmark} · ${t("expanded")}`}
          />
        </PreviewFrame>
      </div>
    </StyleguideSection>
  );
}
