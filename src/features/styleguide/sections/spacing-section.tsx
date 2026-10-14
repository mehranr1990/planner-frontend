"use client";

import { useTranslations } from "next-intl";
import { spacingTokens } from "@/design-system/tokens/spacing";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/locale/digits";
import { StyleguideSection } from "../styleguide-section";

export function SpacingSection() {
  const t = useTranslations("Styleguide.spacing");
  const { digits } = usePreferences();
  return (
    <StyleguideSection id="spacing" span="half" title={t("title")} description={t("description")}>
      <ul className="flex flex-col gap-3">
        {spacingTokens.map((token) => (
          <li key={token.name} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
            <span className="flex flex-col">
              <code dir="ltr" className="text-sm font-semibold">
                {token.name}
              </code>
              <span className="tabular text-xs text-fg-muted">{formatNumber(token.px, digits)}px</span>
            </span>
            <span className="flex min-w-0 items-center gap-3">
              <span aria-hidden className={cn("h-3 shrink-0 rounded-pill bg-scope-dot", token.bar)} />
              <span lang="en" className="truncate text-xs text-fg-muted">
                {token.usage}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </StyleguideSection>
  );
}
