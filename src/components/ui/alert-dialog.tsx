"use client";

import { Trash2, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { AlertDialog as AlertDialogPrimitive, Direction } from "radix-ui";
import { useState, type ComponentProps, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { overlayClassName, overlayDescriptionClassName, overlayTitleClassName } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/*
 * Alert dialog on Radix AlertDialog: a decision the user must make. Unlike
 * Dialog it never closes on an outside click; Escape and Cancel still close.
 */

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export type AlertDialogTone = "default" | "destructive";

export type AlertDialogContentProps = Omit<ComponentProps<typeof AlertDialogPrimitive.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  tone?: AlertDialogTone;
  /** Glyph in the round badge. Destructive dialogs default to a trash can. */
  icon?: LucideIcon | null;
};

export function AlertDialogContent({
  title,
  description,
  tone = "default",
  icon,
  className,
  children,
  ...props
}: AlertDialogContentProps) {
  const dir = Direction.useDirection();
  const glyph = icon === undefined ? (tone === "destructive" ? Trash2 : null) : icon;
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className={overlayClassName} />
      <AlertDialogPrimitive.Content
        dir={dir}
        {...(description == null ? { "aria-describedby": undefined } : {})}
        {...props}
        className={cn(
          "fixed inset-4 z-(--z-overlay) m-auto flex h-fit max-h-[calc(100dvh-2rem)] max-w-sm flex-col gap-3",
          "overflow-y-auto overscroll-contain rounded-card bg-elevated p-card text-fg shadow-elevated",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
      >
        {glyph ? (
          <span
            aria-hidden
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-pill",
              tone === "destructive" ? "bg-danger-soft text-danger-text" : "bg-scope-soft text-scope-deep",
            )}
          >
            <Icon icon={glyph} size={18} />
          </span>
        ) : null}
        <AlertDialogPrimitive.Title className={overlayTitleClassName}>{title}</AlertDialogPrimitive.Title>
        {description != null ? (
          <AlertDialogPrimitive.Description className={overlayDescriptionClassName}>
            {description}
          </AlertDialogPrimitive.Description>
        ) : null}
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2 pt-1", className)} {...props} />;
}

/** Closes the dialog. Radix focuses it first when the dialog opens. */
export function AlertDialogCancel({ children, ...props }: ComponentProps<typeof Button>) {
  return (
    <AlertDialogPrimitive.Cancel asChild>
      <Button variant="secondary" {...props}>
        {children}
      </Button>
    </AlertDialogPrimitive.Cancel>
  );
}

/** Confirms and closes. For async work use ConfirmDialog. */
export function AlertDialogAction({
  tone = "default",
  children,
  ...props
}: ComponentProps<typeof Button> & { tone?: AlertDialogTone }) {
  return (
    <AlertDialogPrimitive.Action asChild>
      <Button variant={tone === "destructive" ? "destructive" : "primary"} {...props}>
        {children}
      </Button>
    </AlertDialogPrimitive.Action>
  );
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

export interface ConfirmDialogProps {
  title: ReactNode;
  description?: ReactNode;
  /** Defaults to Common.delete for destructive dialogs, Common.confirm otherwise. */
  confirmLabel?: ReactNode;
  /** Defaults to Common.cancel. */
  cancelLabel?: ReactNode;
  tone?: AlertDialogTone;
  icon?: LucideIcon | null;
  /**
   * Return a promise to keep the dialog open with a busy confirm button until
   * it settles. A rejection keeps the dialog open so the user can retry or
   * cancel: report the failure inside the dialog through `error`. Do not use
   * a toast for it; the Toaster sits behind the modal (aria-hidden, inert),
   * so neither sighted keyboard users nor screen readers can reach it.
   */
  onConfirm: () => void | Promise<unknown>;
  /**
   * Failure message shown inside the dialog, above the buttons, as a danger
   * InlineAlert (role="alert", so it is announced). Set it when onConfirm
   * rejects and clear it on retry or close.
   */
  error?: ReactNode;
  /** Element that opens the dialog (rendered with asChild). */
  trigger?: ReactElement;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** Alert dialog with Cancel + Confirm, including an async confirm flow. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  icon,
  onConfirm,
  error,
  trigger,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
}: ConfirmDialogProps) {
  const t = useTranslations("Common");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [pending, setPending] = useState(false);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    // A pending confirmation cannot be dismissed half-way.
    if (pending && !next) return;
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const handleConfirm = async () => {
    if (pending) return;
    const result = onConfirm();
    if (!isThenable(result)) {
      setOpen(false);
      return;
    }
    setPending(true);
    try {
      await result;
      setPending(false);
      if (openProp === undefined) setUncontrolledOpen(false);
      onOpenChange?.(false);
    } catch {
      setPending(false);
    }
  };

  const blockWhilePending = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) event.preventDefault();
  };

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {trigger ? <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger> : null}
      <AlertDialogContent
        title={title}
        description={description}
        tone={tone}
        icon={icon}
        className={className}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        {error != null && error !== false ? <InlineAlert tone="danger" title={error} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel aria-disabled={pending || undefined} onClick={blockWhilePending}>
            {cancelLabel ?? t("cancel")}
          </AlertDialogCancel>
          {/* A plain button, not AlertDialog.Action, so it does not close before the work finishes. */}
          <Button
            variant={tone === "destructive" ? "destructive" : "primary"}
            loading={pending}
            onClick={handleConfirm}
          >
            {confirmLabel ?? (tone === "destructive" ? t("delete") : t("confirm"))}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialogPrimitive.Root>
  );
}
