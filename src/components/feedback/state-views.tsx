import { CircleAlert, Hourglass, Inbox, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { StateLayout, type StateViewProps } from "./state-layout";

/*
 * Shared state views. Default copy comes from the Feedback namespace and every
 * string can be overridden. These are server-compatible; pass callbacks such
 * as onRetry only from client components.
 */

/** Nothing to show yet ("Nothing left for today"). Polite role="status" unless live={false}. */
export function EmptyState({ title, description, icon = Inbox, ...props }: StateViewProps) {
  const t = useTranslations("Feedback.empty");
  return (
    <StateLayout
      role="status"
      tone="scope"
      title={title ?? t("title")}
      description={description === undefined ? t("description") : description}
      icon={icon}
      {...props}
    />
  );
}

export interface NoResultsStateProps extends StateViewProps {
  /** The search text, shown in the default title. */
  query?: string;
}

/** A search or filter matched nothing. Polite role="status" unless live={false}. */
export function NoResultsState({ title, description, query, icon = SearchX, ...props }: NoResultsStateProps) {
  const t = useTranslations("Feedback.noResults");
  return (
    <StateLayout
      role="status"
      tone="neutral"
      title={title ?? (query ? t("titleWithQuery", { query }) : t("title"))}
      description={description === undefined ? t("description") : description}
      icon={icon}
      {...props}
    />
  );
}

/** A section that arrives in a later step. Polite role="status" unless live={false}. */
export function UnavailableState({ title, description, icon = Hourglass, ...props }: StateViewProps) {
  const t = useTranslations("Feedback.unavailable");
  return (
    <StateLayout
      role="status"
      tone="neutral"
      title={title ?? t("title")}
      description={description === undefined ? t("description") : description}
      icon={icon}
      {...props}
    />
  );
}

export interface ErrorStateProps extends StateViewProps {
  /** Renders a Retry button (Common.retry) as the primary action. */
  onRetry?: () => void;
  retryLabel?: ReactNode;
}

/**
 * Something failed to load ("Couldn't load the board · Retry"). role="alert" unless live={false}.
 * Defaults to the compact tinted strip from the Utility board.
 */
export function ErrorState({
  title,
  description,
  icon = CircleAlert,
  onRetry,
  retryLabel,
  primaryAction,
  size = "compact",
  variant = "tinted",
  ...props
}: ErrorStateProps) {
  const t = useTranslations("Feedback.error");
  const tCommon = useTranslations("Common");
  const retry =
    primaryAction ??
    (onRetry ? (
      <Button
        variant="secondary"
        size="sm"
        onClick={onRetry}
        className={cn(variant === "tinted" && "bg-surface text-danger-text hover:bg-subtle active:bg-raised")}
      >
        {retryLabel ?? tCommon("retry")}
      </Button>
    ) : null);

  return (
    <StateLayout
      role="alert"
      tone="danger"
      title={title ?? t("title")}
      description={description === undefined ? t("description") : description}
      icon={icon}
      primaryAction={retry}
      size={size}
      variant={variant}
      {...props}
    />
  );
}

export interface LoadingStateProps {
  /** Announced text; defaults to Common.loading. */
  label?: string;
  /** Skeleton anatomy mirroring the real content; defaults to a card outline. */
  children?: ReactNode;
  /**
   * Announce through a polite live region (default true). Pass false when
   * the caller owns the announcement; the label stays as hidden text.
   */
  live?: boolean;
  className?: string;
}

/** Skeleton placeholder with a polite "Loading…" announcement. */
export function LoadingState({ label, children, live = true, className }: LoadingStateProps) {
  const t = useTranslations("Common");
  return (
    <div
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className={cn("w-full", className)}
    >
      <span className="sr-only">{label ?? t("loading")}</span>
      {children ?? (
        <div className="flex w-full flex-col gap-2.5 rounded-tile bg-subtle p-4">
          <div className="flex gap-2">
            <Skeleton shape="pill" className="w-16" />
            <Skeleton shape="pill" className="w-22" />
          </div>
          <Skeleton shape="line" className="w-[70%]" />
          <Skeleton className="w-[92%]" />
          <Skeleton className="w-[60%]" />
        </div>
      )}
    </div>
  );
}
