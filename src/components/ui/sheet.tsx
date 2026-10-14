"use client";

import { keepOpenWhileClearingSearch } from "./dialog";
import { Dialog as DialogPrimitive, Direction } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import {
  OverlayCloseButton,
  overlayClassName,
  overlayDescriptionClassName,
  overlayTitleClassName,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

/*
 * Sheet: a Radix Dialog pinned to an edge.
 * - side="end": full-height panel at the inline end (right in LTR, left in
 *   RTL). animate-sheet-in/out read --sheet-offset, which flips under
 *   [dir="rtl"]; the content carries dir itself so this holds in a portal.
 * - side="bottom": the mobile bottom sheet with a grab handle, rounded top,
 *   safe-area padding and internal scroll.
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export type SheetSide = "end" | "bottom";

export type SheetContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  hideTitle?: boolean;
  hideClose?: boolean;
  side?: SheetSide;
  /** Extra classes for the scrolling body. */
  bodyClassName?: string;
  /** Actions pinned below the scrolling body, in logical order (primary last). */
  footer?: ReactNode;
};

const sideClassName: Record<SheetSide, string> = {
  end: cn(
    "inset-y-0 end-0 h-dvh w-full max-w-md pt-(--safe-top) pb-(--safe-bottom)",
    "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
  ),
  bottom: cn(
    "inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-xl rounded-t-card pb-(--safe-bottom)",
    "data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down",
  ),
};

export function SheetContent({
  title,
  description,
  hideTitle = false,
  hideClose = false,
  side = "end",
  className,
  bodyClassName,
  footer,
  children,
  onEscapeKeyDown,
  ...props
}: SheetContentProps) {
  const dir = Direction.useDirection();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClassName} />
      <DialogPrimitive.Content
        dir={dir}
        data-side={side}
        {...(description == null ? { "aria-describedby": undefined } : {})}
        {...props}
        onEscapeKeyDown={(event) => keepOpenWhileClearingSearch(event, onEscapeKeyDown)}
        className={cn(
          "fixed z-(--z-overlay) flex flex-col bg-elevated text-fg shadow-elevated",
          sideClassName[side],
          className,
        )}
      >
        {side === "bottom" ? (
          <span aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-pill bg-outline" />
        ) : null}
        <div
          className={cn(
            "flex shrink-0 flex-col gap-1 px-card",
            side === "bottom" ? "pt-3" : "pt-card",
            !hideClose && "pe-16",
            hideTitle && !description && "sr-only",
          )}
        >
          <DialogPrimitive.Title className={cn(overlayTitleClassName, hideTitle && "sr-only")}>
            {title}
          </DialogPrimitive.Title>
          {description != null ? (
            <DialogPrimitive.Description className={overlayDescriptionClassName}>
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-card pt-4 pb-card", bodyClassName)}>
          {children}
        </div>
        {footer != null ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-card py-4">
            {footer}
          </div>
        ) : null}
        {hideClose ? null : (
          <OverlayCloseButton className={side === "bottom" ? "top-4" : "top-[calc(var(--safe-top)+0.75rem)]"} />
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
