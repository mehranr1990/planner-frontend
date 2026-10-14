import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { statusTokens, type StatusTone } from "../tokens/colors";

interface StatusChipProps {
  tone: StatusTone;
  children: ReactNode;
  /** Status is never colour alone: pass an icon or keep the label explicit. */
  icon?: LucideIcon;
  className?: string;
}

export function StatusChip({ tone, children, icon: Glyph, className }: StatusChipProps) {
  const token = statusTokens[tone];
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold",
        token.soft,
        token.text,
        className,
      )}
    >
      {Glyph ? <Glyph aria-hidden size={14} strokeWidth={2} /> : null}
      {children}
    </span>
  );
}
