"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import { useId, useState, type ReactNode } from "react";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/locale/digits";
import { useFieldControl } from "./field";

export interface SliderProps {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Fires when the user releases the thumb / finishes a key press. */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Visible label above the track (e.g. "Daily capacity"). */
  label?: ReactNode;
  /**
   * Value text shown at the inline end and announced as aria-valuetext,
   * e.g. (8) → "8 h" / "۸ ساعت". Defaults to the number in the user's digits.
   */
  formatValue?: (value: number) => string;
  name?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

/**
 * Single-thumb range (Radix). The fill grows from the inline start: Radix
 * reads the app direction, so in RTL it fills right-to-left and the arrow
 * keys follow suit.
 */
export function Slider({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  label,
  formatValue,
  name,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: SliderProps) {
  const { digits } = usePreferences();
  const autoId = useId();
  const labelId = `${autoId}-label`;
  const control = useFieldControl({ id, disabled, "aria-describedby": ariaDescribedBy });
  const [internal, setInternal] = useState(defaultValue ?? min);
  const current = value ?? internal;
  const text = formatValue ? formatValue(current) : formatNumber(current, digits);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-3 text-[0.8125rem] font-semibold">
          <span id={labelId} className={control.disabled ? "text-fg-muted" : "text-fg"}>
            {label}
          </span>
          <span className="tabular text-scope-deep" aria-hidden="true">
            {text}
          </span>
        </div>
      ) : null}
      <SliderPrimitive.Root
        value={[current]}
        onValueChange={([next]) => {
          if (next === undefined) return;
          if (value === undefined) setInternal(next);
          onValueChange?.(next);
        }}
        onValueCommit={([next]) => {
          if (next !== undefined) onValueCommit?.(next);
        }}
        min={min}
        max={max}
        step={step}
        name={name}
        disabled={control.disabled}
        className={cn(
          "relative flex h-8 w-full touch-none select-none items-center",
          "data-disabled:cursor-not-allowed data-disabled:opacity-45",
        )}
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-pill bg-raised">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          id={control.id}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : label ? labelId : control.labelId}
          aria-describedby={control["aria-describedby"]}
          aria-valuetext={text}
          className={cn(
            "relative block size-5 rounded-full border-2 border-surface bg-primary transition-[scale]",
            "hover:scale-110 before:absolute before:-inset-3.5 before:content-['']",
          )}
        />
      </SliderPrimitive.Root>
    </div>
  );
}
