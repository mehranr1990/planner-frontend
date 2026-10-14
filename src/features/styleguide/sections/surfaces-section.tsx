"use client";

import { useTranslations } from "next-intl";
import { FloatingIsland } from "@/design-system/surfaces/floating-island";
import { StyleguideSection } from "../styleguide-section";

function Layer({ label, token }: { label: string; token: string }) {
  return (
    <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
      {label}
      <code dir="ltr" className="text-[0.6875rem] font-medium text-fg-muted">
        {token}
      </code>
    </span>
  );
}

export function SurfacesSection() {
  const t = useTranslations("Styleguide.surfaces");
  return (
    <StyleguideSection id="surfaces" span="half" title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-3 rounded-card bg-canvas p-3 sm:p-4">
        <Layer label={t("canvas")} token="--canvas" />
        <div className="flex flex-col gap-3 rounded-card-sm bg-surface p-3 shadow-island sm:p-4">
          <Layer label={t("surface")} token="--surface" />
          <div className="flex flex-col gap-3 rounded-tile bg-raised p-3 sm:p-4">
            <Layer label={t("raised")} token="--surface-raised" />
            <div className="rounded-row bg-subtle p-3">
              <Layer label={t("subtle")} token="--surface-subtle" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-card bg-canvas p-4 sm:flex-row sm:items-center">
        <FloatingIsland className="flex min-h-14 flex-1 items-center px-5">
          <Layer label={t("island")} token="--shadow-island" />
        </FloatingIsland>
        <div className="flex min-h-14 flex-1 items-center rounded-tile bg-elevated px-5 shadow-elevated">
          <Layer label={t("elevated")} token="--surface-elevated" />
        </div>
      </div>
    </StyleguideSection>
  );
}
