"use client";

import { Dialog as DialogPrimitive, Direction } from "radix-ui";
import { useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { keepOpenWhileClearingSearch, overlayClassName } from "@/components/ui/dialog";
import {
  SheetFrame,
  responsiveSheetChrome,
  sheetLayoutClassName,
  sheetSurfaceClassName,
} from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

/*
 * Floating panel (P18 Quick note, Voice capture): on desktop a NON-modal
 * Radix Dialog pinned to the bottom inline-end corner. No scrim, no focus
 * trap, the page stays interactive (role="dialog" without aria-modal), and an
 * outside click or focus does not close it by default, so a half-typed note
 * survives clicking around. Escape closes it and returns focus to the trigger.
 *
 * Below lg it is the modal bottom sheet ("Mobile: all are bottom sheets"):
 * same single dialog element, Sheet's bottom geometry and keyframes from CSS,
 * plus the scrim and focus trap that only a modal Radix Dialog provides. The
 * modal flag follows the lg media query; panels are closed during SSR, so the
 * server snapshot (desktop) never paints.
 */

/** Tailwind's lg breakpoint (64rem); keep in step with the lg: classes below. */
const DESKTOP_QUERY = "(min-width: 64rem)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

export type FloatingPanelProps = Omit<ComponentProps<typeof DialogPrimitive.Root>, "modal">;

/** Root: non-modal from lg up, modal bottom sheet below. */
export function FloatingPanel(props: FloatingPanelProps) {
  const desktop = useIsDesktop();
  return <DialogPrimitive.Root modal={!desktop} {...props} />;
}

export const FloatingPanelTrigger = DialogPrimitive.Trigger;
export const FloatingPanelClose = DialogPrimitive.Close;

export type FloatingPanelContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  /** Accessible name; rendered as the panel heading unless hideTitle. */
  title: ReactNode;
  description?: ReactNode;
  hideTitle?: boolean;
  hideClose?: boolean;
  /**
   * Desktop: close when the pointer or focus moves outside. Off by default:
   * typing a note while clicking around the page must not lose it. Below lg
   * the modal sheet always closes from its scrim, like every bottom sheet.
   */
  closeOnInteractOutside?: boolean;
  /** Extra classes for the scrolling body. */
  bodyClassName?: string;
  /** Actions pinned below the scrolling body, in logical order (primary last). */
  footer?: ReactNode;
};

/*
 * Desktop corner panel layered over the bottom-sheet classes; resets what the
 * bottom layout set (inline insets, centring, height cap, radius, padding).
 */
const desktopClassName = cn(
  "lg:inset-x-auto lg:end-6 lg:bottom-[calc(1.5rem+var(--safe-bottom))] lg:mx-0",
  "lg:w-[380px] lg:max-w-[calc(100%-3rem)] lg:max-h-[calc(100dvh-3rem)] lg:rounded-card lg:pb-0",
  "lg:origin-bottom-right lg:rtl:origin-bottom-left",
  "lg:data-[state=open]:animate-pop-in lg:data-[state=closed]:animate-pop-out",
);

const chrome = responsiveSheetChrome("bottom");

export function FloatingPanelContent({
  title,
  description,
  hideTitle = false,
  hideClose = false,
  closeOnInteractOutside = false,
  className,
  bodyClassName,
  footer,
  children,
  onEscapeKeyDown,
  onInteractOutside,
  ...props
}: FloatingPanelContentProps) {
  const dir = Direction.useDirection();
  const desktop = useIsDesktop();
  return (
    <DialogPrimitive.Portal>
      {/* Radix renders the overlay only while modal, i.e. below lg. */}
      <DialogPrimitive.Overlay className={overlayClassName} />
      <DialogPrimitive.Content
        dir={dir}
        data-floating-panel=""
        {...(description == null ? { "aria-describedby": undefined } : {})}
        {...props}
        onEscapeKeyDown={(event) => keepOpenWhileClearingSearch(event, onEscapeKeyDown)}
        onInteractOutside={(event) => {
          onInteractOutside?.(event);
          if (desktop && !closeOnInteractOutside) event.preventDefault();
        }}
        className={cn(sheetSurfaceClassName, sheetLayoutClassName.bottom, desktopClassName, className)}
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
