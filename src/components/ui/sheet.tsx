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
 * Sheet: a modal Radix Dialog for the P18 container rule.
 * - side="end": the desktop drawer. A floating product panel inset 16px from
 *   the top, bottom and inline end (P06TaskDetail), 32px radius, no notch.
 *   size="drawer" (420px) for multi-field create/edit, "detail" (520px) for
 *   Task detail. animate-sheet-in/out read --sheet-offset, which flips under
 *   [dir="rtl"]; the content carries dir itself so this holds in a portal.
 * - side="center": the centred sheet (Add expense, Quick Add), up to 760px.
 * - side="bottom": the bottom sheet with a grab handle, rounded top,
 *   safe-area padding and internal scroll.
 *
 * Below lg every side renders as the bottom sheet ("Mobile: all are bottom
 * sheets"). mobileSide="fullscreen" swaps that for a full-screen view (P06
 * mobile) and "same" keeps the desktop geometry. The switch is pure CSS (lg:
 * variants), so SSR and first paint are right and each breakpoint picks its
 * own keyframes.
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export type SheetSide = "end" | "bottom" | "center";
/** Width of an end drawer: P18 create/edit drawers vs the P06 Task detail drawer. */
export type SheetSize = "drawer" | "detail";
/** Geometry below lg for side="end" | "center"; side="bottom" ignores it. */
export type SheetMobileSide = "bottom" | "fullscreen" | "same";

type SheetLayout = "bottom" | "fullscreen" | "end" | "center";

export type SheetContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  hideTitle?: boolean;
  hideClose?: boolean;
  side?: SheetSide;
  /** Drawer width for side="end": 420px (default) or 520px. */
  size?: SheetSize;
  /** Below lg: bottom sheet (default), full-screen view, or the desktop geometry. */
  mobileSide?: SheetMobileSide;
  /** Extra classes for the scrolling body. */
  bodyClassName?: string;
  /** Actions pinned below the scrolling body, in logical order (primary last). */
  footer?: ReactNode;
};

/** Geometry + motion of each layout at every width (no breakpoint prefix). */
export const sheetLayoutClassName: Record<SheetLayout, string> = {
  bottom: cn(
    "inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-xl rounded-t-card pb-(--safe-bottom)",
    "data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down",
  ),
  fullscreen: cn(
    "inset-0 h-dvh w-full pt-(--safe-top) pb-(--safe-bottom)",
    "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
  ),
  end: cn(
    "inset-y-4 end-4 w-[calc(100%-2rem)] rounded-card",
    "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
  ),
  center: cn(
    "inset-4 m-auto h-fit max-h-[calc(100dvh-2rem)] max-w-[760px] rounded-card",
    "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
  ),
};

const endSizeClassName: Record<SheetSize, string> = {
  drawer: "max-w-[420px]",
  detail: "max-w-[520px]",
};

/*
 * Desktop geometry layered over a bottom or full-screen mobile layout. Each
 * string also resets what either mobile layout set (insets, height, padding,
 * radius, motion), since both sets of classes are present at lg.
 */
const desktopClassName: Record<"end" | "center", string> = {
  end: cn(
    "lg:inset-y-4 lg:start-auto lg:end-4 lg:mx-0 lg:h-auto lg:max-h-none lg:w-[calc(100%-2rem)]",
    "lg:rounded-card lg:pt-0 lg:pb-0",
    "lg:data-[state=open]:animate-sheet-in lg:data-[state=closed]:animate-sheet-out",
  ),
  center: cn(
    "lg:inset-6 lg:m-auto lg:h-fit lg:max-h-[calc(100dvh-3rem)] lg:w-auto lg:max-w-[760px]",
    "lg:rounded-card lg:pt-0 lg:pb-0",
    "lg:data-[state=open]:animate-pop-in lg:data-[state=closed]:animate-pop-out",
  ),
};

const desktopEndSizeClassName: Record<SheetSize, string> = {
  drawer: "lg:max-w-[420px]",
  detail: "lg:max-w-[520px]",
};

