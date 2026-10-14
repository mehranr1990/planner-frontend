import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/*
 * Inline alert ("Over capacity", "Couldn't save expense · Retry now").
 * Only danger (or `urgent`) alerts use role="alert", which interrupts screen
 * readers; the rest are polite role="status" messages.
 */

export type InlineAlertTone = "warning" | "danger" | "info" | "success";

const toneStyles: Record<InlineAlertTone, { surface: string; accent: string; icon: LucideIcon }> = {
  warning: { surface: "bg-warning-soft", accent: "text-warning-text", icon: TriangleAlert },
  danger: { surface: "bg-danger-soft", accent: "text-danger-text", icon: CircleAlert },
  info: { surface: "bg-info-soft", accent: "text-info-text", icon: Info },
  success: { surface: "bg-success-soft", accent: "text-success-text", icon: CircleCheck },
};

export interface InlineAlertProps {
  tone: InlineAlertTone;
  title: ReactNode;
  description?: ReactNode;
  /** Usually an <InlineAlertAction>. */
  action?: ReactNode;
  /** Override the tone's icon. */
  icon?: LucideIcon;
  /** Announce assertively even when the tone is not danger. */
  urgent?: boolean;
  className?: string;
}

export function InlineAlert({ tone, title, description, action, icon, urgent = false, className }: InlineAlertProps) {
  const style = toneStyles[tone];
  return (
    <div
      role={tone === "danger" || urgent ? "alert" : "status"}
      data-tone={tone}
      className={cn("flex gap-3 rounded-row p-3.5", style.surface, className)}
    >
      <Icon icon={icon ?? style.icon} size={18} className={cn("mt-0.5 shrink-0", style.accent)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("text-sm font-bold", style.accent)}>{title}</p>
        {description != null ? <p className="text-[13px] text-fg">{description}</p> : null}
        {action != null ? <div className={cn("mt-1.5 flex flex-wrap gap-2", style.accent)}>{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Small capsule action on a tinted alert ("Retry now"). Inherits the alert's
 * tone colour; 36px visual height with a 48px hit area.
 */
export function InlineAlertAction({ className, type, ...props }: ComponentProps<"button">) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "relative inline-flex h-9 items-center rounded-pill bg-surface px-3.5 text-xs font-bold",
        // Text colour is inherited from the alert's tone (preflight: color: inherit).
        "transition-colors hover:bg-subtle after:absolute after:-inset-1.5",
        "disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}
