"use client";

import { useTranslations } from "next-intl";
import type { SprintEstimateUnit } from "@/data/team-domain";
import { useProjectFormat } from "@/features/projects/format";

/** "3 pt" / "3h" in the team's estimate unit (Settings › Planning). */
export function useEstimate() {
  const t = useTranslations("Sprint");
  const format = useProjectFormat();
  return (value: number, unit: SprintEstimateUnit) =>
    t(unit === "points" ? "points" : "hours", { n: format.number(value) });
}
