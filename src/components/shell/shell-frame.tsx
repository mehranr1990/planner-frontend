import type { ReactNode } from "react";
import { FloatingRail } from "@/components/navigation/floating-rail";
import { AppShell } from "./app-shell";
import { NonPersonalAssistant } from "./non-personal-assistant";
import { MobileHeader, MobileShellNav } from "./mobile-shell";
import { TodayScheduleIsland } from "./today-schedule-island";
import { ScopeBoundary } from "./scope-boundary";
import { ShellActions } from "./shell-actions";
import { ShellContextSwitcher } from "./shell-context-switcher";
import { ShellProvider, type ShellProfile, type ShellWorkspaces } from "./shell-provider";
import { TopBar } from "./top-bar";

/*
 * The composed application shell (Shell board): every island wired up around
 * the page. Server-compatible: it only arranges client islands, so the route
 * layout stays a Server Component and page content streams inside it. All
 * props are serialisable data. The schedule island reads today's blocks itself.
 *
 *   desktop (lg+)  home · context switcher · schedule · actions
 *                  rail column │ page        (assistant ◢ outside Personal)
 *   mobile         account · context + workspace · bell, context chips
 *                  page
 *                  bottom bar (Quick add FAB, More)
 */

export interface ShellFrameProps {
  workspaces: ShellWorkspaces;
  profile: ShellProfile;
  /** Workspaces and profile are sample data: the account menu says so visibly. */
  sample?: boolean;
  children: ReactNode;
}

export function ShellFrame({ workspaces, profile, sample = false, children }: ShellFrameProps) {
  return (
    <ShellProvider workspaces={workspaces} profile={profile} sample={sample}>
      <ScopeBoundary>
        <AppShell
          topBar={
            <TopBar
              contextSwitcher={<ShellContextSwitcher />}
              schedule={<TodayScheduleIsland />}
              actions={<ShellActions />}
            />
          }
          rail={<FloatingRail />}
          mobileHeader={<MobileHeader />}
          mobileNav={<MobileShellNav />}
          floating={<NonPersonalAssistant />}
        >
          {children}
        </AppShell>
      </ScopeBoundary>
    </ShellProvider>
  );
}
