"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive, Direction } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/*
 * Modal dialog on Radix Dialog: focus trap, Escape, outside-click dismissal,
 * focus restoration and scroll lock all come from Radix. The title is a
 * required prop so every dialog has an accessible name.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Scrim shared by Dialog, AlertDialog and Sheet: 28% ink in light, 55% black
 * in dark (P18/P06 .scrim). A themed token, not a tint of the text colour,
 * which would turn into a light wash in dark mode.
 */
export const overlayClassName = cn(
  "fixed inset-0 z-(--z-overlay) bg-scrim",
  "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
);

/** Title + description typography shared by Dialog, AlertDialog and Sheet. */
export const overlayTitleClassName = "type-title text-fg";
export const overlayDescriptionClassName = "type-body text-fg-secondary";

/** Round ghost "Close" button pinned to the inline-end top corner. */
export function OverlayCloseButton({ className }: { className?: string }) {
  const t = useTranslations("Common");
  return (
    <DialogPrimitive.Close asChild>
      <IconButton icon={X} label={t("close")} variant="ghost" className={cn("absolute end-3 top-3", className)} />
    </DialogPrimitive.Close>
  );
}

const sizeClassName = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

export type DialogContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  /** Accessible name, rendered as the dialog heading. */
  title: ReactNode;
  description?: ReactNode;
  /** Keep the title for assistive tech but hide it visually. */
  hideTitle?: boolean;
  /** Hide the corner close button (Escape and the scrim still close). */
  hideClose?: boolean;
  size?: keyof typeof sizeClassName;
};

/**
 * Escape from a search field that still has text clears the field (see
 * SearchField) instead of closing the overlay; a second Escape closes it.
 * Radix handles Escape in the capture phase, before the field sees it.
 */
export function keepOpenWhileClearingSearch(
  event: KeyboardEvent,
  onEscapeKeyDown?: (event: KeyboardEvent) => void,
) {
  onEscapeKeyDown?.(event);
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === "search" && target.value !== "") {
    event.preventDefault();
  }
}

export function DialogContent({
  title,
  description,
  hideTitle = false,
  hideClose = false,
  size = "md",
  className,
  children,
  onEscapeKeyDown,
  ...props
}: DialogContentProps) {
  const dir = Direction.useDirection();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClassName} />
      <DialogPrimitive.Content
        dir={dir}
        // No description: tell Radix not to point aria-describedby at one.
        {...(description == null ? { "aria-describedby": undefined } : {})}
        {...props}
        onEscapeKeyDown={(event) => keepOpenWhileClearingSearch(event, onEscapeKeyDown)}
        className={cn(
          // inset + auto margins centre the box without transforms, which the
          // pop animation owns; h-fit keeps it content-sized.
          "fixed inset-4 z-(--z-overlay) m-auto flex h-fit max-h-[calc(100dvh-2rem)] flex-col overflow-hidden",
          "rounded-card bg-elevated text-fg shadow-elevated sm:inset-6 sm:max-h-[calc(100dvh-3rem)]",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          sizeClassName[size],
          className,
        )}
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-card">
          <div className={cn("flex flex-col gap-2", !hideClose && "pe-10", hideTitle && !description && "contents")}>
            <DialogPrimitive.Title className={cn(overlayTitleClassName, hideTitle && "sr-only")}>
              {title}
            </DialogPrimitive.Title>
            {description != null ? (
              <DialogPrimitive.Description className={overlayDescriptionClassName}>
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          {children}
        </div>
        {/* After the content in DOM order, so Radix focuses the first real control. */}
        {hideClose ? null : <OverlayCloseButton />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Action row; children in logical order (secondary first, primary last). */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2 pt-1", className)} {...props} />;
}
