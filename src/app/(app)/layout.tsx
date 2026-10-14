import type { ReactNode } from "react";
import { ShellFrame } from "@/components/shell/shell-frame";
import { getRequestPreferences } from "@/features/preferences/request-preferences";
import { getSampleShellData, isSampleData } from "@/fixtures/shell";

/*
 * The application shell around every context route. A Server Component: the
 * shell's interactive parts are client islands inside ShellFrame.
 *
 * Cache Components: the client islands read usePathname(). The group now
 * has dynamic Personal routes (tasks/[id], goals/[[...id]], journal/…,
 * review/[week]); that works because the root layout blocks on the request
 * (`instant = false`), so nothing is prerendered with an unknown pathname.
 * If the root ever becomes instant, wrap the pathname-reading islands in
 * <Suspense> (see the usePathname docs).
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
