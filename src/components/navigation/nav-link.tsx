"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, type MouseEvent, type ReactElement } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { isNavItemActive } from "@/features/navigation/paths";
import type { NavItem } from "@/features/navigation/types";
import { cn } from "@/lib/cn";
import { ComingSoonBadge } from "./coming-soon-badge";

export type NavLinkLayout = "row" | "tab";

export interface NavLinkProps {
  item: NavItem;
  /** `row`: icon + label (rail, lists). `tab`: icon over a small label (mobile bottom bar). */
  layout?: NavLinkLayout;
  /** Row only: hide the label visually (collapsed rail) and show it as a tooltip. */
  iconOnly?: boolean;
  /** Overrides the active state derived from the URL (previews, tests). */
  active?: boolean;
  /** Called on a plain click of an available item, e.g. to close a containing sheet. */
  onNavigate?: () => void;
  /** Tooltip side when `iconOnly` (physical; pass inline-end for the rail). */
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /**
   * A live count on the icon (Inbox: untriaged items). `count` is the visible,
   * already localised number; `label` is read after the name ("Inbox, 6 to triage").
   */
  badge?: { count: string; label: string };
  className?: string;
}

function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * One navigation entry. Available items are Next.js links with
 * aria-current="page" when active; planned items are not links: they render
 * as an aria-disabled button described as "Coming soon" (visible badge in the
 * row layout, tooltip when icon-only) so keyboard users can still discover them.
 */
export function NavLink({
  item,
  layout = "row",
  iconOnly = false,
  active: activeOverride,
  onNavigate,
  tooltipSide = "right",
  badge,
  className,
}: NavLinkProps) {
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const badgeId = useId();

  const label = t(item.labelKey);
  const planned = item.status === "planned";
  const active = !planned && (activeOverride ?? isNavItemActive(item, pathname));
  const compact = layout === "row" && iconOnly;

  // Visual only: the count is announced through the name, never by colour.
  const badgeMark = badge ? (
    <span
      aria-hidden="true"
      data-slot="nav-badge"
      className="absolute -end-1.5 -top-1.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-pill bg-primary px-1 text-[0.625rem] font-bold text-on-accent tabular ring-2 ring-surface"
    >
      {badge.count}
    </span>
  ) : null;

  const glyph =
    layout === "tab" ? (
      <span
        className={cn(
          "inline-flex h-7 w-11 items-center justify-center rounded-pill transition-colors",
          active && "bg-scope-soft",
        )}
      >
        <Icon icon={item.icon} size={18} />
      </span>
    ) : (
      <Icon
        icon={item.icon}
        className={cn(active ? "text-scope-deep" : planned ? "text-icon-muted" : "text-fg-secondary")}
      />
    );
  const icon = badgeMark ? (
    <span className="relative inline-flex shrink-0">
      {glyph}
      {badgeMark}
    </span>
  ) : (
    glyph
  );

  const classes = cn(
    layout === "row"
      ? "flex h-12 w-full items-center gap-3 overflow-hidden rounded-pill px-3.5 text-sm whitespace-nowrap transition-colors"
      : "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-row px-1 text-xs",
    active
      ? cn("font-bold text-scope-deep", layout === "row" && "bg-scope-soft")
      : planned
        ? "cursor-not-allowed font-medium text-fg-muted"
        : cn("font-medium", layout === "row" ? "text-fg hover:bg-subtle" : "text-fg-secondary hover:text-fg"),
    className,
  );

  const text = (
    <span className={cn(layout === "row" ? "min-w-0 flex-1 truncate text-start" : "max-w-full truncate", compact && "sr-only")}>
      {label}
    </span>
  );

  let element: ReactElement;
  if (planned) {
    element = (
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={badgeId}
        data-status="planned"
        className={classes}
      >
        {icon}
        {text}
        {/* Referenced by aria-describedby; hidden from the name so it reads "Goals, Coming soon". */}
        {layout === "row" && !compact ? (
          <ComingSoonBadge id={badgeId} aria-hidden="true">
            {tCommon("comingSoon")}
          </ComingSoonBadge>
        ) : (
          <span id={badgeId} hidden>
            {tCommon("comingSoon")}
          </span>
        )}
      </button>
    );
  } else {
    element = (
      <Link
        href={item.href}
        // With a count, the name carries it ("Inbox, 6 to triage"); the badge itself is aria-hidden.
        aria-label={badge ? t("badges.withCount", { label, count: badge.label }) : undefined}
        aria-current={active ? "page" : undefined}
        data-status="available"
        className={classes}
        onClick={(event) => {
          if (!event.defaultPrevented && isPlainClick(event)) onNavigate?.();
        }}
      >
        {icon}
        {text}
      </Link>
    );
  }

  if (!compact) return element;
  return (
    <Tooltip
      side={tooltipSide}
      content={planned ? `${label} · ${tCommon("comingSoon")}` : badge ? `${label} · ${badge.label}` : label}
    >
      {element}
    </Tooltip>
  );
}
