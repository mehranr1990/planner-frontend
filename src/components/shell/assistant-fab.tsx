import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/*
 * Floating "Assistant" capsule (Shell, S2MyDay): bottom inline-end, so it
 * sits bottom-left under dir="rtl". Desktop only: below lg the bottom nav's
 * "More" sheet exposes the assistant, so the two never collide. What it opens
 * is wired by the caller (onClick, or asChild with a link).
 */

export type AssistantFabProps = ComponentProps<"button"> & {
  /** Render the child (e.g. a Next.js <Link>) as the FAB; the icon is added inside it. */
  asChild?: boolean;
};

export function AssistantFab({ asChild, className, children, type, ...props }: AssistantFabProps) {
  const t = useTranslations("Shell");
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      type={asChild ? undefined : (type ?? "button")}
      className={cn(
        "fixed end-6 bottom-[calc(1.5rem+var(--safe-bottom))] z-(--z-shell) hidden lg:inline-flex",
        "h-15 items-center gap-3 rounded-pill bg-surface ps-2 pe-5 text-fg shadow-island",
        "text-body font-bold transition-[background-color,scale] hover:bg-subtle active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-pill bg-scope-deep text-on-accent">
        <Sparkles size={20} strokeWidth={1.75} />
      </span>
      <Slot.Slottable>{asChild ? children : (children ?? t("assistant"))}</Slot.Slottable>
    </Component>
  );
}
