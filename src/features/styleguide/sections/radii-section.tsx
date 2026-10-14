"use client";

import { useTranslations } from "next-intl";
import { notchPath } from "@/design-system/surfaces/notch-path";
import { notchPresets, radiusTokens, type NotchPresetName } from "@/design-system/tokens/radii";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { convertDigits } from "@/lib/locale/digits";
import { mirrorX } from "@/lib/locale/direction";
import { StyleguideSection } from "../styleguide-section";

const PREVIEW = { width: 320, height: 150 };

/** Every preset: one action (desktop, mobile, focus) or two related actions (double). Notches are never empty. */
const PRESETS: readonly NotchPresetName[] = ["desktop", "mobile", "focus", "double"];

/** Static preview of one preset's notch geometry; SignatureCard measures its own size. */
function NotchPreview({ preset, label }: { preset: NotchPresetName; label: string }) {
  const { direction } = usePreferences();
  const { notchWidth, notchHeight, fillet, button } = notchPresets[preset];
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

function NotchPresetTable() {
  const t = useTranslations("Styleguide.radii");
  return (
    <div className="flex flex-col gap-3">
      <h3 className="type-label text-fg-muted">{t("presets")}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-fg-muted">
            <th scope="col" className="pb-2 text-start font-semibold">
              {t("preset")}
            </th>
            <th scope="col" className="pb-2 text-start font-semibold">
              {t("notchSize")}
            </th>
            <th scope="col" className="pb-2 text-start font-semibold">
              {t("fillet")}
            </th>
            <th scope="col" className="pb-2 text-start font-semibold">
              {t("button")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {PRESETS.map((preset) => {
            const { notchWidth, notchHeight, fillet, button } = notchPresets[preset];
            return (
              <tr key={preset}>
                <th scope="row" className="py-2.5 text-start font-semibold">
                  {t(`presetNames.${preset}`)}
                </th>
                <td className="py-2.5">
                  <code dir="ltr" className="tabular text-xs text-fg-secondary">
                    {notchWidth} × {notchHeight}
                  </code>
                </td>
                <td className="py-2.5">
                  <code dir="ltr" className="tabular text-xs text-fg-secondary">
                    {fillet}
                  </code>
                </td>
                <td className="py-2.5">
                  <code dir="ltr" className="tabular text-xs text-fg-secondary">
                    {button}
                  </code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RadiiSection() {
  const t = useTranslations("Styleguide.radii");
  const { digits } = usePreferences();
  const { notchWidth, notchHeight, fillet, button } = notchPresets.desktop;
  const label = t("notch", {
    width: convertDigits(notchWidth, digits),
    height: convertDigits(notchHeight, digits),
    fillet: convertDigits(fillet, digits),
    button: convertDigits(button, digits),
  });

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
      <NotchPreview preset="desktop" label={label} />
      <NotchPresetTable />
    </StyleguideSection>
  );
}
