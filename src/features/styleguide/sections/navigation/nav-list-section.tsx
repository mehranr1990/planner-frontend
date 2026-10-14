"use client";

import { useTranslations } from "next-intl";
import { ContextNavList } from "@/components/navigation/context-nav-list";
import type { ContextId } from "@/features/navigation/types";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

interface NavListSectionProps {
  context: ContextId;
}

/** The context's full page list, as used by the "More" sheet and the palette. */
export function NavListSection({ context }: NavListSectionProps) {
  const t = useTranslations("Styleguide.navigationPage.navList");
  return (
    <StyleguideSection tier="utility" id="nav-list" span="third" title={t("title")} description={t("description")}>
      <PreviewFrame label={t("caption")} contentClassName="bg-surface p-2">
        <ContextNavList context={context} />
      </PreviewFrame>
    </StyleguideSection>
  );
}
