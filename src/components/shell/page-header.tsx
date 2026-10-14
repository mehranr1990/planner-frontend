import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Page header (Shell, S2MyDay): breadcrumb, title, subtitle, and the page's
 * primary action at inline-end. Stacks on narrow screens.
 */

export interface PageHeaderProps {
  title: ReactNode;
  /** Breadcrumb navigation, rendered above the title. */
  breadcrumb?: ReactNode;
  /** Shown under the title, e.g. the date or a status line. */
  subtitle?: ReactNode;
  /** Primary action (and optional secondary controls), placed at inline-end. */
  actions?: ReactNode;
  /** `h1` for workspace pages, `display` for the large greeting. */
  size?: "h1" | "display";
  /** Put the subtitle (e.g. "Tuesday, 13 October") above the title, as on My Day. */
  subtitlePlacement?: "below" | "above";
  /** Heading element; previews nested inside another page use h2/h3. */
  titleAs?: "h1" | "h2" | "h3";
  className?: string;
}

export function PageHeader({
  title,
  breadcrumb,
  subtitle,
  actions,
  size = "h1",
  subtitlePlacement = "below",
  titleAs: TitleTag = "h1",
  className,
}: PageHeaderProps) {
  const subtitleNode = subtitle ? <p className="type-body text-fg-secondary">{subtitle}</p> : null;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 px-1 pt-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        {breadcrumb}
        {subtitlePlacement === "above" ? subtitleNode : null}
        <TitleTag className={cn("break-words text-fg", size === "display" ? "type-display" : "type-h1")}>{title}</TitleTag>
        {subtitlePlacement === "below" ? subtitleNode : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </div>
  );
}
