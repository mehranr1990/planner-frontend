"use client";

import { Archive, Eye, RefreshCw, UserRoundCheck, WifiOff, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/*
 * SH-02 banners: directly under the page header, full width, never
 * dismissible while the condition holds, one at a time. Priority when several
 * apply: revoked (full page) › offline › archived › conflict › read-only ›
 * guest — use `pickAccessBanner`.
 */

/** team-archived / team-read-only: the Team variants (TS-01), same slot in the priority order. */
export type AccessBannerKind =
  | "offline"
  | "archived"
  | "team-archived"
  | "conflict"
  | "read-only"
  | "team-read-only"
  | "guest";

const PRIORITY: readonly AccessBannerKind[] = [
  "offline",
  "archived",
  "team-archived",
  "conflict",
  "read-only",
  "team-read-only",
  "guest",
];

/** The one banner to show for the conditions that hold. */
export function pickAccessBanner(conditions: Partial<Record<AccessBannerKind, boolean>>): AccessBannerKind | null {
  return PRIORITY.find((kind) => conditions[kind]) ?? null;
}

const LOOK: Record<AccessBannerKind, { icon: LucideIcon; className: string; key: string }> = {
  offline: {
    icon: WifiOff,
    className: "bg-warning-soft text-warning-text",
    key: "offline",
  },
  archived: { icon: Archive, className: "bg-raised text-fg", key: "archived" },
  "team-archived": { icon: Archive, className: "bg-raised text-fg", key: "teamArchived" },
  "team-read-only": { icon: Eye, className: "bg-scope-soft text-scope-deep", key: "teamReadOnly" },
  conflict: {
    icon: RefreshCw,
    className: "bg-info-soft text-info-text",
    key: "conflict",
  },
  "read-only": {
    icon: Eye,
    className: "bg-scope-soft text-scope-deep",
    key: "readOnly",
  },
  guest: {
    icon: UserRoundCheck,
    className: "bg-scope-soft text-scope-deep",
    key: "guest",
  },
};

export interface AccessBannerProps {
  kind: AccessBannerKind;
  values?: Record<string, string | number>;
  /** One action at the inline end (Restore / Retry / Reload); omit when the role cannot act. */
  action?: ReactNode;
  className?: string;
}

export function AccessBanner({ kind, values = {}, action, className }: AccessBannerProps) {
  const t = useTranslations("Access.banners");
  const look = LOOK[kind];
  return (
    <div
      role="status"
      data-banner={kind}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-row px-4 py-2 text-sm font-semibold",
        look.className,
        className,
      )}
    >
      <Icon icon={look.icon} size={18} className="shrink-0" />
      <p className="min-w-0 flex-1">{t(look.key as never, values as never)}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** A compact capsule action for a banner (inherits the banner colour). */
export function AccessBannerAction({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-9 items-center rounded-pill bg-surface px-3.5 text-xs font-bold text-fg transition-colors hover:bg-subtle",
        className,
      )}
      {...props}
    />
  );
}
