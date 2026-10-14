"use client";

import { CircleAlert, CircleCheck, FilePen, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusChip } from "@/design-system/feedback/status-chip";
import type { StatusTone } from "@/design-system/tokens/colors";
import { StyleguideSection } from "../styleguide-section";

const STATUSES: readonly { tone: StatusTone; icon: LucideIcon; token: string }[] = [
  { tone: "danger", icon: CircleAlert, token: "--danger · --danger-text · --danger-soft" },
  { tone: "warning", icon: TriangleAlert, token: "--warning · --warning-text · --warning-soft" },
  { tone: "success", icon: CircleCheck, token: "--success-text · --success-soft" },
  { tone: "info", icon: Info, token: "--info-text · --info-soft" },
  { tone: "neutral", icon: FilePen, token: "--text-secondary · --border-soft" },
];

export function StatusSection() {
  const t = useTranslations("Styleguide.status");
  return (
    <StyleguideSection id="status" span="narrow" title={t("title")} description={t("description")}>
      <ul className="flex flex-col gap-2">
        {STATUSES.map(({ tone, icon, token }) => (
          <li key={tone} className="flex flex-wrap items-center justify-between gap-2 rounded-row bg-subtle px-3 py-2.5">
            <StatusChip tone={tone} icon={icon}>
              {t(tone)}
            </StatusChip>
            <code dir="ltr" className="text-[0.6875rem] text-fg-muted">
              {token}
            </code>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-3 rounded-tile bg-danger-soft p-4">
          <span aria-hidden className="size-6 rounded-pill bg-danger" />
          <span className="text-sm font-semibold text-danger-text">{t("danger")}</span>
        </div>
        <div className="flex flex-col gap-3 rounded-tile bg-warning-soft p-4">
          <span aria-hidden className="size-6 rounded-pill bg-warning" />
          <span className="text-sm font-semibold text-warning-text">{t("warning")}</span>
        </div>
      </div>
      <p className="flex items-center gap-2 text-sm font-semibold text-weekend-text">
        <span aria-hidden className="size-2 rounded-pill bg-weekend" />
        {t("weekend")}
      </p>
    </StyleguideSection>
  );
}
