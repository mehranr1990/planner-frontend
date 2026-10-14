import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/*
 * Product card (P00 "Card geometry · B"): the standard surface for repeated
 * or moderately dense content (goal list, observations, journal entries).
 * Soft 28px rounded rectangle, 20px padding, optional scope tint, and never a
 * notch: the sculpted corner is reserved for SignatureCard. Server component.
 */
const productCardVariants = cva("flex min-w-0 flex-col gap-2 rounded-product text-fg", {
  variants: {
    tone: {
      surface: "bg-surface",
      "scope-soft": "bg-scope-soft",
    },
    padding: {
      /** 20px, the P00 board's .card. */
      default: "p-5",
      compact: "p-4",
      none: "",
    },
  },
  defaultVariants: { tone: "surface", padding: "default" },
});

type RootElement = "div" | "article" | "section" | "aside" | "li";

export type ProductCardProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof productCardVariants> & {
    /** Semantic element for the root. */
    as?: RootElement;
  };

export function ProductCard({ as: Root = "div", tone, padding, className, ...props }: ProductCardProps) {
  return (
    <Root
      data-slot="product-card"
      className={cn(productCardVariants({ tone, padding }), className)}
      {...props}
    />
  );
}
