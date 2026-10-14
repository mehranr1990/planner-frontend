"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { appContexts, getAppContext } from "@/features/navigation/contexts";
import type { ContextId } from "@/features/navigation/types";
import { getContextFromPathname, normalizePathname } from "@/features/navigation/paths";
import { cn } from "@/lib/cn";

export interface ContextChipsProps {
  /** Overrides the URL-derived active context (previews outside the shell routes). */
  activeContext?: ContextId;
  className?: string;
}

/**
 * Mobile context chips (MobileHome): the four contexts as pill links to their
 * overviews. The row scrolls inside itself, so a 390px page never overflows,
 * and the active chip is scrolled into view. Each chip takes its own scope
 * colours; the active one is filled soft/deep, marked aria-current, and
 * shows a check in place of its dot, so it never differs by colour alone
 * (WCAG 1.4.1).
 */
export function ContextChips({ activeContext, className }: ContextChipsProps) {
  const t = useTranslations("Navigation");
  const pathname = usePathname();
  const active = activeContext ? getAppContext(activeContext) : getContextFromPathname(pathname);
  const onOverview = active !== undefined && normalizePathname(pathname) === active.basePath;
  const scrollerRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const chip = activeRef.current;
    if (!scroller || !chip) return;
    // Horizontal only (scrollIntoView could also scroll the page). Relative
    // deltas behave the same in LTR and RTL scroll coordinates.
    const outer = scroller.getBoundingClientRect();
    const inner = chip.getBoundingClientRect();
    if (inner.left < outer.left) scroller.scrollBy({ left: inner.left - outer.left });
    else if (inner.right > outer.right) scroller.scrollBy({ left: inner.right - outer.right });
  }, [active?.id]);

  return (
    <nav aria-label={t("chips")} className={cn("min-w-0", className)}>
      {/* p-1 keeps focus rings inside the scroll clip. */}
      <ul
        ref={scrollerRef}
        className="flex gap-2 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {appContexts.map((context) => {
          const isActive = context.id === active?.id;
          return (
            <li key={context.id} className="shrink-0">
              <Link
                ref={isActive ? activeRef : undefined}
                href={context.basePath}
                aria-current={isActive ? (onOverview ? "page" : "true") : undefined}
                data-scope={context.id}
                className="group flex min-h-touch items-center rounded-pill"
              >
                <span
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-pill px-4 text-sm font-bold whitespace-nowrap transition-colors",
                    isActive ? "bg-scope-soft text-scope-deep" : "bg-surface text-fg group-hover:bg-subtle",
                  )}
                >
                  {isActive ? (
                    <span data-slot="active-check" className="-ms-1 inline-flex">
                      <Icon icon={Check} size={16} className="[stroke-width:2.5]" />
                    </span>
                  ) : (
                    <span aria-hidden="true" className="size-2 rounded-full bg-scope-dot" />
                  )}
                  {t(context.labelKey)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
