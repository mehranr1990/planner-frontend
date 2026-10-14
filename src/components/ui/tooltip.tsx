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
 * Tooltip island (DataViz .tip): white in light, graphite surface in dark,
 * hairline ring + soft shadow, 16px radius. Never an ink fill: the product has
 * no black surfaces. Opens on hover and keyboard focus and stacks above
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
            "z-(--z-tooltip) max-w-64 rounded-field bg-surface px-3 py-2.5 text-xs font-semibold text-fg shadow-tooltip",
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
