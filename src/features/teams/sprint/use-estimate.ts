"use client";

import { useTranslations } from "next-intl";
import type { SprintEstimateUnit } from "@/data/team-domain";
import { useProjectFormat } from "@/features/projects/format";

/** "3 pt" / "3h" in the team's estimate unit (Settings › Planning). */
export function useEstimate() {
  const t = useTranslations("Sprint");
  const format = useProjectFormat();
  // null = not served (e.g. capacity in points) → a dash, never a made-up figure.
  return (value: number | null, unit: SprintEstimateUnit) =>
    value === null ? "—" : t(unit === "points" ? "points" : "hours", { n: format.number(value) });
}
