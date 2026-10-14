import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/*
 * Placeholder block that mirrors a real layout's anatomy. Decorative: the
 * surrounding LoadingState (or caller) announces the loading state. The
 * shimmer is a moving gradient between two neutral tokens; reduced motion
 * stops it.
 */
const skeletonVariants = cva(
  [
    "block shrink-0 bg-raised bg-linear-to-r from-raised via-hairline to-raised bg-size-[200%_100%]",
    "animate-shimmer motion-reduce:animate-none",
  ],
  {
    variants: {
      shape: {
        text: "h-2.5 rounded-pill",
        line: "h-4.5 rounded-row",
        pill: "h-5.5 rounded-pill",
        circle: "aspect-square rounded-pill",
        row: "h-12 rounded-row",
        tile: "rounded-tile",
        card: "rounded-card",
      },
    },
    defaultVariants: { shape: "text" },
  },
);

export type SkeletonProps = Omit<ComponentProps<"span">, "children"> & VariantProps<typeof skeletonVariants>;

export function Skeleton({ shape, className, ...props }: SkeletonProps) {
  return <span aria-hidden data-slot="skeleton" className={cn(skeletonVariants({ shape }), className)} {...props} />;
}
