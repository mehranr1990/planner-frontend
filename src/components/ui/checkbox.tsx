"use client";

import { Check, Lock, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";
import { Icon } from "./icon";

export type CheckedState = boolean | "indeterminate";

export interface CheckboxProps
  extends Omit<ComponentProps<typeof CheckboxPrimitive.Root>, "asChild" | "children"> {
  /** Visible label; the whole row becomes the target. Omit inside a Field or with aria-label. */
  label?: ReactNode;
  description?: ReactNode;
  invalid?: boolean;
  /**
   * "Locked by policy": disabled with a lock glyph, so the reason is not
   * conveyed by the greyed colour alone. Explain why in label/description.
   */
  locked?: boolean;
  /** Classes for the row wrapper (when a label is given). */
  wrapperClassName?: string;
}

/**
 * Checkbox (Radix): checked, unchecked, indeterminate, disabled, locked.
 * Controlled via checked/onCheckedChange (RHF Controller) or uncontrolled via
 * defaultChecked; `name`/`value` post with forms through Radix's hidden input.
 */
export function Checkbox({
  label,
  description,
  invalid,
  locked = false,
  disabled,
  id,
  className,
  wrapperClassName,
  required,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: CheckboxProps) {
  const autoId = useId();
  const descriptionId = `${autoId}-description`;
  const control = useFieldControl({
    id,
    disabled: disabled || locked || undefined,
    required,
    invalid,
    "aria-invalid": ariaInvalid,
    "aria-describedby": [ariaDescribedBy, description ? descriptionId : undefined].filter(Boolean).join(" ") || undefined,
  });
  const controlId = control.id ?? (label ? autoId : undefined);

  const box = (
    <CheckboxPrimitive.Root
      {...props}
      id={controlId}
      disabled={control.disabled}
      required={required}
      aria-describedby={control["aria-describedby"]}
      aria-invalid={control["aria-invalid"]}
      aria-required={control["aria-required"]}
      data-invalid={control.invalid || undefined}
      className={cn(
        "group peer relative inline-flex size-5 shrink-0 items-center justify-center rounded-[0.375rem]",
        "border-[1.5px] border-outline bg-surface text-on-accent transition-colors",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
        "data-invalid:border-danger",
        "disabled:cursor-not-allowed disabled:opacity-45",
        // 44px hit area around the 20px box when it stands alone.
        "before:absolute before:-inset-3 before:content-['']",
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="inline-flex">
        <Icon icon={Check} size={14} className="hidden stroke-3 group-data-[state=checked]:block" />
        <Icon icon={Minus} size={14} className="hidden stroke-3 group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return box;

  return (
    <div className={cn("flex min-h-touch items-center gap-3 py-1.5", wrapperClassName)}>
      {box}
      <div className="flex min-w-0 flex-col">
        <label
          htmlFor={controlId}
          className={cn(
            "inline-flex items-center gap-1.5 text-body text-fg",
            control.disabled ? "cursor-not-allowed text-fg-muted" : "cursor-pointer",
          )}
        >
          {label}
          {locked ? <Icon icon={Lock} size={14} className="text-icon-muted" /> : null}
        </label>
        {description ? (
          <span id={descriptionId} className="text-xs text-fg-muted">
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}
