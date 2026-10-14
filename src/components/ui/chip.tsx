"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Check, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Toggle } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export type ChipScope = "personal" | "project" | "team" | "company";

// Full class strings (never built at runtime) so Tailwind can see them.
const SCOPE_CLASSES: Record<ChipScope, { chip: string; on: string; dot: string }> = {
  personal: {
    chip: "bg-personal-soft text-personal-deep",
    on: "data-[state=on]:bg-personal-soft data-[state=on]:text-personal-deep",
    dot: "bg-personal-dot",
  },
  project: {
    chip: "bg-project-soft text-project-deep",
    on: "data-[state=on]:bg-project-soft data-[state=on]:text-project-deep",
    dot: "bg-project-dot",
  },
  team: {
    chip: "bg-team-soft text-team-deep",
    on: "data-[state=on]:bg-team-soft data-[state=on]:text-team-deep",
    dot: "bg-team-dot",
  },
  company: {
    chip: "bg-company-soft text-company-deep",
    on: "data-[state=on]:bg-company-soft data-[state=on]:text-company-deep",
    dot: "bg-company-dot",
  },
};

const chipVariants = cva(
  "inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill font-semibold",
  {
    variants: {
      size: {
        sm: "min-h-7 px-3 text-xs",
        md: "min-h-9 px-3 text-[0.8125rem]",
        lg: "min-h-10 px-4 text-sm",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type ChipSize = VariantProps<typeof chipVariants>["size"];

function ChipDot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", className)} />;
}

export interface ChipProps extends ComponentProps<"span"> {
  /** Tints the chip with a fixed scope colour and adds its dot. */
  scope?: ChipScope;
  icon?: LucideIcon;
  size?: ChipSize;
}

/** Static label chip (scope chips per Main). The text carries the meaning, the tint supports it. */
export function Chip({ scope, icon, size, className, children, ...props }: ChipProps) {
  const tone = scope ? SCOPE_CLASSES[scope] : null;
  return (
    <span
      {...props}
      className={cn(chipVariants({ size }), tone ? tone.chip : "bg-raised text-fg-secondary", className)}
    >
      {tone ? <ChipDot className={tone.dot} /> : null}
      {icon ? <Icon icon={icon} size={14} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export interface ToggleChipProps
  extends Omit<ComponentProps<typeof Toggle.Root>, "asChild" | "pressed" | "defaultPressed" | "onPressedChange"> {
  selected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  scope?: ChipScope;
  icon?: LucideIcon;
  size?: ChipSize;
}

/**
 * Selectable chip (aria-pressed), e.g. multi-select labels, duration chips.
 * Selected = scope tint + a check, so the state is never colour alone.
 */
export function ToggleChip({
  selected,
  defaultSelected,
  onSelectedChange,
  scope,
  icon,
  size,
  className,
  children,
  ...props
}: ToggleChipProps) {
  const tone = scope ? SCOPE_CLASSES[scope] : null;
  return (
    <Toggle.Root
      {...props}
      pressed={selected}
      defaultPressed={defaultSelected}
      onPressedChange={onSelectedChange}
      className={cn(
        chipVariants({ size }),
        "group transition-colors bg-raised text-fg-secondary hover:bg-secondary-hover hover:text-fg",
        tone ? tone.on : "data-[state=on]:bg-scope-soft data-[state=on]:text-scope-deep",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
    >
      {tone ? <ChipDot className={tone.dot} /> : null}
      {icon ? <Icon icon={icon} size={14} /> : null}
      <span className="truncate">{children}</span>
      <Icon icon={Check} size={14} className="hidden stroke-[2.5] group-data-[state=on]:block" />
    </Toggle.Root>
  );
}

export interface RemovableChipProps extends Omit<ComponentProps<"span">, "children"> {
  /** Text label; also builds the remove button's name ("Remove UI"). */
  label: string;
  onRemove: () => void;
  scope?: ChipScope;
  icon?: LucideIcon;
  size?: ChipSize;
  disabled?: boolean;
  /** Optional richer content in place of the plain label text. */
  children?: ReactNode;
}

/** A chosen value with a remove button, e.g. selected labels in a multi-select. */
export function RemovableChip({
  label,
  onRemove,
  scope,
  icon,
  size,
  disabled,
  className,
  children,
  ...props
}: RemovableChipProps) {
  const t = useTranslations("UI");
  const tone = scope ? SCOPE_CLASSES[scope] : null;
  return (
    <span
      {...props}
      className={cn(
        chipVariants({ size }),
        "pe-1",
        tone ? tone.chip : "bg-scope-soft text-scope-deep",
        disabled && "opacity-45",
        className,
      )}
    >
      {tone ? <ChipDot className={tone.dot} /> : null}
      {icon ? <Icon icon={icon} size={14} /> : null}
      <span className="truncate">{children ?? label}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t("remove", { label })}
        className={cn(
          "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full",
          "transition-colors hover:bg-fg/10 disabled:pointer-events-none",
          "before:absolute before:-inset-1.5 before:content-['']",
        )}
      >
        <Icon icon={X} size={14} className="stroke-[2.5]" />
      </button>
    </span>
  );
}
