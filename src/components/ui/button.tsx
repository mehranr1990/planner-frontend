import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Spinner } from "./spinner";

/*
 * Capsule button. Primary takes the active scope's deep colour (via
 * --primary), so one component serves Personal, Projects, Teams and Companies.
 * State matrix (Utility board): default, hover, pressed, focus (global ring),
 * disabled, loading. Server-compatible: no client hooks, no wrapped handlers.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill",
    "text-body font-semibold transition-[background-color,color,border-color,opacity,scale]",
    "active:scale-[0.97] aria-busy:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-45",
    "aria-disabled:pointer-events-none aria-disabled:not-aria-busy:opacity-45",
    "aria-busy:cursor-progress",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-accent hover:bg-primary-hover active:bg-primary-pressed",
        secondary: "bg-secondary text-fg hover:bg-secondary-hover active:bg-secondary-pressed",
        outline: "border-[1.5px] border-outline bg-transparent text-fg hover:bg-subtle active:bg-raised",
        destructive: "bg-destructive text-on-destructive hover:bg-destructive-hover",
        ghost: "bg-transparent text-fg-secondary hover:bg-raised hover:text-fg",
      },
      size: {
        /** Compact 40px: in-card actions such as "Set date" and "Retry". */
        sm: "min-h-10 px-4 text-sm",
        md: "min-h-touch px-5",
        lg: "min-h-13 px-6",
        /** Kept for compatibility; prefer <IconButton>. */
        icon: "size-touch",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Style a child element (e.g. a Next.js <Link>) as a button. Ignores `loading`. */
    asChild?: boolean;
    /**
     * Busy state: shows a spinner, sets aria-busy + aria-disabled, ignores
     * clicks and keeps focus and width (the label stays laid out underneath).
     */
    loading?: boolean;
    /** Replaces the label while loading, e.g. "Saving". The width never shrinks. */
    loadingText?: ReactNode;
  };

function LoadingContent({ children, loadingText }: { children: ReactNode; loadingText?: ReactNode }) {
  // Both layers share one grid cell, so the button keeps the wider of the two.
  return (
    <span className="inline-grid place-items-center">
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center gap-2",
          // With loadingText the old label must leave the accessibility tree;
          // without it, it stays the accessible name (opacity keeps it there).
          loadingText ? "invisible" : "opacity-0",
        )}
        aria-hidden={loadingText ? true : undefined}
      >
        {children}
      </span>
      <span className="col-start-1 row-start-1 inline-flex items-center gap-2">
        <Spinner size={loadingText ? "sm" : "md"} />
        {loadingText}
      </span>
    </span>
  );
}

export function Button({
  asChild,
  variant,
  size,
  className,
  type,
  loading = false,
  loadingText,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} onClick={onClick} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      // While loading, never submit and drop the handler: no double actions.
      {...props}
      type={loading ? "button" : (type ?? "button")}
      className={classes}
      onClick={loading ? undefined : onClick}
      aria-busy={loading || undefined}
      aria-disabled={loading || props["aria-disabled"] || undefined}
      data-loading={loading || undefined}
    >
      {loading ? <LoadingContent loadingText={loadingText}>{children}</LoadingContent> : children}
    </button>
  );
}

const iconButtonSizes = {
  sm: "size-10",
  md: "size-touch",
  lg: "size-13",
} as const;

const iconGlyphSizes = { sm: 18, md: 20, lg: 22 } as const;

export type IconButtonProps = Omit<ButtonProps, "size" | "asChild" | "loadingText"> & {
    /**
     * Accessible name (required: pass this or aria-label). Kept as one plain
     * object type, not a union, so wrappers can Omit<> from it safely.
     */
    label?: string;
    /** Lucide glyph; or pass custom children (e.g. an avatar) instead. */
    icon?: LucideIcon;
    /** Flip under dir="rtl" (chevrons, arrows, send, undo). */
    mirror?: boolean;
    /** 40 / 48 / 52 px. */
    size?: keyof typeof iconButtonSizes;
    variant?: ButtonVariant;
  };

/** Round icon-only button; it must have an accessible name (label or aria-label). */
export function IconButton({
  icon,
  mirror,
  label,
  size = "md",
  variant = "secondary",
  className,
  children,
  ...props
}: IconButtonProps) {
  const name = label ?? props["aria-label"];
  if (process.env.NODE_ENV !== "production" && !name && !props["aria-labelledby"]) {
    console.error("IconButton needs an accessible name: pass label or aria-label.");
  }
  return (
    <Button
      {...props}
      variant={variant}
      aria-label={name}
      className={cn(iconButtonSizes[size], "p-0", className)}
    >
      {icon ? <Icon icon={icon} mirror={mirror} size={iconGlyphSizes[size]} /> : children}
    </Button>
  );
}
