import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/*
 * The base sculpted surface. Cards sit on the canvas; tone picks the step in
 * the surface ladder (canvas → surface → raised → subtle), elevation adds the
 * island or overlay shadow (the island shadow is `none` in dark).
 */
const surfaceVariants = cva("text-fg", {
  variants: {
    tone: {
      surface: "bg-surface",
      raised: "bg-raised",
      subtle: "bg-subtle",
      elevated: "bg-elevated",
      canvas: "bg-canvas",
    },
    radius: {
      card: "rounded-card",
      "card-sm": "rounded-card-sm",
      tile: "rounded-tile",
      row: "rounded-row",
      pill: "rounded-pill",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-card",
      lg: "p-card lg:p-card-lg",
    },
    elevation: {
      flat: "",
      island: "shadow-island",
      overlay: "shadow-elevated",
    },
  },
  defaultVariants: { tone: "surface", radius: "card", padding: "md", elevation: "flat" },
});

export type SurfaceProps = ComponentPropsWithoutRef<"div"> &
  VariantProps<typeof surfaceVariants> & {
    /** Render the child element (e.g. <section>) with surface styling. */
    asChild?: boolean;
  };

export function Surface({ asChild, tone, radius, padding, elevation, className, ...props }: SurfaceProps) {
  const Component = asChild ? Slot.Root : "div";
  return (
    <Component
      className={cn(surfaceVariants({ tone, radius, padding, elevation }), className)}
      {...props}
    />
  );
}
