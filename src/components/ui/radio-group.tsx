"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";

export interface RadioGroupProps
  extends Omit<ComponentProps<typeof RadioGroupPrimitive.Root>, "asChild" | "dir"> {
  invalid?: boolean;
}

/**
 * Single choice from a short list (Radix): arrow keys move and select,
 * following the app direction. Inside a Field it is named by the FieldLabel.
 */
export function RadioGroup({
  invalid,
  disabled,
  required,
  id,
  className,
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: RadioGroupProps) {
  const control = useFieldControl({
    id,
    disabled,
    required,
    invalid,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
  });

  return (
    <RadioGroupPrimitive.Root
      {...props}
      id={control.id}
      disabled={control.disabled}
      required={required}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : control.labelId)}
      aria-describedby={control["aria-describedby"]}
      aria-invalid={control["aria-invalid"]}
      aria-required={control["aria-required"]}
      className={cn("flex flex-col gap-1", className)}
    />
  );
}

export interface RadioGroupItemProps
  extends Omit<ComponentProps<typeof RadioGroupPrimitive.Item>, "asChild" | "children"> {
  label: ReactNode;
  /** Secondary line, e.g. "Sat – Wed" under "Work week". */
  description?: ReactNode;
}

/** A labelled option row like the Repeat list: radio, label, caption. */
export function RadioGroupItem({ label, description, id, className, disabled, ...props }: RadioGroupItemProps) {
  const autoId = useId();
  const itemId = id ?? `${autoId}-radio`;
  const labelId = `${autoId}-label`;
  const descriptionId = description ? `${autoId}-description` : undefined;

  return (
    <div
      className={cn(
        "flex min-h-touch items-center gap-3 rounded-row px-3 py-1.5 transition-colors",
        "has-[[data-state=checked]]:bg-subtle",
        "has-[:disabled]:opacity-45",
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        {...props}
        id={itemId}
        disabled={disabled}
        // The whole row is a click target, but only the label text names it.
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className={cn(
          "relative size-5 shrink-0 rounded-full border-2 border-outline bg-surface transition-[border-color,border-width]",
          "data-[state=checked]:border-[6px] data-[state=checked]:border-primary",
          "disabled:cursor-not-allowed",
          "before:absolute before:-inset-3 before:content-['']",
        )}
      />
      <label
        htmlFor={itemId}
        className={cn("flex min-w-0 flex-col", disabled ? "cursor-not-allowed" : "cursor-pointer")}
      >
        <span id={labelId} className="text-body font-semibold text-fg">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="text-xs text-fg-muted">
            {description}
          </span>
        ) : null}
      </label>
    </div>
  );
}
