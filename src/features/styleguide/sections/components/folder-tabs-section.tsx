"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/feedback/state-views";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { MetricGroup, MetricTile } from "@/design-system/surfaces/metric-tile";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber, formatPercent } from "@/lib/locale/digits";
import { StyleguideSection } from "../../styleguide-section";

/**
 * D · FolderTabsCard `top` (P00CardsTabs "D · Folder / merged tabs"): the
 * sections of ONE object, counts muted after the labels, the overview panel
 * a MetricTile family with the blocked tile in the danger tone.
 */
export function FolderTabsSection() {
  const t = useTranslations("Styleguide.components.folderTabs");
  const { digits } = usePreferences();
  const progress = formatPercent(0.72, digits);

  const tabs = [
    {
      value: "overview",
      label: t("tabs.overview"),
      count: progress,
      content: (
        <MetricGroup aria-label={t("summaryLabel")} columns={3}>
          <MetricTile label={t("progress")} value={progress} />
          <MetricTile label={t("openTasks")} value={formatNumber(18, digits)} />
          <MetricTile label={t("blocked")} value={formatNumber(2, digits)} tone="danger" />
        </MetricGroup>
      ),
    },
    {
      value: "tasks",
      label: t("tabs.tasks"),
      count: 18,
      content: <p className="type-body text-fg-secondary">{t("tasksBody", { count: formatNumber(18, digits) })}</p>,
    },
    {
      value: "files",
      label: t("tabs.files"),
      count: 2,
      content: <p className="type-body text-fg-secondary">{t("filesBody", { count: formatNumber(2, digits) })}</p>,
    },
    {
      value: "activity",
      label: t("tabs.activity"),
      count: 6,
      content: <EmptyState variant="bare" size="compact" title={t("activityEmpty")} description={null} />,
    },
  ];

  return (
    <StyleguideSection id="folder-tabs" tier="product" span="wide" title={t("title")} description={t("description")}>
      <div className="rounded-card bg-canvas p-3 sm:p-5">
        <FolderTabsCard tabs={tabs} label={t("label")} panelClassName="min-h-40" />
      </div>
    </StyleguideSection>
  );
}
