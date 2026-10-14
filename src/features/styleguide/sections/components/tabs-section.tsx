"use client";

import { Kanban, List } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { DemoGroup, StateCaption } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

const rangeIds = ["day", "week", "month"] as const;
const layoutIds = ["list", "board"] as const;
const calendarIds = ["shamsi", "gregorian"] as const;
const filterIds = ["today", "overdue", "thisWeek"] as const;
const modeIds = ["focus", "shortBreak", "longBreak"] as const;

const RULES = ["viewMode", "local", "emphasis", "object", "global", "wizard"] as const;
const AVOID = ["nav", "range", "layout", "binary", "filters", "wizard"] as const;

function Family({ title, use, children }: { title: string; use: string; children: ReactNode }) {
  const t = useTranslations("Styleguide.components.tabs");
  return (
    <DemoGroup title={title}>
      <StateCaption>{t("use", { use })}</StateCaption>
      {children}
    </DemoGroup>
  );
}

/**
 * The four P00 tab families (P00CardsTabs "Tab families"), side by side with
 * the selection rule. A–C are live here; D (folder tabs) and D′ (the ring
 * card's bottom tabs) have their own sections below.
 */
export function TabsSection() {
  const t = useTranslations("Styleguide.components.tabs");
  const [range, setRange] = useState<(typeof rangeIds)[number]>("day");
  const [layout, setLayout] = useState<(typeof layoutIds)[number]>("list");
  const [calendar, setCalendar] = useState<(typeof calendarIds)[number]>("shamsi");
  const [filter, setFilter] = useState<(typeof filterIds)[number]>("today");
  const [mode, setMode] = useState<(typeof modeIds)[number]>("focus");

  return (
    <StyleguideSection id="tabs" tier="utility" title={t("title")} description={t("description")}>
      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
        <Family title={t("segmented.title")} use={t("segmented.use")}>
          <Segmented
            label={t("segmented.rangeLabel")}
            variant="neutral"
            className="self-start"
            value={range}
            onValueChange={setRange}
            options={rangeIds.map((id) => ({ value: id, label: t(`range.${id}`) }))}
          />
          <Segmented
            label={t("segmented.layoutLabel")}
            className="self-start"
            value={layout}
            onValueChange={setLayout}
            options={layoutIds.map((id) => ({
              value: id,
              label: (
                <>
                  <Icon icon={id === "list" ? List : Kanban} size={16} />
                  {t(`layout.${id}`)}
                </>
              ),
            }))}
          />
          <Segmented
            label={t("segmented.calendarLabel")}
            variant="neutral"
            className="self-start"
            value={calendar}
            onValueChange={setCalendar}
            options={calendarIds.map((id) => ({ value: id, label: t(`calendar.${id}`) }))}
          />
        </Family>

        <Family title={t("pills.title")} use={t("pills.use")}>
          <PillGroup
            label={t("pills.label")}
            value={filter}
            onValueChange={setFilter}
            options={filterIds.map((id) => ({
              value: id,
              label: t(`pills.${id}`),
              count: id === "overdue" ? 1 : undefined,
            }))}
          />
          <StateCaption>{t("pills.mobileNote")}</StateCaption>
        </Family>

        <Family title={t("filled.title")} use={t("filled.use")}>
          <PillGroup
            label={t("filled.label")}
            variant="filled"
            value={mode}
            onValueChange={setMode}
            options={modeIds.map((id) => ({ value: id, label: t(`filled.${id}`) }))}
          />
        </Family>

        <Family title={t("folder.title")} use={t("folder.use")}>
          <p className="type-body text-fg-secondary">{t("folder.body")}</p>
          <a
            href="#folder-tabs"
            className="self-start text-sm font-semibold text-scope-deep underline underline-offset-4"
          >
            {t("folder.link")}
          </a>
        </Family>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-utility bg-subtle p-4.5">
          <h3 className="type-label text-fg-secondary">{t("rule.title")}</h3>
          <ul className="flex flex-col gap-1.5 type-caption text-fg-secondary">
            {RULES.map((rule) => (
              <li key={rule}>{t(`rule.${rule}`)}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 rounded-utility bg-subtle p-4.5">
          <h3 className="type-label text-fg-secondary">{t("avoid.title")}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {AVOID.map((item) => (
              <li key={item} className="rounded-pill bg-surface px-3 py-1.5 text-xs font-semibold text-fg-secondary">
                {t(`avoid.${item}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </StyleguideSection>
  );
}