/** Shared panel surface: product surface, no notch (P18 Geometry rule). */
export const sheetSurfaceClassName =
  "fixed z-(--z-overlay) flex flex-col overflow-hidden bg-elevated text-fg shadow-elevated";

/** Handle, header and close placement for a layout, optionally switching at lg. */
export interface SheetChromeLayout {
  /** Grab handle classes, or false for none. */
  handle: string | false;
  header: string;
  close: string;
}

const chromeFor = (layout: SheetLayout) => ({
  header: layout === "bottom" ? "pt-3" : "pt-card",
  close:
    layout === "bottom" ? "top-4" : layout === "fullscreen" ? "top-[calc(var(--safe-top)+0.75rem)]" : "top-3",
});

/** Chrome for a mobile layout that becomes a floating panel (drawer, centred, floating) at lg. */
export function responsiveSheetChrome(mobile: "bottom" | "fullscreen"): SheetChromeLayout {
  const { header, close } = chromeFor(mobile);
  return {
    handle: mobile === "bottom" ? "lg:hidden" : false,
    header: mobile === "bottom" ? cn(header, "lg:pt-card") : header,
    close: cn(close, "lg:top-3"),
  };
}

export type SheetFrameProps = {
  title: ReactNode;
  description?: ReactNode;
  hideTitle?: boolean;
  hideClose?: boolean;
  bodyClassName?: string;
  footer?: ReactNode;
  chrome: SheetChromeLayout;
  children?: ReactNode;
};

/**
 * Inside of every sheet-like panel (Sheet, FloatingPanel): grab handle, title
 * block, scrolling body, pinned footer, then the close button last in DOM
 * order so Radix focuses the first real control.
 */
export function SheetFrame({
  title,
  description,
  hideTitle = false,
  hideClose = false,
  bodyClassName,
  footer,
  chrome,
  children,
}: SheetFrameProps) {
  return (
    <>
      {chrome.handle !== false ? (
        <span
          aria-hidden
          className={cn("mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-pill bg-outline", chrome.handle)}
        />
      ) : null}
      <div
        className={cn(
          "flex shrink-0 flex-col gap-1 px-card",
          chrome.header,
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
      {hideClose ? null : <OverlayCloseButton className={chrome.close} />}
    </>
  );
}

export function SheetContent({
  title,
  description,
  hideTitle = false,
  hideClose = false,
  side = "end",
  size = "drawer",
  mobileSide = "bottom",
  className,
  bodyClassName,
  footer,
  children,
  onEscapeKeyDown,
  ...props
}: SheetContentProps) {
  const dir = Direction.useDirection();
  const mobile: SheetLayout = side === "bottom" ? "bottom" : mobileSide === "same" ? side : mobileSide;
  const responsive = mobile !== side;

  const layoutClassName = responsive
    ? [
        sheetLayoutClassName[mobile],
        desktopClassName[side as "end" | "center"],
        side === "end" && desktopEndSizeClassName[size],
      ]
    : [sheetLayoutClassName[side], side === "end" && endSizeClassName[size]];

  const chrome: SheetChromeLayout = responsive
    ? responsiveSheetChrome(mobile as "bottom" | "fullscreen")
    : { handle: side === "bottom" ? "" : false, ...chromeFor(side) };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClassName} />
      <DialogPrimitive.Content
        dir={dir}
        data-side={side}
        data-mobile-side={mobile}
        {...(side === "end" ? { "data-size": size } : {})}
        {...(description == null ? { "aria-describedby": undefined } : {})}
        {...props}
        onEscapeKeyDown={(event) => keepOpenWhileClearingSearch(event, onEscapeKeyDown)}
        className={cn(sheetSurfaceClassName, layoutClassName, className)}
      >
        <SheetFrame
          title={title}
          description={description}
          hideTitle={hideTitle}
          hideClose={hideClose}
          bodyClassName={bodyClassName}
          footer={footer}
          chrome={chrome}
        >
          {children}
        </SheetFrame>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
