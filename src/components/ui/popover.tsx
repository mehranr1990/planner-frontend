"use client";

import { Direction, Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/*
 * Popover on Radix Popover: a floating elevated surface for non-menu content
 * (notifications, pickers). Escape, outside click and focus return are Radix's.
 */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Content> & {
  /** Show a pointer toward the trigger. Off by default, as in the Shell board. Ignored with asChild. */
  arrow?: boolean;
  /**
   * Skip the elevated surface (border, background, padding, width, scroll):
   * keep only the portal, dir, stacking, transform origin and pop animation.
   * For a child that brings its own surface, usually with asChild:
   * <PopoverContent unstyled asChild><ContextSwitcherPanel /></PopoverContent>.
   */
  unstyled?: boolean;
};

export function PopoverContent({
  arrow = false,
  unstyled = false,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  collisionPadding = 16,
  className,
  children,
  ...props
}: PopoverContentProps) {
  const dir = Direction.useDirection();
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        dir={dir}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-(--z-overlay) origin-(--radix-popover-content-transform-origin)",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          !unstyled && [
            "w-80 max-w-[calc(100vw-2rem)] max-h-(--radix-popover-content-available-height) overflow-y-auto",
            "rounded-tile border border-hairline bg-elevated p-3 text-fg shadow-elevated",
          ],
          className,
        )}
        {...props}
      >
        {/* asChild needs a single child, so no arrow beside it. */}
        {arrow && !props.asChild ? (
          <>
            {children}
            <PopoverPrimitive.Arrow width={16} height={8} className="fill-elevated" />
          </>
        ) : (
          children
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
