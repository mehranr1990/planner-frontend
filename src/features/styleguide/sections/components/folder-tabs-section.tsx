"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/feedback/state-views";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatNumber, formatPercent } from "@/lib/locale/digits";
import { StyleguideSection } from "../../styleguide-section";

function StatTile({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-tile p-4", danger ? "bg-danger-soft text-danger-text" : "bg-subtle")}>
      <span className={cn("type-caption font-semibold", danger ? "text-danger-text" : "text-fg-secondary")}>{label}</span>
      <span className="type-h1 font-normal tabular">{value}</span>
    </div>
  );
}

/** FolderTabsCard with counts (Cards board · folder tabs). */
export function FolderTabsSection() {
  const t = useTranslations("Styleguide.components.folderTabs");
  const { digits } = usePreferences();

  const tabs = [
    {
      value: "overview",
      label: t("tabs.overview"),
      count: formatPercent(0.72, digits),
      content: (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label={t("progress")} value={formatPercent(0.72, digits)} />
          <StatTile label={t("openTasks")} value={formatNumber(18, digits)} />
          <StatTile label={t("blocked")} value={formatNumber(2, digits)} danger />
        </div>
      ),
    },
    {
      value: "tasks",
      label: t("tabs.tasks"),
      count: 18,
      content: <p className="type-body text-fg-secondary">{t("tasksBody")}</p>,
    },
    {
      value: "files",
      label: t("tabs.files"),
      count: 2,
      content: <p className="type-body text-fg-secondary">{t("filesBody")}</p>,
    },
    {
      value: "activity",
      label: t("tabs.activity"),
      count: 6,
      content: <EmptyState variant="bare" size="compact" title={t("activityEmpty")} description={null} />,
    },
  ];

  return (
    <StyleguideSection id="folder-tabs" tier="product" span="half" title={t("title")} description={t("description")}>
      <div className="rounded-card bg-canvas p-3 sm:p-4">
        <FolderTabsCard tabs={tabs} label={t("label")} panelClassName="min-h-48" />
      </div>
    </StyleguideSection>
  );
}
