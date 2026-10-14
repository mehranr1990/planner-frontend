import type { CSSProperties, ReactNode } from "react";
import type { Scope } from "@/design-system/tokens/colors";
import { cn } from "@/lib/cn";

/*
 * SPECIALIZED VISUALIZATION — not a general progress primitive. Default
 * progress is linear, segmented, numeric or compact inline (design-system
 * Rules page). Use a ring only where an approved screen design draws one:
 * the RingCard focus summary (Cards), goal progress (S1, S11), project health
 * (S4), company health (S6), habit monthly completion (S9).
 *
 * Colour, size and stroke differ between those designs (scope base on Cards,
 * S1, S4, S6; scope deep on S9, S11), so tone and shade have no default: the
 * screen sets them. RTL mirrors the fill direction (FaRules: progress fill
 * mirrors); the centre content never mirrors. Server-compatible; pass
 * localised text (valueText, children) from the caller.
 */

const fillTone: Record<"base" | "deep", Record<Scope | "scope", string>> = {
  base: {
    scope: "stroke-scope-dot",
    personal: "stroke-personal-dot",
    project: "stroke-project-dot",
    team: "stroke-team-dot",
    company: "stroke-company-dot",
  },
  deep: {
    scope: "stroke-scope-deep",
    personal: "stroke-personal-deep",
    project: "stroke-project-deep",
    team: "stroke-team-deep",
    company: "stroke-company-deep",
  },
};

export interface ProgressRingProps {
  value: number;
  min?: number;
  max?: number;
  /** Accessible name. */
  label: string;
  /** Localised value for assistive tech, e.g. "۱۶۰ ساعت از ۲۰۰". */
  valueText?: string;
  /**
   * Outer diameter in px. The SVG scales to the box, so a size utility in
   * className (e.g. "max-sm:size-36") can override it responsively; the
   * stroke scales with it.
   */
  size?: number;
  strokeWidth?: number;
  /** Scope of the fill, as drawn in the screen design: the active scope or a fixed one. */
  tone: Scope | "scope";
  /** Colour step of the fill, as drawn in the screen design: scope base (dot) or deep. */
  shade: "base" | "deep";
  /** Centre content (value, unit); never mirrored. */
  children?: ReactNode;
  className?: string;
}

export function ProgressRing({
  value,
  min = 0,
  max = 100,
  label,
  valueText,
  size = 196,
  strokeWidth = 18,
  tone,
  shade,
  children,
  className,
}: ProgressRingProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const ratio = max > min ? (clamped - min) / (max - min) : 0;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
      className={cn("relative inline-grid size-(--ring-size) shrink-0 place-items-center", className)}
      // Dynamic geometry: the diameter is data (a variable, so classes can override it).
      style={{ "--ring-size": `${size}px` } as CSSProperties}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        data-slot="ring"
        className="absolute inset-0 size-full rtl:-scale-x-100"
      >
        <g transform={`rotate(-90 ${center} ${center})`} fill="none" strokeWidth={strokeWidth}>
          <circle cx={center} cy={center} r={radius} className="stroke-raised" />
          <circle
            data-slot="ring-fill"
            cx={center}
            cy={center}
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            className={cn("transition-[stroke-dashoffset] duration-(--motion-slow) ease-emphasized", fillTone[shade][tone])}
          />
        </g>
      </svg>
      {children ? <div className="relative flex flex-col items-center justify-center text-center">{children}</div> : null}
    </div>
  );
}
