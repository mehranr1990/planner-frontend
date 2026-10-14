"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Progress } from "@/design-system/feedback/progress";
import { SegmentedProgress } from "@/design-system/feedback/segmented-progress";
import { usePreferences } from "@/features/preferences/use-preferences";
import { convertDigits, formatPercent } from "@/lib/locale/digits";
import { DemoGroup, StateCaption } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/**
 * The DEFAULT progress patterns — linear, segmented, numeric, compact inline —
 * each mirroring an approved board. Rings are not shown here: they are a
 * specialized visualization (see the Ring card section and the Rules page).
 */
export function ProgressSection() {
  const t = useTranslations("Styleguide.components.progress");
  const { digits } = usePreferences();
  const n = (value: string | number) => convertDigits(String(value), digits);

  return (
    <StyleguideSection id="progress" tier="utility" title={t("title")} description={t("description")}>
      <div className="grid gap-8 md:grid-cols-2">
        <DemoGroup title={t("linear.title")}>
          <div className="flex flex-col gap-2 rounded-tile bg-subtle p-4">
            <div className="flex items-baseline justify-between text-sm font-semibold">
              <span>{t("linear.label")}</span>
              <span className="tabular text-fg-secondary">{n("3/5")}</span>
            </div>
            <Progress value={60} label={t("linear.label")} valueText={n("3/5")} />
          </div>
          <StateCaption>{t("linear.source")}</StateCaption>
        </DemoGroup>

        <DemoGroup title={t("segmented.title")}>
          <div className="flex flex-col gap-4 rounded-tile bg-subtle p-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{t("segmented.partsLabel")}</span>
              <SegmentedProgress
                label={t("segmented.partsLabel")}
                valueText={formatPercent(0.74, digits)}
                value={74}
                parts={[
                  { value: 6, tone: "base" },
                  { value: 2, tone: "deep" },
                  { value: 3, tone: "track" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between text-sm font-semibold">
                <span>{t("segmented.stepsLabel")}</span>
                <span className="tabular text-fg-secondary">{n("4/5")}</span>
              </div>
              <SegmentedProgress label={t("segmented.stepsLabel")} valueText={n("4/5")} steps={{ done: 4, total: 5 }} />
            </div>
          </div>
          <StateCaption>{t("segmented.source")}</StateCaption>
        </DemoGroup>

        <DemoGroup title={t("numeric.title")}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "percent" as const, value: formatPercent(0.72, digits) },
              { id: "ratio" as const, value: n("6/9") },
              { id: "amount" as const, value: n("37M / 60M") },
            ].map((item) => (
              <div key={item.id} className="flex min-w-0 flex-col gap-1 rounded-tile bg-subtle p-3">
                <span className="truncate text-xs font-semibold text-fg-muted">{t(`numeric.${item.id}`)}</span>
                <span dir="ltr" className="tabular text-start text-2xl font-semibold rtl:text-end">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <StateCaption>{t("numeric.source")}</StateCaption>
        </DemoGroup>

        <DemoGroup title={t("inline.title")}>
          <div className="flex flex-col gap-3 rounded-tile bg-subtle p-4">
            <div className="flex items-center gap-3 text-sm font-semibold">
              <Progress value={33} size="sm" label={t("inline.subtasks")} valueText={n("2/6")} className="w-14" />
              <span className="tabular text-fg-secondary">{n("2/6")}</span>
              <span className="ms-auto inline-flex items-center gap-1.5 text-fg-secondary">
                <Icon icon={CheckCircle2} size={16} />
                <span className="tabular">{n("0/2")}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold">{t("inline.capacity")}</span>
              <span className="text-scope-deep font-semibold">{t("inline.capacityValue", { free: n(5), total: n(8) })}</span>
              <Progress value={37.5} size="sm" label={t("inline.capacity")} valueText={t("inline.capacityValue", { free: n(5), total: n(8) })} className="ms-auto w-24" />
            </div>
          </div>
          <StateCaption>{t("inline.source")}</StateCaption>
        </DemoGroup>
      </div>
      <p className="rounded-tile border border-dashed border-outline p-4 type-caption text-fg-secondary">{t("specializedNote")}</p>
    </StyleguideSection>
  );
}
