import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface IconProps {
  icon: LucideIcon;
  /**
   * Flip under dir="rtl". Use for direction-bearing glyphs (chevrons, arrows,
   * send, undo); never for search, plus, play, clock, check or chart axes.
   */
  mirror?: boolean;
  /** Accessible name. Omit for decorative icons next to a visible label. */
  label?: string;
  size?: number;
  className?: string;
}

export function Icon({ icon: Glyph, mirror = false, label, size = 20, className }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={cn(mirror && "rtl:-scale-x-100", className)}
    />
  );
}
