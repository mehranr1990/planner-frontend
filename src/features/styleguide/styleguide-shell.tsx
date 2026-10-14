import type { ReactNode } from "react";
import type { Scope } from "@/design-system/tokens/colors";
import type { StyleguidePageId } from "./pages";
import { PreviewControls } from "./preview-controls";
import { StyleguidePageNav } from "./styleguide-page-nav";

interface StyleguideShellProps {
  current: StyleguidePageId;
  overline: string;
  title: string;
  intro: string;
  /** Local preview scope: retints the primary colour of everything inside. */
  scope: Scope;
  /** Page-specific controls under the preview settings (e.g. a context switch). */
  toolbar?: ReactNode;
  /** The page's sections (StyleguideSection elements). */
  children: ReactNode;
}

/**
 * Shared frame of every styleguide page: page tabs, header, the floating
 * preview settings (theme, direction, language, digits, currency) and a
 * 12-column grid for the sections.
 */
export function StyleguideShell({ current, overline, title, intro, scope, toolbar, children }: StyleguideShellProps) {
  return (
    <div data-scope={scope} className="min-h-dvh bg-canvas text-fg">
      <main className="mx-auto flex max-w-content flex-col gap-8 px-gutter py-10 md:px-8 md:py-14 xl:px-0">
        <StyleguidePageNav current={current} />

        <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end">
          <div className="flex flex-col gap-3">
            <p className="type-label text-fg-secondary">{overline}</p>
            <h1 className="type-display">{title}</h1>
          </div>
          <p className="type-body text-fg-secondary">{intro}</p>
        </header>

        <div className="z-(--z-shell) lg:sticky lg:top-4">
          <PreviewControls />
        </div>

        {toolbar}

        <div className="grid grid-cols-1 gap-section lg:grid-cols-12">{children}</div>
      </main>
    </div>
  );
}
