"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoGroup, StateCaption } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const rangeIds = ["day", "week", "month"] as const;
const viewIds = ["overview", "board", "timeline", "docs"] as const;
const calendarIds = ["week", "month", "agenda"] as const;

/**
 * Approved tab patterns, each from its board. No single tab style is used
 * everywhere: pick the one the screen design calls for.
 */
export function TabsSection() {
  const t = useTranslations("Styleguide.components.tabs");
  const [range, setRange] = useState<(typeof rangeIds)[number]>("week");
  const [calendarView, setCalendarView] = useState<(typeof calendarIds)[number]>("week");

  return (
    <StyleguideSection id="tabs" tier="utility" title={t("title")} description={t("description")}>
      <div className="grid gap-8 md:grid-cols-2">
        <DemoGroup title={t("segmented.title")}>
          <Segmented
            label={t("segmented.label")}
            variant="neutral"
            className="self-start"
            value={range}
            onValueChange={setRange}
            options={rangeIds.map((id) => ({ value: id, label: t(`range.${id}`) }))}
          />
          <p className="rounded-tile bg-subtle p-4 type-body text-fg-secondary">{t(`rangePanels.${range}`)}</p>
          <StateCaption>{t("segmented.source")}</StateCaption>
        </DemoGroup>

        <DemoGroup title={t("compact.title")}>
          <Tabs defaultValue="overview" className="flex flex-col gap-3">
            <TabsList variant="compact" aria-label={t("compact.label")} className="self-start">
              {viewIds.map((id) => (
                <TabsTrigger key={id} value={id} variant="compact">
                  {t(`views.${id}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {viewIds.map((id) => (
              <TabsContent key={id} value={id} className="rounded-tile bg-subtle p-4 type-body text-fg-secondary">
                {t("compact.panel", { view: t(`views.${id}`) })}
              </TabsContent>
            ))}
          </Tabs>
          <StateCaption>{t("compact.source")}</StateCaption>
        </DemoGroup>

        <DemoGroup title={t("filled.title")}>
          <Segmented
            label={t("filled.label")}
            variant="accent"
            className="self-start"
            value={calendarView}
            onValueChange={setCalendarView}
            options={calendarIds.map((id) => ({ value: id, label: t(`calendarViews.${id}`) }))}
          />
          <StateCaption>{t("filled.source")}</StateCaption>
        </DemoGroup>

        <DemoGroup title={t("folder.title")}>
          <p className="type-body text-fg-secondary">
            {t("folder.body")}{" "}
            <a href="#folder-tabs" className="font-semibold text-scope-deep underline underline-offset-4">
              {t("folder.link")}
            </a>
          </p>
          <StateCaption>{t("folder.source")}</StateCaption>
        </DemoGroup>
      </div>
      <p className="rounded-tile border border-dashed border-outline p-4 type-caption text-fg-secondary">{t("internalNote")}</p>
    </StyleguideSection>
  );
}
