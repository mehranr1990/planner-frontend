"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";

export interface SwitchProps extends Omit<ComponentProps<typeof SwitchPrimitive.Root>, "asChild" | "children"> {
  /** Visible label at the inline start; the switch sits at the inline end. */
  label?: ReactNode;
  description?: ReactNode;
  wrapperClassName?: string;
}

/**
 * On/off setting (Radix, role="switch" + aria-checked). The thumb position,
 * not only the colour, shows the state; it travels toward the inline end.
 * Controlled via checked/onCheckedChange or uncontrolled via defaultChecked.
 */
export function Switch({
  label,
  description,
  id,
  disabled,
  className,
  wrapperClassName,
  required,
  "aria-describedby": ariaDescribedBy,
  ...props
}: SwitchProps) {
  const autoId = useId();
  const descriptionId = `${autoId}-description`;
  const control = useFieldControl({
    id,
    disabled,
    required,
    "aria-describedby": [ariaDescribedBy, description ? descriptionId : undefined].filter(Boolean).join(" ") || undefined,
  });
  const controlId = control.id ?? (label ? autoId : undefined);

  const toggle = (
    <SwitchPrimitive.Root
      {...props}
      id={controlId}
      disabled={control.disabled}
      required={required}
      aria-describedby={control["aria-describedby"]}
      className={cn(
        "group relative inline-flex h-8 w-13 shrink-0 items-center rounded-pill bg-outline transition-colors",
        "data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-45",
        "before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-6 rounded-full bg-surface transition-transform",
          "translate-x-1 data-[state=checked]:translate-x-6 data-[state=checked]:bg-on-accent",
          "rtl:-translate-x-1 rtl:data-[state=checked]:-translate-x-6",
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return toggle;

  return (
    <div className={cn("flex min-h-touch items-center justify-between gap-4", wrapperClassName)}>
      <div className="flex min-w-0 flex-col">
        <label
          htmlFor={controlId}
          className={cn(
            "text-body font-medium",
            control.disabled ? "cursor-not-allowed text-fg-muted" : "cursor-pointer text-fg",
          )}
        >
          {label}
        </label>
        {description ? (
          <span id={descriptionId} className="text-xs text-fg-muted">
            {description}
          </span>
        ) : null}
      </div>
      {toggle}
    </div>
  );
}
