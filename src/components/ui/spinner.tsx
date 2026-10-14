import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const spinnerVariants = cva(
  "inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
  {
    variants: {
      size: { sm: "size-4", md: "size-5", lg: "size-6" },
    },
    defaultVariants: { size: "sm" },
  },
);

export interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
  /**
   * Standalone use: announces the label in a role="status" region. Omit it
   * inside a control that already conveys the busy state (aria-busy).
   */
  label?: string;
  className?: string;
}

/** Open-arc spinner in the current text colour; decorative unless labelled. */
export function Spinner({ label, size, className }: SpinnerProps) {
  const arc = <span aria-hidden="true" className={cn(spinnerVariants({ size }), className)} />;
  if (!label) return arc;
  return (
    <span role="status" className="inline-flex items-center">
      {arc}
      <span className="sr-only">{label}</span>
    </span>
  );
}
