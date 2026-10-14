"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { StyleguideSection } from "../styleguide-section";

const BORDERS = [
  { name: "Line", token: "--border-subtle", className: "border-line", usage: "Grid lines, dividers" },
  { name: "Hairline", token: "--border-soft", className: "border-hairline", usage: "Soft borders, toasts" },
  { name: "Border", token: "--border-default", className: "border-outline", usage: "Outline buttons, chips" },
] as const;

export function BordersSection() {
  const t = useTranslations("Styleguide.borders");
  return (
    <StyleguideSection id="borders" span="half" title={t("title")} description={t("description")}>
      <ul className="flex flex-col gap-3">
        {BORDERS.map((border) => (
          <li
            key={border.token}
            className={cn("flex min-h-touch flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-row border-2 px-4 py-2", border.className)}
          >
            <span lang="en" className="text-sm font-semibold">
              {border.name}
              <span className="ms-2 font-medium text-fg-muted">{border.usage}</span>
            </span>
            <code dir="ltr" className="text-xs text-fg-muted">
              {border.token}
            </code>
          </li>
        ))}
      </ul>
    </StyleguideSection>
  );
}
