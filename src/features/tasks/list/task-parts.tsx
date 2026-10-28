"use client";

import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import type { Task } from "@/data/domain";
import { cn } from "@/lib/cn";

/*
 * Small pieces of a task row: the 22px check (circle to complete, square
 * while selecting), the area/scope dot and the keyboard chip.
 */

export interface TaskCheckProps extends Omit<ComponentProps<"button">, "children"> {
  /** "done" fills the circle; "selected" / "unselected" draw the selection square. */
  look: "open" | "done" | "selected" | "unselected";
}

export function TaskCheck({ look, className, ...props }: TaskCheckProps) {
  const square = look === "selected" || look === "unselected";
  const filled = look === "done" || look === "selected";
  return (
    <button
      type="button"
      data-slot="task-check"
      data-look={look}
      className={cn(
        "relative inline-flex size-[22px] shrink-0 items-center justify-center transition-[border-radius,background-color] duration-180 motion-reduce:transition-none",
        // A 44px hit area around the 22px glyph.
        "before:absolute before:-inset-[11px] before:content-['']",
        "focus-visible:focus-ring",
        square ? "rounded-[7px]" : "rounded-full",
        filled ? "bg-primary text-on-accent" : "border-[1.8px] border-icon-muted text-transparent hover:border-fg-muted",
        className,
      )}
      {...props}
    >
      <Check aria-hidden="true" size={13} strokeWidth={2.8} className={filled ? "" : "opacity-0"} />
    </button>
  );
}

const AREA_DOT: Record<string, string> = {
  home: "bg-(--viz-coral)",
  personal: "bg-personal-dot",
  learning: "bg-(--viz-blue)",
  finance: "bg-(--viz-amber)",
  health: "bg-(--viz-green)",
  social: "bg-(--viz-pink)",
};

const SCOPE_DOT: Record<Task["scope"], string> = {
  personal: "bg-personal-dot",
  project: "bg-project-dot",
  team: "bg-team-dot",
  company: "bg-company-dot",
};

/** Area colour, else the context's dot. */
export function taskDotClass(task: Pick<Task, "area" | "scope">): string {
  return (task.area && AREA_DOT[task.area.id]) ?? SCOPE_DOT[task.scope];
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn("inline-flex min-h-5 items-center rounded-lg bg-surface px-[7px] font-sans text-[11px] font-bold text-fg-secondary", className)}
      {...props}
    />
  );
}
