import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/*
 * Internal layout shared by EmptyState, ErrorState, LoadingState,
 * NoResultsState and UnavailableState.
 * - size "default": centred stack (icon, title, description, actions).
 * - size "compact": one row (icon, text, actions at the inline end), for
 *   inline placements such as the "Couldn't load the board · Retry" strip.
 */

export type StateTone = "scope" | "neutral" | "danger" | "warning" | "info" | "success";
export type StateSize = "default" | "compact";
/** card: white card · dashed: dashed outline · tinted: tone-soft fill · bare: none. */
export type StateVariant = "card" | "dashed" | "tinted" | "bare";

const toneClassName: Record<StateTone, { badge: string; tint: string; title: string }> = {
  scope: { badge: "bg-scope-soft text-scope-deep", tint: "bg-scope-soft", title: "text-fg" },
  neutral: { badge: "bg-raised text-fg-secondary", tint: "bg-subtle", title: "text-fg" },
  danger: { badge: "bg-danger-soft text-danger-text", tint: "bg-danger-soft", title: "text-danger-text" },
  warning: { badge: "bg-warning-soft text-warning-text", tint: "bg-warning-soft", title: "text-warning-text" },
  info: { badge: "bg-info-soft text-info-text", tint: "bg-info-soft", title: "text-info-text" },
  success: { badge: "bg-success-soft text-success-text", tint: "bg-success-soft", title: "text-success-text" },
};

/** Props every state view accepts. */
export interface StateViewProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Replace the default glyph; pass null for none. */
  icon?: LucideIcon | null;
  /** Custom artwork instead of the icon badge. */
  illustration?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  size?: StateSize;
  variant?: StateVariant;
  /** Heading level for the title (defaults to a paragraph). */
  titleAs?: "h1" | "h2" | "h3" | "h4" | "p";
  /**
   * Announce the view as a live region (role="status", or role="alert" for
   * ErrorState). Default true. Pass false when the caller owns the
   * announcement (e.g. one shared live region), to avoid double reads.
   */
  live?: boolean;
  className?: string;
}

interface StateLayoutProps extends Omit<StateViewProps, "title"> {
  title: ReactNode;
  tone: StateTone;
  role?: "status" | "alert";
  /** Extra content under the description (e.g. skeleton anatomy). */
  children?: ReactNode;
}

export function StateLayout({
  title,
  description,
  icon,
  illustration,
  primaryAction,
  secondaryAction,
  size = "default",
  variant = "dashed",
  titleAs: Title = "p",
  tone,
  role,
  live = true,
  children,
  className,
}: StateLayoutProps) {
  const styles = toneClassName[tone];
  const compact = size === "compact";
  const hasActions = primaryAction != null || secondaryAction != null;
  const visual =
    illustration ??
    (icon ? (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-pill",
          compact ? "size-9" : "size-12",
          styles.badge,
        )}
      >
        <Icon icon={icon} size={compact ? 16 : 20} />
      </span>
    ) : null);

  return (
    <div
      role={live ? role : undefined}
      data-size={size}
      className={cn(
        "flex",
        compact ? "flex-wrap items-center gap-3 p-4" : "flex-col items-center gap-2 px-card py-card-lg text-center",
        variant === "card" && "rounded-card bg-surface",
        variant === "dashed" && "rounded-tile border-[1.5px] border-dashed border-outline",
        variant === "tinted" && cn("rounded-tile", styles.tint),
        variant === "bare" && (compact ? "px-0" : "px-0 py-card"),
        className,
      )}
    >
      {visual}
      <div className={cn("flex min-w-0 flex-col gap-1", compact ? "flex-1 basis-48 text-start" : "items-center")}>
        <Title className={cn("font-bold", compact ? "text-sm" : "text-body", variant === "tinted" ? styles.title : "text-fg")}>
          {title}
        </Title>
        {description != null ? (
          <p className={cn("text-fg-secondary", compact ? "text-[13px]" : "max-w-sm text-[13px]")}>{description}</p>
        ) : null}
      </div>
      {children}
      {hasActions ? (
        <div className={cn("flex flex-wrap items-center gap-2", compact ? "ms-auto" : "justify-center pt-2")}>
          {secondaryAction}
          {primaryAction}
        </div>
      ) : null}
    </div>
  );
}
