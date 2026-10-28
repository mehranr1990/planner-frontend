"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Scope } from "@/design-system/tokens/colors";
import { PreviewScopeControl } from "./preview-scope-control";
import { ButtonsSection } from "./sections/components/buttons-section";
import { CardsSection } from "./sections/components/cards-section";
import { ChoicesSection } from "./sections/components/choices-section";
import { ControlsSection } from "./sections/components/controls-section";
import { DataDisplaySection } from "./sections/components/data-display-section";
import { DatePickerSection } from "./sections/components/date-picker-section";
import { FieldsSection } from "./sections/components/fields-section";
import { FolderTabsSection } from "./sections/components/folder-tabs-section";
import { FormSection } from "./sections/components/form-section";
import { IndicatorsSection } from "./sections/components/indicators-section";
import { MenusSection } from "./sections/components/menus-section";
import { MetricTilesSection } from "./sections/components/metric-tiles-section";
import { MyDayStatesSection } from "./sections/components/my-day-states-section";
import { OverlaysSection } from "./sections/components/overlays-section";
import { ProductCardSection } from "./sections/components/product-card-section";
import { ProgressSection } from "./sections/components/progress-section";
import { RingCardSection } from "./sections/components/ring-card-section";
import { SelectSection } from "./sections/components/select-section";
import { StatesSection } from "./sections/components/states-section";
import { TabsSection } from "./sections/components/tabs-section";
import { ToastsSection } from "./sections/components/toasts-section";
import { UtilityCardSection } from "./sections/components/utility-card-section";
import { StyleguideMessages } from "./styleguide-messages";
import { StyleguideShell } from "./styleguide-shell";

/** /styleguide/components: every Step 2 base component and its states. */
function ComponentsViewContent() {
  const t = useTranslations("Styleguide");
  const [scope, setScope] = useState<Scope>("personal");

  return (
    <StyleguideShell
      current="components"
      overline={t("componentsPage.overline")}
      title={t("componentsPage.title")}
      intro={t("componentsPage.intro")}
      scope={scope}
      toolbar={<PreviewScopeControl scope={scope} onScopeChange={setScope} description={t("componentsPage.scopeHint")} />}
    >
      {/*
        Rows of the 12-column grid (lg+), paired so neighbours are of similar
        height: fields · select · controls | date picker (8) · toasts | buttons |
        states · form (8) | choices · menus (8) | indicators · data display |
        progress | overlays (dialogs, tooltip, P18 containers) | tab families |
        folder tabs (7) · ring card (5) | signature cards | product card ·
        utility card | metric tiles | My Day states (lazy). Every section carries its tier.
      */}
      <FieldsSection />
      <SelectSection />
      <ControlsSection />
      <DatePickerSection />
      <ToastsSection />
      <ButtonsSection />
      <StatesSection />
      <FormSection />
      <ChoicesSection />
      <MenusSection />
      <IndicatorsSection />
      <DataDisplaySection />
      <ProgressSection />
      <OverlaysSection />
      <TabsSection />
      <FolderTabsSection />
      <RingCardSection />
      <CardsSection />
      <ProductCardSection />
      <UtilityCardSection />
      <MetricTilesSection />
      <MyDayStatesSection />
    </StyleguideShell>
  );
}

export function ComponentsView() {
  return (
    <StyleguideMessages>
      <ComponentsViewContent />
    </StyleguideMessages>
  );
}
