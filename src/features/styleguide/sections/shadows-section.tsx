"use client";

import { useTranslations } from "next-intl";
import { shadowTokens } from "@/design-system/tokens/shadows";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../styleguide-section";

export function ShadowsSection() {
  const t = useTranslations("Styleguide.shadows");
  return (
    <StyleguideSection id="shadows" span="half" title={t("title")} description={t("description")}>
      <ul className="grid gap-4 rounded-card bg-canvas p-4 sm:grid-cols-3">
        {shadowTokens.map((shadow) => (
          <li
            key={shadow.cssVar}
            className={cn("flex min-h-28 flex-col justify-between gap-2 rounded-tile bg-surface p-4", shadow.className)}
          >
            <span lang="en" className="text-sm font-semibold">
              {shadow.name}
            </span>
            <span className="flex flex-col gap-1">
              <code dir="ltr" className="text-xs text-fg-secondary">
                {shadow.cssVar}
              </code>
              <span lang="en" className="text-xs text-fg-muted">
                {shadow.usage}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </StyleguideSection>
  );
}
