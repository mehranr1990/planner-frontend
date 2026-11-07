import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { scopeTokens } from "@/design-system/tokens/colors";
import type { ContextId } from "@/features/navigation/types";
import { cn } from "@/lib/cn";

export interface BreadcrumbItem {
  label: string;
  /** Ancestors with an href render as links; the last item is always the current page. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: readonly BreadcrumbItem[];
  /** Shows the context's scope dot before the trail (Shell board). */
  scope?: ContextId;
  "aria-label"?: string;
  /**
   * Long names truncate in the middle below lg ("Website Re…ign", SH01);
   * the full name stays available to assistive tech.
   */
  middleTruncate?: boolean;
  className?: string;
}

/** "Website Redesign" → "Website Re…ign" when longer than `max` characters. */
export function truncateMiddle(label: string, max = 14, tail = 3): string {
  const chars = Array.from(label);
  if (chars.length <= max) return label;
  return `${chars.slice(0, max - tail - 1).join("")}…${chars.slice(-tail).join("")}`;
}

function Label({ text, middle }: { text: string; middle: boolean }) {
  const short = middle ? truncateMiddle(text) : text;
  if (short === text) return <bdi>{text}</bdi>;
  return (
    <>
      <bdi aria-hidden="true" className="lg:hidden">
        {short}
      </bdi>
      <bdi className="max-lg:sr-only">{text}</bdi>
    </>
  );
}

/**
 * "• Personal › Mehran › Overview". Ancestors shrink and truncate first on
 * narrow widths; the current page keeps its room. Separators mirror in RTL.
 * Server-compatible (no client hooks).
 */
export function Breadcrumbs({
  items,
  scope,
  "aria-label": ariaLabel,
  middleTruncate = false,
  className,
}: BreadcrumbsProps) {
  const t = useTranslations("Navigation");
  if (items.length === 0) return null;

  return (
    <nav aria-label={ariaLabel ?? t("breadcrumbs")} className={cn("flex min-w-0 items-center gap-2", className)}>
      {scope ? <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", scopeTokens[scope].dot)} /> : null}
      <ol className="flex min-w-0 items-center gap-1 type-caption font-semibold text-fg-secondary">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className={cn("flex min-w-0 items-center gap-1", last ? "max-w-[70%] shrink-0" : "shrink")}>
              {last ? (
                <span aria-current="page" className="truncate font-bold text-fg">
                  <Label text={item.label} middle={middleTruncate && !last} />
                </span>
              ) : item.href ? (
                <Link href={item.href} className="truncate rounded-pill transition-colors hover:text-fg">
                  <Label text={item.label} middle={middleTruncate && !last} />
                </Link>
              ) : (
                <span className="truncate">
                  <Label text={item.label} middle={middleTruncate && !last} />
                </span>
              )}
              {last ? null : <Icon icon={ChevronRight} mirror size={14} className="shrink-0 text-icon-muted" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
