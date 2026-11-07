import type { ProjectRisk, RiskProbability, RiskSeverity } from "@/data/project-domain";

/*
 * PJ-09 register logic (pure): D11 scales, the heat-map cell (severity ×
 * probability, never a numeric score shown to users), the pills, filters
 * and sorts. The sort "score" orders by the matrix cell, highest first.
 */

export const SEVERITIES: readonly RiskSeverity[] = ["low", "medium", "high", "critical"];
/** Heat-map rows top → bottom. */
export const PROBABILITIES_DESC: readonly RiskProbability[] = ["high", "medium", "low"];

export type RiskPill = "open" | "mine" | "high" | "closed";
export type RiskSort = "score" | "updated" | "due";
export interface HeatCell {
  severity: RiskSeverity;
  probability: RiskProbability;
}

export interface RiskFilters {
  pill: RiskPill;
  cell: HeatCell | null;
  ownerId: string | null;
  milestoneId: string | null;
}

const CURRENT_USER_ID = "me";

export const isHighPlus = (risk: ProjectRisk) => risk.severity === "high" || risk.severity === "critical";

/** "Mine": risks I own or raised. */
export const isMyRisk = (risk: ProjectRisk) => risk.owner.id === CURRENT_USER_ID || risk.raisedBy.id === CURRENT_USER_ID;

export function matchesPill(risk: ProjectRisk, pill: RiskPill): boolean {
  if (pill === "closed") return !risk.open;
  if (!risk.open) return false;
  if (pill === "mine") return isMyRisk(risk);
  if (pill === "high") return isHighPlus(risk);
  return true;
}

export function pillCounts(list: readonly ProjectRisk[]): Record<RiskPill, number> {
  return {
    open: list.filter((risk) => matchesPill(risk, "open")).length,
    mine: list.filter((risk) => matchesPill(risk, "mine")).length,
    high: list.filter((risk) => matchesPill(risk, "high")).length,
    closed: list.filter((risk) => matchesPill(risk, "closed")).length,
  };
}

/** Matrix weight of a cell (0–5); ordering and colour tier only. */
export function cellWeight(severity: RiskSeverity, probability: RiskProbability | undefined): number {
  return SEVERITIES.indexOf(severity) + (probability ? PROBABILITIES_DESC.length - 1 - PROBABILITIES_DESC.indexOf(probability) : 0);
}

/** Warm severity family tier for a heat-map cell (0 neutral … 3 rose); never volt. */
export function heatTier(cell: HeatCell): 0 | 1 | 2 | 3 {
  const weight = cellWeight(cell.severity, cell.probability);
  if (weight <= 1) return 0;
  if (weight === 2) return 1;
  if (weight === 3) return 2;
  return 3;
}

export function filterRisks(list: readonly ProjectRisk[], filters: RiskFilters): ProjectRisk[] {
  return list.filter(
    (risk) =>
      matchesPill(risk, filters.pill) &&
      (!filters.cell || (risk.severity === filters.cell.severity && risk.probability === filters.cell.probability)) &&
      (!filters.ownerId || risk.owner.id === filters.ownerId) &&
      (!filters.milestoneId || risk.milestoneId === filters.milestoneId),
  );
}

export function sortRisks(list: readonly ProjectRisk[], sort: RiskSort): ProjectRisk[] {
  const byUpdated = (a: ProjectRisk, b: ProjectRisk) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  return [...list].sort((a, b) => {
    if (sort === "updated") return byUpdated(a, b);
    if (sort === "due") {
      if (a.reviewBy && b.reviewBy) return a.reviewBy.localeCompare(b.reviewBy) || byUpdated(a, b);
      return a.reviewBy ? -1 : b.reviewBy ? 1 : byUpdated(a, b);
    }
    return cellWeight(b.severity, b.probability) - cellWeight(a.severity, a.probability) || byUpdated(a, b);
  });
}

/** Open-risk counts per heat-map cell, keyed "severity:probability". */
export function heatCounts(list: readonly ProjectRisk[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const risk of list) {
    if (!risk.open || risk.kind !== "risk" || !risk.probability) continue;
    const key = `${risk.severity}:${risk.probability}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Phone 3-line summary: open risks High+ · Medium · Low. */
export function severitySummary(list: readonly ProjectRisk[]) {
  const open = list.filter((risk) => risk.open && risk.kind === "risk");
  return {
    high: open.filter(isHighPlus).length,
    medium: open.filter((risk) => risk.severity === "medium").length,
    low: open.filter((risk) => risk.severity === "low").length,
  };
}
