"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { defaultContextId, getAppContext } from "@/features/navigation/contexts";
import type { AppContext, ContextId, NavItem, NavItemId } from "@/features/navigation/types";
import { useActiveContext } from "@/features/navigation/use-active-navigation";
import { useNavBadge, useNavItemFilter } from "@/features/navigation/use-nav-state";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { NavLink } from "./nav-link";
import { useControllableState } from "./use-controllable-state";

export interface FloatingRailProps {
  /** Context whose nav to show. Defaults to the context in the URL (Personal outside any context). */
  context?: ContextId;
  /** Controlled expanded state (232px with labels) vs collapsed (64px, icons only). */
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Overrides the landmark name (e.g. two rails previewed on one page). */
  "aria-label"?: string;
  /** Overrides the URL-derived active item (previews outside the shell routes). */
  activeItemId?: NavItemId;
  className?: string;
}

/**
 * The floating side rail (Shell board): a white capsule of 48px icon links
 * that expands to show labels. Active item = scope soft fill + deep text.
 *
 * The parent column owns placement. Expected wrapper, so the rail stays
 * vertically centred, sticky, and never overlaps content:
 *
 *   <div className="shrink-0 self-stretch">            // own grid/flex column
 *     <div className="sticky top-4 flex h-[calc(100dvh-2rem)] items-center">
 *       <FloatingRail />
 *     </div>
 *   </div>
 *
 * The rail caps itself at the wrapper's height and scrolls its item list
 * internally on short viewports. With Cache Components, wrap it in
 * <Suspense> when it renders in a layout above dynamic routes (usePathname).
 */
export function FloatingRail({
  context: contextProp,
  expanded: expandedProp,
  defaultExpanded = false,
  onExpandedChange,
  "aria-label": ariaLabel,
  activeItemId,
  className,
}: FloatingRailProps) {
  const t = useTranslations("Navigation");
  const { direction } = usePreferences();
  const urlContext = useActiveContext();
  const context = getAppContext(contextProp ?? urlContext?.id ?? defaultContextId);
  const listId = useId();
  const [expanded, setExpanded] = useControllableState({
    value: expandedProp,
    defaultValue: defaultExpanded,
    onChange: onExpandedChange,
  });

  // Tooltips open toward the content: inline-end of the rail.
  const inlineEnd = direction === "rtl" ? "left" : "right";

  if (context.rail) {
    return (
      <GroupedRail
        context={context}
        ariaLabel={ariaLabel ?? t("rail.landmark", { context: t(context.labelKey) })}
        tooltipSide={inlineEnd}
        activeItemId={activeItemId}
        className={className}
      />
    );
  }

  const toggleLabel = expanded ? t("rail.collapse") : t("rail.expand");

  const toggle = (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={listId}
      aria-label={toggleLabel}
      onClick={() => setExpanded(!expanded)}
      className="flex h-12 w-full shrink-0 items-center gap-3 overflow-hidden rounded-pill bg-raised px-3.5 text-sm font-semibold whitespace-nowrap text-fg-secondary transition-colors hover:bg-secondary-hover hover:text-fg"
    >
      <Icon icon={expanded ? ChevronLeft : ChevronRight} mirror />
      {expanded ? <span className="truncate">{t("rail.collapseShort")}</span> : null}
    </button>
  );

  return (
    <nav
      aria-label={ariaLabel ?? t("rail.landmark", { context: t(context.labelKey) })}
      data-scope={context.id}
      data-expanded={expanded ? "" : undefined}
      className={cn(
        "flex max-h-full shrink-0 flex-col rounded-card bg-surface p-1 text-fg shadow-island",
        "transition-[width] duration-(--motion-standard) ease-standard",
        expanded ? "w-58" : "w-16",
        className,
      )}
    >
      {/* Inner padding keeps focus rings inside the scroll container's clip. */}
      <ul id={listId} className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]">
        {context.nav.map((item) => (
          <li key={item.id}>
            <NavLink
              item={item}
              iconOnly={!expanded}
              tooltipSide={inlineEnd}
              active={activeItemId === undefined ? undefined : item.id === activeItemId}
            />
          </li>
        ))}
      </ul>
      <div className="flex shrink-0 flex-col gap-1 px-1 pb-1">
        <span aria-hidden="true" className="mx-1 my-1 h-px bg-line" />
        {/* Always wrapped, so toggling never remounts the button and focus stays on it. */}
        <Tooltip side={inlineEnd} content={toggleLabel}>
          {toggle}
        </Tooltip>
      </div>
    </nav>
  );
}

/** A rail entry with its live count (Inbox). */
function RailLink({
  item,
  tooltipSide,
  activeItemId,
}: {
  item: NavItem;
  tooltipSide: "left" | "right";
  activeItemId?: NavItemId;
}) {
  const badge = useNavBadge(item);
  return (
    <NavLink
      item={item}
      iconOnly
      tooltipSide={tooltipSide}
      badge={badge}
      active={activeItemId === undefined ? undefined : item.id === activeItemId}
    />
  );
}

/**
 * The Personal rail (P00PersonalIA, CLAUDE.md §5): icon-only, never expands.
 * Three groups split by hairlines — primary, optional modules, capture — and
 * Settings pinned to the bottom. Hidden modules leave the rail and a group
 * that becomes empty takes its separator with it.
 */
function GroupedRail({
  context,
  ariaLabel,
  tooltipSide,
  activeItemId,
  className,
}: {
  context: AppContext;
  ariaLabel: string;
  tooltipSide: "left" | "right";
  activeItemId?: NavItemId;
  className?: string;
}) {
  const visible = useNavItemFilter(context);
  const byId = new Map(context.nav.map((item) => [item.id, item]));
  const resolve = (ids: readonly NavItemId[]) =>
    ids.map((id) => byId.get(id)).filter((item): item is NavItem => item !== undefined && visible(item));
  const groups = (context.rail?.groups ?? []).map(resolve).filter((group) => group.length > 0);
  const footer = resolve(context.rail?.footer ?? []);

  return (
    <nav
      aria-label={ariaLabel}
      data-scope={context.id}
      data-rail="grouped"
      className={cn("flex max-h-full w-16 shrink-0 flex-col rounded-card bg-surface p-1 text-fg shadow-island", className)}
    >
      {/* Inner padding keeps focus rings inside the scroll container's clip. */}
      <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]">
        {groups.map((group, index) => (
          <div key={group[0]!.id} className="flex flex-col">
            {index > 0 ? <span aria-hidden="true" data-slot="rail-separator" className="mx-2 my-1.5 h-px bg-line" /> : null}
            <ul className="flex flex-col gap-1">
              {group.map((item) => (
                <li key={item.id}>
                  <RailLink item={item} tooltipSide={tooltipSide} activeItemId={activeItemId} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {footer.length > 0 ? (
        <ul className="mt-auto flex shrink-0 flex-col gap-1 px-1 pt-3 pb-1">
          {footer.map((item) => (
            <li key={item.id}>
              <RailLink item={item} tooltipSide={tooltipSide} activeItemId={activeItemId} />
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
