"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

interface TooltipProps {
  content: ReactNode;
  /** A single focusable element (button, link). */
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * Inverse-ink tooltip; opens on hover and keyboard focus and stacks above
 * overlays and toasts (z-tooltip). Supplementary text only: never the sole
 * label of a control.
 */
export function Tooltip({ content, children, side = "top", align = "center", className }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={16}
          className={cn(
            "z-(--z-tooltip) max-w-64 rounded-row bg-fg px-3 py-2 text-xs font-semibold text-surface",
            "origin-(--radix-tooltip-content-transform-origin)",
            "data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-pop-in data-[state=closed]:animate-pop-out",
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
