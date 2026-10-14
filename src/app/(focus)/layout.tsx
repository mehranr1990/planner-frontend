import type { ReactNode } from "react";

/*
 * Focus mode (P09): "Rail and command bar retreat". This route group has no
 * shell — no top bar, rail, bottom nav or assistant — only the root layout's
 * providers. It shares the /personal URL space with the (app) group.
 */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return (
    <div data-scope="personal" data-slot="focus-shell" className="min-h-dvh bg-canvas text-fg">
      {children}
    </div>
  );
}
