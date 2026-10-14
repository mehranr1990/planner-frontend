import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/*
 * Utility card (P00 "Card geometry · C"): filters, form groups, settings
 * groups, empty-state boxes. Quiet and compact: 20px radius, 18px padding,
 * the subtle surface (#F8F8F6 / dark #222622) or white, no shadow, no
 * decoration, never a notch. Server component.
 *
 * The card publishes the colour its fields take (--utility-field): white
 * fields on the subtle card (board `.field` on #F8F8F6), subtle fields on a
 * white card, so a UtilityField always reads as one step off its container.
 */
const utilityCardVariants = cva("flex min-w-0 flex-col gap-2 rounded-utility text-fg", {
  variants: {
    tone: {
      subtle: "bg-subtle [--utility-field:var(--surface)]",
      surface: "bg-surface [--utility-field:var(--surface-subtle)]",
    },
    padding: {
      /** 18px, the P00 board's utility card. */
      default: "p-4.5",
      none: "",
    },
  },
  defaultVariants: { tone: "subtle", padding: "default" },
});

type RootElement = "div" | "section" | "aside" | "form" | "fieldset" | "li";

export type UtilityCardProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof utilityCardVariants> & {
    /** Semantic element for the root (e.g. a form group or a settings section). */
    as?: RootElement;
  };

export function UtilityCard({ as: Root = "div", tone, padding, className, ...props }: UtilityCardProps) {
  return (
    <Root
      data-slot="utility-card"
      className={cn(utilityCardVariants({ tone, padding }), className)}
      {...props}
    />
  );
}

type FieldElement = "div" | "li" | "label";

export type UtilityFieldProps = HTMLAttributes<HTMLElement> & {
  /** Semantic element: a label for a control row, li inside a list. */
  as?: FieldElement;
};

/**
 * One 48px row inside a utility card (board `.field`): 16px radius, 14px
 * inline padding, 14px semibold text, one surface step off the card.
 */
export function UtilityField({ as: Root = "div", className, ...props }: UtilityFieldProps) {
  return (
    <Root
      data-slot="utility-field"
      className={cn(
        "flex min-h-12 min-w-0 items-center gap-2.5 rounded-field bg-[color:var(--utility-field,var(--surface))] px-3.5",
        "text-sm font-semibold text-fg",
        className,
      )}
      {...props}
    />
  );
}
