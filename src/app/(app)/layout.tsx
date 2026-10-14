import type { ReactNode } from "react";
import { ShellFrame } from "@/components/shell/shell-frame";
import { getRequestPreferences } from "@/features/preferences/request-preferences";
import { getSampleShellData, isSampleData } from "@/fixtures/shell";

/*
 * The application shell around every context route. A Server Component: the
 * shell's interactive parts are client islands inside ShellFrame.
 *
 * Cache Components: the client islands read usePathname(). Every route in
 * this group is static (no dynamic params), so the pathname is known while
 * prerendering and no <Suspense> boundary is needed (see the usePathname
 * docs). Add one around the pathname-reading islands if a route with
 * unknown dynamic params joins this group.
 *
 * SAMPLE DATA: workspaces, profile and schedule come from src/fixtures/shell.ts,
 * in the request's UI language (a preference change refreshes this layout).
 * `sample` makes the shell label that content as sample data.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { locale } = await getRequestPreferences();
  const { workspaces, profile, schedule } = getSampleShellData(locale);
  return (
    <ShellFrame workspaces={workspaces} profile={profile} schedule={schedule} sample={isSampleData}>
      {children}
    </ShellFrame>
  );
}
