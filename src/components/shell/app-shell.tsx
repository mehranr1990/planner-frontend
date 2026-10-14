import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Application frame (Shell, S2MyDay, Mobile*). Slots only, no data.
 *
 * Desktop (lg, ≥1024px): a 20px outer gutter (logo and rail start at x=20
 * on a 1440 board, the top bar ends at x=1420), the top bar row of islands, then two columns: the
 * rail in its own column (sticky and vertically centred, so it can never
 * overlap content) and the main column. Logical properties put the rail on
 * the right under dir="rtl".
 * Below lg: compact mobile header, content, and a fixed bottom nav slot that
 * pads for the home indicator; content pads so the nav never covers it.
 *
 * Each viewport shows one header; the other is display:none, which also takes
 * it out of the accessibility tree, so there is one banner at a time.
 */

export interface AppShellProps {
  /** Desktop top bar (TopBar). */
  topBar?: ReactNode;
  /** Desktop floating rail (navigation). */
  rail?: ReactNode;
  /** Compact header below lg. */
  mobileHeader?: ReactNode;
  /** Bottom navigation below lg; fixed to the bottom edge. */
  mobileNav?: ReactNode;
  /** Floating extras such as the AssistantFab (they position themselves). */
  floating?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ topBar, rail, mobileHeader, mobileNav, floating, children, className }: AppShellProps) {
  const t = useTranslations("Shell");
  return (
    <div className={cn("relative min-h-dvh overflow-x-clip bg-canvas text-fg", className)}>
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-(--z-tooltip)",
          "focus:inline-flex focus:min-h-touch focus:items-center focus:rounded-pill focus:bg-surface focus:px-5",
          "focus:font-semibold focus:text-fg focus:shadow-elevated",
        )}
      >
        {t("skipToContent")}
      </a>

      <div className="mx-auto flex w-full max-w-360 flex-col gap-5 px-gutter pt-(--safe-top) lg:px-5 lg:pt-4">
        {topBar ? (
          <header data-slot="top-bar" className="hidden min-w-0 lg:block">
            {topBar}
          </header>
        ) : null}
        {mobileHeader ? (
          <header data-slot="mobile-header" className="min-w-0 pt-4 lg:hidden">
            {mobileHeader}
          </header>
        ) : null}

        <div className={cn("min-w-0", rail && "lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-5")}>
          {rail ? (
            <div data-slot="rail" className="hidden lg:block">
              <div className="sticky top-4 flex h-[calc(100dvh-2rem)] items-center *:max-h-full">
                {rail}
              </div>
            </div>
          ) : null}
          <main
            id="main-content"
            tabIndex={-1}
            className={cn(
              "flex min-w-0 flex-col gap-5 lg:pb-10",
              mobileNav ? "pb-[calc(7rem+var(--safe-bottom))]" : "pb-[calc(2rem+var(--safe-bottom))]",
            )}
          >
            {children}
          </main>
        </div>
      </div>

      {mobileNav ? (
        <div
          data-slot="mobile-nav"
          className="fixed inset-x-0 bottom-0 z-(--z-shell) px-gutter pb-[max(var(--safe-bottom),1rem)] lg:hidden"
        >
          {mobileNav}
        </div>
      ) : null}
      {floating}
    </div>
  );
}
