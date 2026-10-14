import { cn } from "@/lib/cn";

interface ProgressProps {
  /** 0–100 */
  value: number;
  label: string;
  /** Visible value text, already localised (e.g. "۶۸٪"). */
  valueText?: string;
  /** `md` (8px) by default; `sm` (6px) for compact inline progress in rows and card footers. */
  size?: "md" | "sm";
  className?: string;
  indicatorClassName?: string;
}

/**
 * Linear progress — the DEFAULT progress pattern across the product (with
 * segmented, numeric and compact inline). Rings are a specialized
 * visualization, used only where a screen design calls for one.
 * The fill grows from inline-start, so it runs right-to-left
 * under dir="rtl" without any extra logic.
 */
export function Progress({ value, label, valueText, size = "md", className, indicatorClassName }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
      className={cn("w-full overflow-hidden rounded-pill bg-hairline", size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <div
        className={cn("h-full rounded-pill bg-primary transition-[width] duration-(--motion-standard)", indicatorClassName)}
        // Dynamic geometry: the fill width is data, not style.
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
