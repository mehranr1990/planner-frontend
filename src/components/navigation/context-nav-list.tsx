"use client";

import { useTranslations } from "next-intl";
import { defaultContextId, getAppContext } from "@/features/navigation/contexts";
import type { ContextId } from "@/features/navigation/types";
import { useActiveContext } from "@/features/navigation/use-active-navigation";
import { cn } from "@/lib/cn";
import { NavLink } from "./nav-link";

export interface ContextNavListProps {
  /** Defaults to the context in the URL (Personal outside any context). */
  context?: ContextId;
  /** Called when an available item is chosen, so a containing sheet/palette can close. */
  onNavigate?: () => void;
  /** Accessible name of the list; defaults to "All <Context> pages". */
  "aria-label"?: string;
  className?: string;
}

/**
 * A context's full nav as a vertical list (icon, label, "Coming soon" for
 * planned items). Used by the mobile "More" sheet and the command palette.
 */
export function ContextNavList({ context: contextProp, onNavigate, "aria-label": ariaLabel, className }: ContextNavListProps) {
  const t = useTranslations("Navigation");
  const urlContext = useActiveContext();
  const context = getAppContext(contextProp ?? urlContext?.id ?? defaultContextId);

  return (
    <ul
      aria-label={ariaLabel ?? t("moreLabel", { context: t(context.labelKey) })}
      data-scope={context.id}
      className={cn("flex flex-col gap-1", className)}
    >
      {context.nav.map((item) => (
        <li key={item.id}>
          <NavLink item={item} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}
