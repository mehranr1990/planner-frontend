"use client";

import type { ChangeEvent, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toLatinDigits, toLatinNumberInput } from "@/lib/locale/digits";
import { useFieldControl } from "./field";
import { Spinner } from "./spinner";

/**
 * Number fields accept Persian / Arabic digits. A native type="number" drops
 * them (Chrome leaves the value empty), so `type="number"` renders a text
 * field with a numeric keypad whose value is kept as Latin digits; other
 * numeric-keypad fields (amounts) get their digits converted in place.
 * Consumers keep reading event.target.value as before.
 */
export function latinDigitsOnChange(
  onChange: ((event: ChangeEvent<HTMLInputElement>) => void) | undefined,
  strict: boolean,
): (event: ChangeEvent<HTMLInputElement>) => void {
  return (event) => {
    const input = event.currentTarget;
    const next = strict ? toLatinNumberInput(input.value) : toLatinDigits(input.value);
    if (next !== input.value) {
      const caret = input.selectionStart;
      const removed = input.value.length - next.length;
      input.value = next;
      if (caret !== null) {
        const position = Math.max(0, caret - removed);
        input.setSelectionRange(position, position);
      }
    }
    onChange?.(event);
  };
}

/*
 * Text field surface per Utility: 48px, input radius, raised fill, 1.5px
 * outline border; focus = scope-deep border + the global ring; invalid =
 * danger border (+ a FieldError message); disabled = dashed and muted.
 *
 * The visible box is a wrapper so adornments sit inside it. The focus ring is
 * drawn on that wrapper (has-[input:focus-visible]) instead of on the inner
 * input, so it surrounds the adornments too; it is moved, never removed.
 */
export const controlSurfaceClasses = cn(
  "rounded-input border-[1.5px] border-outline bg-raised text-body text-fg",
  "transition-[border-color,background-color]",
  "data-invalid:border-danger",
  "data-disabled:cursor-not-allowed data-disabled:border-dashed data-disabled:bg-subtle data-disabled:text-fg-muted",
  "data-readonly:border-hairline data-readonly:bg-subtle",
);

export interface InputProps extends Omit<ComponentProps<"input">, "size"> {
  /** Danger border + aria-invalid. Defaults to the surrounding Field's state. */
  invalid?: boolean;
  /** Spinner at the inline end and aria-busy, e.g. while checking a value. */
  loading?: boolean;
  /** Inside the box at the inline start (an icon, a prefix). */
  startAdornment?: ReactNode;
  /** Inside the box at the inline end, e.g. a "Toman ▾" unit control. */
  endAdornment?: ReactNode;
  /** Applies to the visible box; use inputClassName for the <input> itself. */
  className?: string;
  inputClassName?: string;
}

export function Input({
  invalid,
  loading = false,
  startAdornment,
  endAdornment,
  className,
  inputClassName,
  type = "text",
  id,
  disabled,
  readOnly,
  required,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
  inputMode,
  onChange,
  ...props
}: InputProps) {
  const number = type === "number";
  const numericKeypad = number || inputMode === "numeric" || inputMode === "decimal";
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
    <div
      className={cn(
        controlSurfaceClasses,
        "flex min-h-touch w-full items-center",
        "has-[input:focus-visible]:focus-ring not-data-invalid:has-[input:focus-visible]:border-primary",
        className,
      )}
      data-invalid={control.invalid || undefined}
      data-disabled={control.disabled || undefined}
      data-readonly={control.readOnly || undefined}
    >
      {startAdornment ? (
        <span className="flex shrink-0 items-center ps-4 text-icon-muted">{startAdornment}</span>
      ) : null}
      <input
        {...props}
        type={number ? "text" : type}
        inputMode={inputMode ?? (number ? "decimal" : undefined)}
        onChange={numericKeypad ? latinDigitsOnChange(onChange, number) : onChange}
        id={control.id}
        disabled={control.disabled}
        readOnly={control.readOnly}
        required={required}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        aria-required={control["aria-required"]}
        aria-busy={loading || undefined}
        className={cn(
          "min-w-0 flex-1 self-stretch bg-transparent px-4 text-inherit",
          "placeholder:text-fg-muted disabled:cursor-not-allowed",
          // The wrapper shows the focus ring (see above).
          "outline-none focus-visible:outline-none focus-visible:shadow-none",
          startAdornment && "ps-2.5",
          (endAdornment || loading) && "pe-2",
          inputClassName,
        )}
      />
      {loading ? (
        <span className="flex shrink-0 items-center pe-4 text-fg-muted">
          <Spinner size="sm" />
        </span>
      ) : null}
      {endAdornment ? <span className="flex shrink-0 items-center pe-1.5">{endAdornment}</span> : null}
    </div>
  );
}
