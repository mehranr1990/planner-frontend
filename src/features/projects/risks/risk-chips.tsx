"use client";

import { useTranslations } from "next-intl";
import { StatusChip } from "@/design-system/feedback/status-chip";
import type { StatusTone } from "@/design-system/tokens/colors";
import type { ProjectRisk, RiskSeverity, RiskStatus } from "@/data/project-domain";
import { cn } from "@/lib/cn";

/*
 * Risk chips shared by PJ-09 (register, open issues) and PJ-16 (head):
 * severity in the warm severity family (never volt), status as a labelled
 * StatusChip (never colour alone).
 */

export const SEVERITY_CLASS: Record<RiskSeverity, string> = {
  low: "bg-raised text-fg-secondary",
  medium: "bg-warning-soft text-warning-text",
  high: "bg-danger-soft text-danger-text",
  critical: "bg-danger text-on-destructive",
};

const STATUS_TONE: Record<RiskStatus, StatusTone> = {
  open: "neutral",
  mitigating: "info",
  watching: "warning",
  closed: "success",
};

const chip = "inline-flex min-h-7 shrink-0 items-center rounded-pill px-3 text-xs font-bold";

export function SeverityChip({ severity, className }: { severity: RiskSeverity; className?: string }) {
  const t = useTranslations("Risks");
  return <span className={cn(chip, SEVERITY_CLASS[severity], className)}>{t(`level.${severity}`)}</span>;
}

export function RiskStatusChip({ status, className }: { status: RiskStatus; className?: string }) {
  const t = useTranslations("Risks.status");
  return (
    <StatusChip tone={STATUS_TONE[status]} className={cn("shrink-0", className)}>
      {t(status)}
    </StatusChip>
  );
}

/** "P · High" (phones / compact rows). */
export function ProbabilityChip({ risk, long = false }: { risk: ProjectRisk; long?: boolean }) {
  const t = useTranslations("Risks");
  const tRisk = useTranslations("Risk");
  if (!risk.probability) return null;
  const level = t(`level.${risk.probability}`);
  return (
    <span className={cn(chip, "bg-raised font-semibold text-fg")}>
      {long ? tRisk("probability", { level }) : t("probabilityShort", { level })}
    </span>
  );
}
