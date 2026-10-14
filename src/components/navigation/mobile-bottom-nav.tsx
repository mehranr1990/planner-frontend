"use client";

import { Ellipsis, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Slot } from "radix-ui";
import type { CSSProperties, ReactElement } from "react";
import { Icon } from "@/components/ui/icon";
import { defaultContextId, getAppContext } from "@/features/navigation/contexts";
import { getMobileNavItems } from "@/features/navigation/paths";
import type { ContextId, NavItemId } from "@/features/navigation/types";
import { useActiveContext } from "@/features/navigation/use-active-navigation";
import { cn } from "@/lib/cn";
import { NavLink } from "./nav-link";

export interface MobileBottomNavProps {
  /** Defaults to the context in the URL (Personal outside any context). */
  context?: ContextId;
  /** Accessible name of the centre button, e.g. "Quick add". */
  fabLabel: string;
  onFabClick?: () => void;
  /**
   * Render the centre button as this element instead (a Link, or a Dialog /
   * Sheet trigger). It receives the FAB styles, label and plus icon.
   */
  fab?: ReactElement;
  /** Opens the sheet with the context's full nav (ContextNavList). */
  onMoreClick?: () => void;
  /** Pass the sheet's open state so the More button exposes aria-expanded. */
  moreExpanded?: boolean;
  /** Overrides the URL-derived active item (previews outside the shell routes). */
  activeItemId?: NavItemId;
  className?: string;
}

/*
 * The notch is an alpha mask on the bar's background layer only, so it cuts
 * a real hole that shows whatever is behind (any background, both themes).
 * Three layers: a 160×72 centre piece (concave notch, R40 + 20px fillets
 * tangent to the top edge) and two solid sides overlapping it by 1px.
 * The SVG shapes carry no colour; a mask reads only their alpha.
 */
const notchPiece = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='72'><path d='M0 0H21.21A20 20 0 0 1 40.81 16A40 40 0 0 0 119.19 16A20 20 0 0 1 138.79 0H160V72H0Z'/></svg>",
)}")`;
const solid = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'><rect width='1' height='1'/></svg>",
)}")`;
const notchMask: CSSProperties = {
  maskImage: `${notchPiece}, ${solid}, ${solid}`,
  maskSize: "160px 72px, calc(50% - 79px) 100%, calc(50% - 79px) 100%",
  maskPosition: "50% 0, 0 0, 100% 0",
  maskRepeat: "no-repeat",
  WebkitMaskImage: `${notchPiece}, ${solid}, ${solid}`,
  WebkitMaskSize: "160px 72px, calc(50% - 79px) 100%, calc(50% - 79px) 100%",
  WebkitMaskPosition: "50% 0, 0 0, 100% 0",
  WebkitMaskRepeat: "no-repeat",
};

const fabClasses = cn(
  "absolute inset-x-0 -top-4 mx-auto inline-flex size-15 items-center justify-center rounded-full",
  "bg-primary text-on-accent shadow-island transition-colors hover:bg-primary-hover active:bg-primary-pressed",
);

/**
 * Mobile bottom bar (MobileHome / MobileFaHome): two items, a raised centre
 * FAB in a notch, one item, then "More". Items are the active context's
 * mobile slots; planned ones render disabled. Order mirrors in RTL through
 * flex. Place it with e.g. `fixed inset-x-0 bottom-0 z-(--z-shell)`; it pads
 * for the home indicator itself.
 */
export function MobileBottomNav({
  context: contextProp,
  fabLabel,
  onFabClick,
  fab,
  onMoreClick,
  moreExpanded,
  activeItemId,
  className,
}: MobileBottomNavProps) {
  const activeOverride = (id: NavItemId) => (activeItemId === undefined ? undefined : id === activeItemId);
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");
  const urlContext = useActiveContext();
  const context = getAppContext(contextProp ?? urlContext?.id ?? defaultContextId);
  const [first, second, third] = getMobileNavItems(context);

  const plus = <Icon icon={Plus} size={22} />;

  return (
    <nav
      aria-label={t("bottomNav")}
      data-scope={context.id}
      className={cn("px-gutter pt-4 pb-[max(1rem,var(--safe-bottom))]", className)}
    >
      <div className="relative">
        {/* Shadow on the wrapper: a mask would clip a box-shadow on the bar itself. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 [filter:drop-shadow(0_12px_32px_color-mix(in_oklab,var(--text-primary)_8%,transparent))] dark:[filter:none]"
        >
          <div className="size-full rounded-pill bg-surface" style={notchMask} />
        </div>
        <ul className="relative flex h-18 items-center px-2">
          {[first, second].map((item) =>
            item ? (
              <li key={item.id} className="min-w-0 flex-1">
                <NavLink item={item} layout="tab" active={activeOverride(item.id)} />
              </li>
            ) : null,
          )}
          <li className="relative w-21 shrink-0 self-stretch">
            {fab ? (
              <Slot.Root aria-label={fabLabel} className={fabClasses}>
                <Slot.Slottable>{fab}</Slot.Slottable>
                {plus}
              </Slot.Root>
            ) : (
              <button type="button" aria-label={fabLabel} onClick={onFabClick} className={fabClasses}>
                {plus}
              </button>
            )}
          </li>
          {third ? (
            <li className="min-w-0 flex-1">
              <NavLink item={third} layout="tab" active={activeOverride(third.id)} />
            </li>
          ) : null}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreExpanded}
              onClick={onMoreClick}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-row px-1 text-xs font-medium text-fg-secondary transition-colors hover:text-fg"
            >
              <span className="inline-flex h-7 w-11 items-center justify-center rounded-pill">
                <Icon icon={Ellipsis} size={18} />
              </span>
              <span className="max-w-full truncate">{tCommon("more")}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
