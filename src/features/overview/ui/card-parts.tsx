"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/feedback/state-views";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

/*
 * Pieces every Overview card shares: the header (title, muted count, the
 * link to its destination), a loading frame and an inline error with Retry.
 */

export function CardHead({
  id,
  title,
  count,
  href,
  linkLabel,
  className,
}: {
  /** Id of the title, for the card's aria-labelledby. */
  id: string;
  title: ReactNode;
  count?: ReactNode;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <h2 id={id} className="type-title">
        {title}
      </h2>
      {count ? <span className="text-xs font-semibold text-fg-muted">{count}</span> : null}
      {href && linkLabel ? (
        <Link
          href={href}
          className="ms-auto inline-flex min-h-touch items-center text-xs font-semibold text-fg underline underline-offset-4 hover:text-scope-deep"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function CardLoading({ rows = 3 }: { rows?: number }) {
  const t = useTranslations("Overview");
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 pt-2">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} shape="row" className="h-9 w-full" />
      ))}
    </div>
  );
}

export function CardError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("Overview");
  return <ErrorState title={t("error")} description={null} size="compact" onRetry={onRetry} className="mt-2" />;
}
