import { cn } from "@/lib/cn";

/*
 * Focus Clock (DataVizRefine, frozen): 24 sculpted hour wedges on a
 * clockwise dial, midnight at the top. Wedge length = typical focus minutes
 * in that hour (capped at 60), colour tier = how deep that focus is, and an
 * arc on the rim marks the best window. Clock geometry is never mirrored in
 * RTL (FaRules): the SVG is an LTR island and only the labels localise.
 * Used by Insights; the Focus screen itself never shows it (P09 rules).
 */

export interface FocusClockProps {
  /** 24 values, focus minutes per hour of the day (0 = none). */
  minutesByHour: readonly number[];
  /** Best focus window as [startHour, endHour), drawn as a rim arc. */
  best?: readonly [number, number];
  /** Accessible name of the figure, e.g. "Typical focus by hour". */
  label: string;
  /** Hour label on the dial (digits per preference). Defaults to "09". */
  formatHour?: (hour: number) => string;
  /** Text for one hour in the screen-reader list, e.g. "09:00 · 54 min". */
  describeHour?: (hour: number, minutes: number) => string;
  className?: string;
}

const CX = 210;
const CY = 210;
const R0 = 58;
const RMAX = 168;
const CAP = 60;
const GAP = 0.035;

/** 0 none · 1 light (<25m) · 2 solid (<45m) · 3 deep (≥45m). */
export function focusTier(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes >= 45) return 3;
  if (minutes >= 25) return 2;
  return minutes > 0 ? 1 : 0;
}

const tierFill = ["fill-hairline", "fill-personal-soft", "fill-[var(--viz-green)]", "fill-personal-deep"] as const;

const f1 = (value: number) => Math.round(value * 10) / 10;
const point = (r: number, angle: number): [number, number] => [f1(CX + r * Math.sin(angle)), f1(CY - r * Math.cos(angle))];
const hourAngle = (hour: number) => (hour / 24) * Math.PI * 2;

/** Wedge outline for one hour; clockwise from midnight at the top. */
export function wedgePath(hour: number, minutes: number): string {
  const a0 = hourAngle(hour) + GAP;
  const a1 = hourAngle(hour + 1) - GAP;
  const r1 = minutes > 0 ? R0 + 14 + (RMAX - R0 - 14) * Math.min(1, minutes / CAP) : R0 + 8;
  const [x1, y1] = point(R0, a0);
  const [x2, y2] = point(r1, a0);
  const [x3, y3] = point(r1, a1);
  const [x4, y4] = point(R0, a1);
  return `M${x1} ${y1} L${x2} ${y2} A${f1(r1)} ${f1(r1)} 0 0 1 ${x3} ${y3} L${x4} ${y4} A${R0} ${R0} 0 0 0 ${x1} ${y1} Z`;
}

function rimArc(r: number, h0: number, h1: number): string {
  const [x1, y1] = point(r, hourAngle(h0));
  const [x2, y2] = point(r, hourAngle(h1));
  return `M${x1} ${y1} A${r} ${r} 0 ${hourAngle(h1) - hourAngle(h0) > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
}

const pad = (hour: number) => String(hour).padStart(2, "0");

export function FocusClock({
  minutesByHour,
  best,
  label,
  formatHour = pad,
  describeHour = (hour, minutes) => `${pad(hour)}:00 · ${minutes}m`,
  className,
}: FocusClockProps) {
  const hours = Array.from({ length: 24 }, (_, hour) => Math.max(0, minutesByHour[hour] ?? 0));
  const dial = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <figure className={cn("m-0", className)} aria-label={label}>
      <svg viewBox="0 0 420 420" aria-hidden="true" className="block h-auto w-full [direction:ltr]" data-slot="focus-clock">
        <circle cx={CX} cy={CY} r={RMAX} className="fill-none stroke-hairline" strokeDasharray="2 4" />
        {hours.map((minutes, hour) => (
          <path key={hour} d={wedgePath(hour, minutes)} data-tier={focusTier(minutes)} className={tierFill[focusTier(minutes)]} />
        ))}
        {best ? (
          <path
            d={rimArc(RMAX + 4, best[0], best[1])}
            data-slot="best"
            className="fill-none stroke-personal-deep"
            strokeWidth={4}
            strokeLinecap="round"
          />
        ) : null}
        {dial.map((hour) => {
          const [x, y] = point(RMAX + 22, hourAngle(hour));
          return (
            <text
              key={hour}
              x={x}
              y={f1(y + 4)}
              textAnchor="middle"
              className={cn("fill-fg-muted text-[11px] tabular", hour % 6 === 0 && "font-bold fill-fg")}
            >
              {formatHour(hour)}
            </text>
          );
        })}
      </svg>
      <ul className="sr-only">
        {hours.map((minutes, hour) => (minutes > 0 ? <li key={hour}>{describeHour(hour, minutes)}</li> : null))}
      </ul>
    </figure>
  );
}
