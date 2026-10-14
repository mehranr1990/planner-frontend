import { cn } from "@/lib/cn";

/*
 * Segmented progress — one of the DEFAULT progress patterns (with linear,
 * numeric and compact inline). Two forms appear in the approved boards:
 *  - parts: proportional segments in scope tones, e.g. the Shell "Today
 *    progress" bar (base · deep · track) or the My Day capacity bar;
 *  - steps: equal dashes for "n of m", e.g. the lead card's dashes, Habits
 *    4/5 and Milestones 3/5.
 * Segments are laid out from inline-start, so RTL fills right-to-left.
 */

export type SegmentTone = "base" | "deep" | "track";

const toneClass: Record<SegmentTone, string> = {
  base: "bg-scope-dot",
  deep: "bg-scope-deep",
  track: "bg-hairline",
};

interface SharedProps {
  /** Accessible name, e.g. "Today progress". */
  label: string;
  /** Visible/announced value text, already localised (e.g. "۴ از ۵"). */
  valueText: string;
  className?: string;
}

interface PartsProps extends SharedProps {
  /** Proportional segments; values are relative weights. */
  parts: readonly { value: number; tone: SegmentTone }[];
  /** 0–100 for aria-valuenow (the parts are a visual breakdown). */
  value: number;
  steps?: never;
}

interface StepsProps extends SharedProps {
  /** "done of total" as equal dashes. */
  steps: { done: number; total: number };
  parts?: never;
  value?: never;
}

export type SegmentedProgressProps = PartsProps | StepsProps;

export function SegmentedProgress(props: SegmentedProgressProps) {
  const { label, valueText, className } = props;

  if (props.steps) {
    const { done, total } = props.steps;
    const filled = Math.min(total, Math.max(0, done));
    return (
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={filled}
        aria-valuetext={valueText}
        className={cn("flex h-1.5 w-full gap-1", className)}
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={cn("flex-1 rounded-pill", index < filled ? toneClass.deep : toneClass.track)}
          />
        ))}
      </div>
    );
  }

  const total = props.parts.reduce((sum, part) => sum + Math.max(0, part.value), 0) || 1;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.max(0, props.value))}
      aria-valuetext={valueText}
      className={cn("flex h-2 w-full gap-1", className)}
    >
      {props.parts.map((part, index) => (
        <span
          key={index}
          aria-hidden
          className={cn("rounded-pill", toneClass[part.tone])}
          // Dynamic geometry: each segment's share is data.
          style={{ flexGrow: Math.max(0, part.value) / total, flexBasis: 0 }}
        />
      ))}
    </div>
  );
}
