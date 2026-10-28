import type { Direction } from "@/lib/locale/direction";
import { cn } from "@/lib/cn";
import { smoothPath } from "./goal-milestone-path";

/*
 * Context Ribbon (DataVizPersonal 07, frozen): "Where did my time and
 * attention go?" One soft band per context, stacked around a gently drifting
 * centre line, each band's thickness = time on that day; the ends taper.
 * Time runs along x, so RTL mirrors the x coordinates (never a CSS flip).
 * Emphasis fades the other bands to 12%; band paths morph on data change
 * (450ms, swapped under reduced motion).
 */

type Point = [number, number];

export interface ContextRibbonSeries {
  id: string;
  label: string;
  /** CSS colour, e.g. "var(--personal-dot)". */
  color: string;
  /** One value per column (e.g. minutes per weekday). */
  values: readonly number[];
}

export interface ContextRibbonProps {
  series: readonly ContextRibbonSeries[];
  /** One label per column, in time order (Sat → Fri). */
  columns: readonly string[];
  /** Accessible name of the figure. */
  label: string;
  /** Emphasised series id; the others fade. */
  emphasis?: string | null;
  /** Value text for the screen-reader table, e.g. minutes → "2h 30m". */
  formatValue?: (value: number) => string;
  direction?: Direction;
  compact?: boolean;
  className?: string;
}

export const RIBBON_W = 820;
const GAP = 2.5;
/** Board taper: the stream narrows at both ends. */
const TAPER = [0.5, 0.92, 1, 1, 1, 0.92, 0.5];

const f1 = (value: number) => Number(value.toFixed(1));

/** Band outlines (top edge forward, bottom edge back) in the RIBBON_W × height view box. */
export function ribbonGeometry(
  values: readonly (readonly number[])[],
  { height, direction = "ltr", compact = false }: { height: number; direction?: Direction; compact?: boolean },
): { bands: string[]; xs: number[] } {
  const columns = values[0]?.length ?? 0;
  if (!columns) return { bands: values.map(() => ""), xs: [] };
  const pad = compact ? 6 : 24;
  const x = (i: number) => {
    const ltr = columns === 1 ? RIBBON_W / 2 : pad + (i / (columns - 1)) * (RIBBON_W - 2 * pad);
    return f1(direction === "rtl" ? RIBBON_W - ltr : ltr);
  };
  const totals = Array.from({ length: columns }, (_, i) => values.reduce((sum, row) => sum + Math.max(0, row[i] ?? 0), 0));
  const scale = (height * 0.8) / Math.max(1, ...totals);
  const taper = (i: number) => (columns === TAPER.length ? TAPER[i]! : i === 0 || i === columns - 1 ? 0.6 : 1);
  const tops: Point[][] = values.map(() => []);
  const bottoms: Point[][] = values.map(() => []);
  for (let i = 0; i < columns; i += 1) {
    const thickness = totals[i]! * scale * taper(i) + GAP * (values.length - 1);
    let y = height / 2 + 8 * Math.sin(i * 1.1) - thickness / 2;
    values.forEach((row, k) => {
      tops[k]!.push([x(i), y]);
      y += Math.max(0, row[i] ?? 0) * scale * taper(i);
      bottoms[k]!.push([x(i), y]);
      y += GAP;
    });
  }
  const bands = values.map((_, k) => `${smoothPath(tops[k]!)} L${smoothPath([...bottoms[k]!].reverse()).slice(1)} Z`);
  return { bands, xs: Array.from({ length: columns }, (_, i) => x(i)) };
}

export function ContextRibbon({
  series,
  columns,
  label,
  emphasis = null,
  formatValue = String,
  direction = "ltr",
  compact = false,
  className,
}: ContextRibbonProps) {
  const height = compact ? 160 : 220;
  const { bands, xs } = ribbonGeometry(
    series.map((item) => item.values),
    { height, direction, compact },
  );

  return (
    <figure className={cn("m-0 flex flex-col gap-2", className)} aria-label={label} data-slot="context-ribbon">
      <svg viewBox={`0 0 ${RIBBON_W} ${height + 24}`} aria-hidden="true" className="block h-auto w-full">
        {series.map((item, k) => (
          <path
            key={item.id}
            d={bands[k]}
            data-band={item.id}
            fill={item.color}
            fillOpacity={emphasis && emphasis !== item.id ? 0.12 : emphasis === item.id ? 0.8 : 0.55}
            className="transition-[d,fill-opacity] duration-450 ease-in-out motion-reduce:transition-none"
          />
        ))}
        {columns.map((column, i) => (
          <text key={i} x={xs[i]} y={height + 18} textAnchor="middle" className="fill-fg-muted text-[12px] font-semibold">
            {column}
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col" />
            {columns.map((column, i) => (
              <th key={i} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((item) => (
            <tr key={item.id}>
              <th scope="row">{item.label}</th>
              {item.values.map((value, i) => (
                <td key={i}>{formatValue(value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
