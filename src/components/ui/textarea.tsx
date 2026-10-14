"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";
import { controlSurfaceClasses } from "./input";

export interface TextareaProps extends ComponentProps<"textarea"> {
  /** Danger border + aria-invalid. Defaults to the surrounding Field's state. */
  invalid?: boolean;
}

/** Multi-line text field: same surface and states as Input, resizable vertically. */
export function Textarea({
  invalid,
  className,
  id,
  disabled,
  readOnly,
  required,
  rows = 3,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  ...props
}: TextareaProps) {
  const control = useFieldControl({
    id,
    disabled,
    readOnly,
    invalid,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    "aria-required": ariaRequired ?? (required ? true : undefined),
  });

  return (
    <textarea
      {...props}
      rows={rows}
      id={control.id}
      disabled={control.disabled}
      readOnly={control.readOnly}
      required={required}
      aria-describedby={control["aria-describedby"]}
      aria-invalid={control["aria-invalid"]}
      aria-required={control["aria-required"]}
      data-invalid={control.invalid || undefined}
      data-disabled={control.disabled || undefined}
      data-readonly={control.readOnly || undefined}
      className={cn(
        controlSurfaceClasses,
        "block min-h-24 w-full resize-y px-4 py-3 placeholder:text-fg-muted",
        "not-data-invalid:focus-visible:border-primary disabled:resize-none",
        className,
      )}
    />
  );
}
