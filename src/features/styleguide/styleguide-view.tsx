"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Scope } from "@/design-system/tokens/colors";
import { BdiSection } from "./sections/bdi-section";
import { BordersSection } from "./sections/borders-section";
import { ContextSection } from "./sections/context-section";
import { DatavizSection } from "./sections/dataviz-section";
import { DatesSection } from "./sections/dates-section";
import { FocusSection } from "./sections/focus-section";
import { IconsSection } from "./sections/icons-section";
import { MotionSection } from "./sections/motion-section";
import { NeutralsSection } from "./sections/neutrals-section";
import { NumbersSection } from "./sections/numbers-section";
import { RadiiSection } from "./sections/radii-section";
import { ShadowsSection } from "./sections/shadows-section";
import { SpacingSection } from "./sections/spacing-section";
import { StatusSection } from "./sections/status-section";
import { SurfacesSection } from "./sections/surfaces-section";
import { SweepSection } from "./sections/sweep-section";
import { TypographySection } from "./sections/typography-section";
import { StyleguideMessages } from "./styleguide-messages";
import { StyleguideShell } from "./styleguide-shell";

function StyleguideViewContent() {
  const t = useTranslations("Styleguide");
  // Scope is local to the styleguide: it previews how the primary retints.
  const [scope, setScope] = useState<Scope>("personal");

  return (
    <StyleguideShell current="foundations" overline={t("overline")} title={t("title")} intro={t("intro")} scope={scope}>
      <SweepSection />
      <ContextSection scope={scope} onScopeChange={setScope} />
      <NeutralsSection />
      <StatusSection />
      <DatavizSection />
      <SurfacesSection />
      <ShadowsSection />
      <RadiiSection />
      <BordersSection />
      <TypographySection />
      <SpacingSection />
      <FocusSection />
      <DatesSection />
      <NumbersSection />
      <IconsSection />
      <BdiSection />
      <MotionSection />
    </StyleguideShell>
  );
}

export function StyleguideView() {
  return (
    <StyleguideMessages>
      <StyleguideViewContent />
    </StyleguideMessages>
  );
}
