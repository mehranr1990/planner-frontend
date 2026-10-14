"use client";

import { useTranslations } from "next-intl";
import { notchPath } from "@/design-system/surfaces/notch-path";
import { notchPresets, radiusTokens } from "@/design-system/tokens/radii";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { mirrorX } from "@/lib/locale/direction";
import { StyleguideSection } from "../styleguide-section";

const PREVIEW = { width: 320, height: 150 };

/** Static preview of the notch geometry; the measured component is Step 2. */
function NotchPreview({ label }: { label: string }) {
  const { direction } = usePreferences();
  const { notchWidth, notchHeight, fillet, button } = notchPresets.default;
  const path = notchPath({ ...PREVIEW, notchWidth, notchHeight, fillet, direction });
  const buttonCenter = mirrorX(PREVIEW.width - notchWidth / 2, PREVIEW.width, direction);

  return (
    <figure className="flex flex-col gap-2">
      <div className="rounded-card bg-canvas p-4">
        <svg
          viewBox={`0 0 ${PREVIEW.width} ${PREVIEW.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={label}
        >
          <path d={path} className="fill-scope-soft" />
          <circle cx={buttonCenter} cy={notchHeight / 2} r={button / 2} className="fill-primary" />
        </svg>
      </div>
      <figcaption className="type-caption text-fg-muted">{label}</figcaption>
    </figure>
  );
}

export function RadiiSection() {
  const t = useTranslations("Styleguide.radii");
  return (
    <StyleguideSection id="radii" span="half" title={t("title")} description={t("description")}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {radiusTokens.map((radius) => (
          <li key={radius.cssVar} className="flex flex-col gap-2">
            <span aria-hidden className={cn("h-24 border-2 border-outline bg-raised", radius.className)} />
            <span className="flex items-baseline justify-between gap-2">
              <span lang="en" className="text-sm font-semibold">
                {radius.name}
              </span>
              <code dir="ltr" className="text-xs text-fg-muted">
                {radius.px}
              </code>
            </span>
          </li>
        ))}
      </ul>
      <NotchPreview label={t("notch")} />
    </StyleguideSection>
  );
}
