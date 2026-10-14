"use client";

import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps, FocusEventHandler, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";
import { Icon } from "./icon";
import { controlSurfaceClasses } from "./input";

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  /** Works directly as react-hook-form Controller's field.onChange. */
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Form name: Radix renders a hidden native <select> for form posts. */
  name?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  /** Shown while nothing is selected. Defaults to "Select…". */
  placeholder?: ReactNode;
  id?: string;
  /** Use when there is no FieldLabel (e.g. a toolbar filter). */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** Lands on the trigger button (RHF field.ref focuses it on error). */
  ref?: Ref<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  /** Trigger classes. */
  className?: string;
  contentClassName?: string;
  /** <SelectItem> elements (optionally <SelectSeparator>). */
  children: ReactNode;
}

/**
 * Single select (Radix): trigger styled like an Input with a chevron, an
 * elevated rounded listbox, a check on the selected option. Typeahead,
 * arrow keys and RTL come from Radix.
 */
export function Select({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  name,
  disabled,
  required,
  invalid,
  placeholder,
  id,
  ref,
  onBlur,
  className,
  contentClassName,
  children,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: SelectProps) {
  const t = useTranslations("UI");
  const control = useFieldControl({
    id,
    disabled,
    required,
    invalid,
    "aria-describedby": ariaDescribedBy,
  });

  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      name={name}
      disabled={control.disabled}
      required={required}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={control.id}
        onBlur={onBlur}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        aria-required={control["aria-required"]}
        data-invalid={control.invalid || undefined}
        data-disabled={control.disabled || undefined}
        className={cn(
          controlSurfaceClasses,
          "group flex min-h-touch w-full items-center justify-between gap-2 ps-4 pe-3.5 text-start",
          "data-placeholder:text-fg-muted not-data-invalid:data-[state=open]:border-primary",
          "not-data-invalid:focus-visible:border-primary",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <SelectPrimitive.Value placeholder={placeholder ?? t("selectPlaceholder")} />
        </span>
        <SelectPrimitive.Icon className="flex shrink-0 text-icon-muted transition-transform group-data-[state=open]:rotate-180">
          <Icon icon={ChevronDown} size={18} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={16}
          className={cn(
            "z-(--z-overlay) max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width)",
            "overflow-hidden rounded-row border border-hairline bg-elevated p-1.5 text-fg shadow-elevated",
            "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport className="flex flex-col gap-0.5">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export interface SelectItemProps extends Omit<ComponentProps<typeof SelectPrimitive.Item>, "asChild"> {
  /** Colour marker before the label, as a token class: "bg-danger", "bg-project-dot". */
  dotClassName?: string;
  icon?: LucideIcon;
}

export function SelectItem({ dotClassName, icon, className, children, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      {...props}
      className={cn(
        "relative flex min-h-11 cursor-default select-none items-center gap-2.5 rounded-row px-3 text-body text-fg",
        "data-highlighted:bg-subtle",
        "data-[state=checked]:bg-scope-soft data-[state=checked]:font-bold",
        "data-disabled:pointer-events-none data-disabled:opacity-45",
        className,
      )}
    >
      {/* ItemText is mirrored into the trigger, so the dot/icon show there too. */}
      <SelectPrimitive.ItemText>
        <span className="inline-flex items-center gap-2">
          {dotClassName ? (
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dotClassName)} />
          ) : null}
          {icon ? <Icon icon={icon} size={16} className="text-icon-muted" /> : null}
          {children}
        </span>
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ms-auto inline-flex text-scope-deep">
        <Icon icon={Check} size={16} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({ className }: { className?: string }) {
  return <SelectPrimitive.Separator className={cn("my-1 h-px bg-line", className)} />;
}
