"use client";

import { Segmented } from "@/components/ui/segmented";
import type { EnergyLevel, MoodLevel } from "@/data/domain";
import { cn } from "@/lib/cn";

/*
 * MoodPicker5 · EnergySwitch3 (P99 reusable): Journal, Shutdown and the mood
 * check-in. Mood is five levels, each a coloured dot and a word (never an
 * emoji); the selected one fills (200ms colour transition, instant with
 * reduced motion via the global transition rule). Energy is three, segmented.
 */

export const MOODS: readonly MoodLevel[] = [1, 2, 3, 4, 5];
export const ENERGIES: readonly EnergyLevel[] = ["low", "medium", "high"];

export const MOOD_DOT: Record<MoodLevel, string> = {
  1: "bg-danger",
  2: "bg-warning",
  3: "bg-icon-muted",
  4: "bg-personal-dot",
  5: "bg-success-text",
};

export function MoodPicker({
  value,
  onChange,
  labelledBy,
  levelLabel,
  allowClear = true,
  compact = false,
}: {
  value: MoodLevel | null;
  onChange(next: MoodLevel | null): void;
  /** Id of the visible question ("How was today?"). */
  labelledBy: string;
  levelLabel(level: MoodLevel): string;
  /** Pressing the selected mood clears it. */
  allowClear?: boolean;
  compact?: boolean;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="grid grid-cols-5 gap-1.5" data-mood-picker>
      {MOODS.map((level) => {
        const selected = value === level;
        return (
          <button
            key={level}
            type="button"
            aria-pressed={selected}
            data-mood={level}
            onClick={() => onChange(selected && allowClear ? null : level)}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-xs font-semibold transition-colors duration-200",
              compact ? "min-h-14" : "min-h-16",
              "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
              selected ? "bg-primary text-on-accent" : "bg-subtle text-fg-secondary hover:text-fg",
            )}
          >
            <span aria-hidden className={cn("size-3.5 rounded-full", MOOD_DOT[level], selected && "ring-2 ring-on-accent")} />
            {levelLabel(level)}
          </button>
        );
      })}
    </div>
  );
}

export function EnergySwitch({
  value,
  onChange,
  label,
  levelLabel,
}: {
  value: EnergyLevel;
  onChange(next: EnergyLevel): void;
  label: string;
  levelLabel(level: EnergyLevel): string;
}) {
  return (
    <Segmented
      label={label}
      size="sm"
      value={value}
      onValueChange={onChange}
      options={ENERGIES.map((energy) => ({ value: energy, label: levelLabel(energy) }))}
    />
  );
}
