"use client";

import {
  CircleAlert,
  Clock,
  FolderKanban,
  GitCompareArrows,
  Gauge,
  LockKeyhole,
  LogIn,
  MailOpen,
  SearchX,
  ShieldOff,
  Trash2,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { StateLayout, type StateTone } from "./state-layout";

/*
 * SH-02 access & page state templates (design/shared SHARED.md). Full-page
 * states: loading, empty, filtered, error, unauthenticated, not available
 * (forbidden = not found, same copy: no discovery), invite pending, revoked,
 * deleted; plus the inline pending / conflict / quota cards. Copy keys are
 * Access.states.* (final EN/FA). Callers pass the actions (links/handlers),
 * so the template stays route-agnostic.
 */

export type AccessStateKind =
  | "empty"
  | "filtered"
  | "error"
  | "unauthenticated"
  | "not-available"
  | "invite-pending"
  | "revoked"
  | "deleted"
  | "pending"
  | "conflict"
  | "quota";

const KEY: Record<AccessStateKind, string> = {
  empty: "empty",
  filtered: "filtered",
  error: "error",
  unauthenticated: "unauthenticated",
  "not-available": "notAvailable",
  "invite-pending": "invite",
  revoked: "revoked",
  deleted: "deleted",
  pending: "pending",
  conflict: "conflict",
  quota: "quota",
};

const LOOK: Record<AccessStateKind, { icon: LucideIcon; tone: StateTone }> = {
  empty: { icon: FolderKanban, tone: "scope" },
  filtered: { icon: SearchX, tone: "neutral" },
  error: { icon: CircleAlert, tone: "danger" },
  unauthenticated: { icon: LogIn, tone: "neutral" },
  "not-available": { icon: LockKeyhole, tone: "neutral" },
  "invite-pending": { icon: MailOpen, tone: "scope" },
  revoked: { icon: ShieldOff, tone: "warning" },
  deleted: { icon: Trash2, tone: "neutral" },
  pending: { icon: Clock, tone: "info" },
  conflict: { icon: GitCompareArrows, tone: "warning" },
  quota: { icon: Gauge, tone: "neutral" },
};

export interface AccessStateProps {
  kind: AccessStateKind;
  /** ICU values for the copy (project, inviter, role, person, task, status). */
  values?: Record<string, string | number>;
  /** Error reference shown under the description ("Ref: 7F3A-21"). */
  errorRef?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  /** Heading level of the title; full-page states are the page heading. */
  titleAs?: "h1" | "h2" | "h3" | "p";
  className?: string;
}

export function AccessState({
  kind,
  values = {},
  errorRef,
  primaryAction,
  secondaryAction,
  titleAs = "h1",
  className,
}: AccessStateProps) {
  const t = useTranslations("Access.states");
  const key = KEY[kind];
  const look = LOOK[kind];
  const description = (
    <>
      {t(`${key}.description` as never, values as never)}
      {errorRef ? <span className="mt-1 block text-xs text-fg-muted">{t("error.ref", { ref: errorRef })}</span> : null}
    </>
  );
  const inline = kind === "pending" || kind === "conflict" || kind === "quota";
  return (
    <StateLayout
      role={kind === "error" ? "alert" : "status"}
      tone={look.tone}
      icon={look.icon}
      title={t(`${key}.title` as never, values as never)}
      description={description}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      titleAs={titleAs}
      size={inline ? "compact" : "default"}
      variant={inline ? "tinted" : "card"}
      className={cn(!inline && "mx-auto w-full max-w-xl py-12", className)}
    />
  );
}

const STILL_LOADING_MS = 8000;

/**
 * Loading (SH-02): a skeleton that matches the final layout, no spinner over
 * the page. After 8 s: "Still loading…" + Retry.
 */
export function AccessLoading({
  children,
  onRetry,
  className,
}: {
  /** Skeleton anatomy of the final layout; defaults to a header + two cards. */
  children?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations("Access.states.loading");
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), STILL_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div role="status" aria-busy="true" aria-label={t("title")} className={cn("flex flex-col gap-4", className)}>
      {children ?? (
        <>
          <Skeleton className="h-9 w-64 rounded-pill" />
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Skeleton className="h-56 rounded-card" />
            <Skeleton className="h-56 rounded-card" />
          </div>
          <Skeleton className="h-40 rounded-card" />
        </>
      )}
      {slow ? (
        <div className="flex items-center gap-3 text-sm font-semibold text-fg-secondary">
          <span>{t("still")}</span>
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The offline icon, re-exported for the banner. */
export const OFFLINE_ICON = WifiOff;
