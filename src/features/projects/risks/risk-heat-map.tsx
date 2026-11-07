"use client";

import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { useRef, useState, type KeyboardEvent } from "react";
import type { ProjectRisk } from "@/data/project-domain";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { heatCounts, heatTier, PROBABILITIES_DESC, SEVERITIES, type HeatCell } from "./risk-model";

/*
 * RiskHeatMap (PJ-09, D11): open risks per severity × probability cell; the
 * cell is the score (no number). Warm severity family, never volt. A cell
 * click (or Enter / Space) filters the register; arrow keys move between
 * cells (roving tabindex). Severity runs along the inline axis, so in RTL it
 * runs right → left by layout (no CSS flip). Closed risks are not counted;
 * the register is the table alternative.
 */

const TIER_CLASS = [
  "bg-subtle text-fg",
  "bg-warning-soft text-warning-text",
  "bg-[color-mix(in_oklab,var(--color-warning-soft),var(--color-danger-soft))] text-danger-text",
  "bg-danger-soft text-danger-text",
] as const;

export function RiskHeatMap({
  risks,
  selected,
  onSelect,
}: {
  risks: readonly ProjectRisk[];
  selected: HeatCell | null;
  onSelect: (cell: HeatCell | null) => void;
}) {
  const t = useTranslations("Risks");
  const format = useProjectFormat();
  const rtl = Direction.useDirection() === "rtl";
  const counts = heatCounts(risks);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const move = (row: number, col: number) => {
    const next: [number, number] = [
      Math.max(0, Math.min(PROBABILITIES_DESC.length - 1, row)),
      Math.max(0, Math.min(SEVERITIES.length - 1, col)),
    ];
    setFocus(next);
    refs.current.get(`${next[0]}:${next[1]}`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, row: number, col: number) => {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    if (event.key === forward) move(row, col + 1);
    else if (event.key === back) move(row, col - 1);
    else if (event.key === "ArrowUp") move(row - 1, col);
    else if (event.key === "ArrowDown") move(row + 1, col);
    else if (event.key === "Home") move(row, 0);
    else if (event.key === "End") move(row, SEVERITIES.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={t("heat.label")}
        className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] items-center gap-1.5"
      >
        {PROBABILITIES_DESC.map((probability, row) => (
          <div key={probability} className="contents">
            <span className="pe-2 text-xs font-medium text-fg-secondary">{t(`level.${probability}`)}</span>
            {SEVERITIES.map((severity, col) => {
              const n = counts.get(`${severity}:${probability}`) ?? 0;
              const active = selected?.severity === severity && selected.probability === probability;
              return (
                <button
                  key={severity}
                  ref={(node) => {
                    if (node) refs.current.set(`${row}:${col}`, node);
                    else refs.current.delete(`${row}:${col}`);
                  }}
                  type="button"
                  tabIndex={focus[0] === row && focus[1] === col ? 0 : -1}
                  aria-pressed={active}
                  aria-label={t("heat.cell", {
                    probability: t(`level.${probability}`),
                    severity: t(`level.${severity}`),
                    n: format.number(n),
                  })}
                  onFocus={() => setFocus([row, col])}
                  onKeyDown={(event) => onKeyDown(event, row, col)}
                  onClick={() => onSelect(active ? null : { severity, probability })}
                  className={cn(
                    "flex aspect-square min-h-11 items-center justify-center rounded-[14px] text-sm font-bold tabular focus-visible:focus-ring",
                    TIER_CLASS[heatTier({ severity, probability })],
                    active && "inset-ring-2 inset-ring-scope-deep",
                  )}
                >
                  {n > 0 ? format.number(n) : null}
                </button>
              );
            })}
          </div>
        ))}
        <span />
        {SEVERITIES.map((severity) => (
          <span key={severity} className="text-center text-xs font-medium text-fg-secondary">
            {t(`level.${severity}`)}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-xs font-semibold text-fg-secondary">
        <span>↑ {t("heat.axisProbability")}</span>
        <span>
          {t("heat.axisSeverity")} <span className="inline-block rtl:-scale-x-100">→</span>
        </span>
      </div>
      <p className="text-xs font-medium text-fg-secondary">{t("heat.hint")}</p>
    </div>
  );
}
