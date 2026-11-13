"use client";

import {
  Building2,
  CircleAlert,
  Coins,
  Clock,
  FolderKanban,
  GitCompareArrows,
  Link2,
  Gauge,
  LockKeyhole,
  LogIn,
  LogOut,
  MailOpen,
  SearchX,
  Shield,
  ShieldOff,
  Trash2,
  UsersRound,
  WifiOff,
  type LucideIcon,
  Ban,
  MessageSquareOff,
  RefreshCw,
  Hourglass,
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
  | "quota"
  // Team additions (TS-01): forbidden = not found, invitation (joining ≠ project access), removed / left, joined.
  | "team-not-available"
  | "team-invite"
  | "team-removed"
  | "team-joined"
  // Company additions (CS-01): forbidden = not found, invitation, left, and the inline sealed / policy / scope / attach / not-counted states.
  | "company-not-available"
  | "company-invite"
  | "company-left"
  | "company-sealed"
  | "company-policy"
  | "company-outside"
  | "company-attach-pending"
  | "company-not-counted"
  // Messages (MS-01): not available (live mode, no Phase 5 backend), removed, and the inline blocked / joined later / reconnecting / offline / policy states.
  | "msg-not-available"
  | "msg-removed"
  | "msg-not-found"
  | "msg-blocked"
  | "msg-joined"
  | "msg-reconnecting"
  | "msg-offline"
  | "msg-policy"
  // Social (SO-01): not available (= private, not discoverable, not counted), join requested, activity guest, left, not counted yet, blocked; off = live mode without a Social backend.
  | "social-not-available"
  | "social-requested"
  | "social-guest"
  | "social-left"
  | "social-not-counted"
  | "social-blocked"
  | "social-off";

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
  "team-not-available": "teamNotAvailable",
  "team-invite": "teamInvite",
  "team-removed": "teamRemoved",
  "team-joined": "teamJoined",
  "company-not-available": "companyNotAvailable",
  "company-invite": "companyInvite",
  "company-left": "companyLeft",
  "company-sealed": "companySealed",
  "company-policy": "companyPolicy",
  "company-outside": "companyOutside",
  "company-attach-pending": "companyAttachPending",
  "company-not-counted": "companyNotCounted",
  "msg-not-available": "msgNotAvailable",
  "msg-removed": "msgRemoved",
  "msg-not-found": "msgNotFound",
  "msg-blocked": "msgBlocked",
  "msg-joined": "msgJoined",
  "msg-reconnecting": "msgReconnecting",
  "msg-offline": "msgOffline",
  "msg-policy": "msgPolicy",
  "social-not-available": "socialNotAvailable",
  "social-requested": "socialRequested",
  "social-guest": "socialGuest",
  "social-left": "socialLeft",
  "social-not-counted": "socialNotCounted",
  "social-blocked": "socialBlocked",
  "social-off": "socialOff",
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
  "team-not-available": { icon: LockKeyhole, tone: "neutral" },
  "team-invite": { icon: MailOpen, tone: "scope" },
  "team-removed": { icon: ShieldOff, tone: "warning" },
  "team-joined": { icon: UsersRound, tone: "scope" },
  "company-not-available": { icon: Building2, tone: "neutral" },
  "company-invite": { icon: MailOpen, tone: "scope" },
  "company-left": { icon: LogOut, tone: "warning" },
  "company-sealed": { icon: LockKeyhole, tone: "neutral" },
  "company-policy": { icon: Shield, tone: "scope" },
  "company-outside": { icon: Building2, tone: "neutral" },
  "company-attach-pending": { icon: Link2, tone: "warning" },
  "company-not-counted": { icon: Coins, tone: "info" },
  "msg-not-available": { icon: MessageSquareOff, tone: "neutral" },
  "msg-removed": { icon: LockKeyhole, tone: "warning" },
  "msg-not-found": { icon: MessageSquareOff, tone: "neutral" },
  "msg-blocked": { icon: Ban, tone: "neutral" },
  "msg-joined": { icon: Clock, tone: "neutral" },
  "msg-reconnecting": { icon: RefreshCw, tone: "warning" },
  "msg-offline": { icon: WifiOff, tone: "warning" },
  "msg-policy": { icon: Shield, tone: "scope" },
  "social-not-available": { icon: LockKeyhole, tone: "neutral" },
  "social-requested": { icon: Clock, tone: "scope" },
  "social-guest": { icon: UsersRound, tone: "scope" },
  "social-left": { icon: LogOut, tone: "warning" },
  "social-not-counted": { icon: Coins, tone: "info" },
  "social-blocked": { icon: Ban, tone: "neutral" },
  "social-off": { icon: Hourglass, tone: "neutral" },
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
  const inline =
    kind === "pending" ||
    kind === "conflict" ||
    kind === "quota" ||
    kind === "team-joined" ||
    kind === "company-sealed" ||
    kind === "company-policy" ||
    kind === "company-outside" ||
    kind === "company-attach-pending" ||
    kind === "company-not-counted" ||
    kind === "msg-blocked" ||
    kind === "msg-joined" ||
    kind === "msg-reconnecting" ||
    kind === "msg-offline" ||
    kind === "msg-policy" ||
    kind === "social-not-counted" ||
    kind === "social-blocked";
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
