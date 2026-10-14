import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/*
 * Desktop top bar (CommandBar direction A): a row of separate 56px islands.
 * Home mark · context switcher · schedule (takes the spare width, shrinks
 * first) · actions at inline-end. Slots only: the islands come from callers.
 */

export interface ShellHomeLinkProps {
  href?: string;
  /** Accessible name; defaults to "Planner home". */
  label?: string;
  className?: string;
}

/** The round logo island: the arrow mark from the Shell board, as a real link. */
export function ShellHomeLink({ href = "/", label, className }: ShellHomeLinkProps) {
  const t = useTranslations("Shell");
  return (
    <Link
      href={href}
      aria-label={label ?? t("home")}
      className={cn(
        "grid size-14 shrink-0 place-items-center rounded-pill bg-surface text-fg shadow-island transition-colors hover:bg-subtle",
        className,
      )}
    >
      {/* The arrow points toward inline-end, so it mirrors in RTL (↖ on FaRules). */}
      <Icon icon={ArrowUpRight} mirror size={22} className="[stroke-width:2.4]" />
    </Link>
  );
}

export interface TopBarProps {
  /** Context switcher island. */
  contextSwitcher?: ReactNode;
  /** Schedule island; gets the remaining width and can shrink. */
  schedule?: ReactNode;
  /** Actions island (search, quick create, notifications, account). */
  actions?: ReactNode;
  homeHref?: string;
  homeLabel?: string;
  className?: string;
}

export function TopBar({ contextSwitcher, schedule, actions, homeHref, homeLabel, className }: TopBarProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <ShellHomeLink href={homeHref} label={homeLabel} />
      {contextSwitcher ? <div className="flex min-w-0 shrink-0">{contextSwitcher}</div> : null}
      <div data-slot="schedule" className="flex min-w-0 flex-1 *:min-w-0 *:flex-1">
        {schedule}
      </div>
      {actions ? <div className="flex shrink-0">{actions}</div> : null}
    </div>
  );
}
