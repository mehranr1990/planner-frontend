import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/**
 * A capsule-shaped surface floating above the canvas: top-bar islands, the
 * rail, control groups. Content decides the size; padding keeps 4px between
 * the capsule edge and the 48px controls inside.
 */
export function FloatingIsland({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("rounded-pill bg-surface p-1 text-fg shadow-island", className)}
      {...props}
    />
  );
}
