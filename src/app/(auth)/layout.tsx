import type { ReactNode } from "react";

/*
 * Public account pages (sign in, sign up, recovery, verification): no shell,
 * no private data — only the root providers. Personal scope colours.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-scope="personal" data-slot="auth-shell" className="min-h-dvh bg-canvas text-fg">
      {children}
    </div>
  );
}
