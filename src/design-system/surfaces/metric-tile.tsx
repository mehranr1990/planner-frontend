import { Children, isValidElement, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * MetricTile family (P00 "Related family · one geometry, no individual
 * notches"): KPI groups share one clean geometry and are never notched.
 * Board `.soft` tile: subtle surface, 20px radius, 14px padding, 6px gap;
 * label 12px semibold muted, value 26px/600 tabular, hint 11px semibold muted.
 * Server components.
 *
 * Each tile is a <dl> (label → value → hint), so assistive tech reads the
 * pair together. tone="danger" (board "Blocked" tile) tints the tile, but the
 * label must still name the state: colour is never the only signal.
 */

export type MetricTileTone = "default" | "danger";

const tileTones: Record<MetricTileTone, { tile: string; muted: string; value: string }> = {
  default: { tile: "bg-subtle text-fg", muted: "text-fg-muted", value: "text-fg" },
  danger: { tile: "bg-danger-soft text-danger-text", muted: "text-danger-text", value: "text-danger-text" },
};

export type MetricTileProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** What is measured; for tone="danger" it must name the state (e.g. "Blocked"). */
  label: ReactNode;
  /** Pre-formatted value (localised digits are the caller's job). */
  value: ReactNode;
  /** Comparison or target line, e.g. "+3h vs last week". */
  hint?: ReactNode;
  tone?: MetricTileTone;
  /** Extra content under the value, e.g. a progress bar. */
  children?: ReactNode;
};

export function MetricTile({ label, value, hint, tone = "default", className, children, ...props }: MetricTileProps) {
  const colours = tileTones[tone];
  return (
    <dl
      data-slot="metric-tile"
      data-tone={tone}
      className={cn("flex min-w-0 flex-col gap-1.5 rounded-metric p-3.5", colours.tile, className)}
      {...props}
    >
      <dt className={cn("text-xs font-semibold", colours.muted)}>{label}</dt>
      <dd className={cn("tabular text-[1.625rem] font-semibold leading-none", colours.value)}>{value}</dd>
      {hint ? <dd className={cn("text-[0.6875rem] font-semibold", colours.muted)}>{hint}</dd> : null}
      {children ? <dd>{children}</dd> : null}
    </dl>
  );
}

const groupColumns = {
  /** Two tiles side by side at any width. */
  2: "grid-cols-2",
  /** One row of three when the group is at least 28rem wide, otherwise stacked. */
  3: "grid-cols-1 @md:grid-cols-3",
  /** One row of four when the group is at least 36rem wide, otherwise 2 × 2. */
  4: "grid-cols-2 @xl:grid-cols-4",
} as const;

export type MetricGroupProps = Omit<HTMLAttributes<HTMLUListElement>, "aria-label"> & {
  /** Accessible name of the group, e.g. "This week". */
  "aria-label": string;
  /** Columns at full width; the group falls back by its own width (container query), not the viewport. */
  columns?: keyof typeof groupColumns;
  /** MetricTile elements; each is wrapped in a list item. */
  children: ReactNode;
};

/** A related family of MetricTiles laid out as a list (ul/li) in one shared grid. */
export function MetricGroup({ columns = 4, className, children, ...props }: MetricGroupProps) {
  return (
    <div className="@container min-w-0">
      <ul data-slot="metric-group" className={cn("grid gap-2.5", groupColumns[columns], className)} {...props}>
        {Children.toArray(children).map((child, index) => (
          <li key={isValidElement(child) && child.key != null ? child.key : index} className="grid min-w-0">
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}
