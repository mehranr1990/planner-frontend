"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useAreas } from "@/data/queries";
import { usePreferences } from "@/features/preferences/use-preferences";
import type { FilterChip, FilterKind } from "../domain/filters";

/*
 * The words of a removable filter chip: "Area: Personal, Health",
 * "Energy: Low–Medium", "Has date", "Recurring". Area ids become names from
 * the repository's area list (the id itself until it loads).
 */

export interface FilterChipText {
  /** "Area: Personal, Health" — what the chip shows. */
  chip(chip: FilterChip): string;
  /** "Area" — the filter's own name (panel sections, the chip's remove button). */
  kind(kind: FilterKind): string;
  /** The label of one value of a filter: an area name, "High", "Projects". */
  value(kind: FilterKind, value: string): string;
}

export function useFilterChipText(): FilterChipText {
  const t = useTranslations("Tasks.filters");
  const tLabels = useTranslations("Tasks.labels");
  const { locale } = usePreferences();
  const { data: areas } = useAreas();

  const value = useCallback(
    (kind: FilterKind, raw: string): string => {
      switch (kind) {
        case "area":
          return areas?.find((area) => area.id === raw)?.name ?? raw;
        case "context":
          return tLabels(`scope.${raw as "personal" | "project" | "team" | "company"}`);
        case "priority":
          return tLabels(`priority.${raw as "urgent" | "high" | "medium" | "low"}`);
        case "energy":
          return tLabels(`energy.${raw as "low" | "medium" | "high"}`);
        case "hasDate":
          return raw === "yes" ? t("flag.hasDateYes") : t("flag.hasDateNo");
        case "recurring":
          return t("flag.recurring");
        default:
          return raw;
      }
    },
    [areas, t, tLabels],
  );

  const kind = useCallback((name: FilterKind) => t(`kind.${name}`), [t]);

  const chip = useCallback(
    (item: FilterChip): string => {
      if (item.kind === "hasDate" || item.kind === "recurring") return value(item.kind, item.values[0] ?? "yes");
      const values = item.range
        ? t("range", { from: value("energy", item.range[0]), to: value("energy", item.range[1]) })
        : item.values.map((raw) => value(item.kind, raw)).join(locale === "fa" ? "، " : ", ");
      return t("chip", { kind: kind(item.kind), values });
    },
    [kind, locale, t, value],
  );

  return { chip, kind, value };
}
