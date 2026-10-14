import type { ReactNode } from "react";
import { FloatingRail } from "@/components/navigation/floating-rail";
import { AppShell } from "./app-shell";
import { AssistantLauncher } from "./assistant-panel";
import { MobileHeader, MobileShellNav } from "./mobile-shell";
import type { ScheduleBlock } from "./schedule";
import { ScheduleIsland } from "./schedule-island";
import { ScopeBoundary } from "./scope-boundary";
import { ShellActions } from "./shell-actions";
import { ShellContextSwitcher } from "./shell-context-switcher";
import { ShellProvider, type ShellProfile, type ShellWorkspaces } from "./shell-provider";
import { TopBar } from "./top-bar";

/*
 * The composed application shell (Shell board): every island wired up around
 * the page. Server-compatible: it only arranges client islands, so the route
 * layout stays a Server Component and page content streams inside it. All
 * props are serialisable data (sample data until Step 3).
 *
 *   desktop (lg+)  home · context switcher · schedule · actions
 *                  rail column │ page                       assistant ◢
 *   mobile         account · context + workspace · bell, context chips
 *                  page
 *                  bottom bar (Quick add FAB, More)
 */

export interface ShellFrameProps {
  workspaces: ShellWorkspaces;
  profile: ShellProfile;
  schedule: { date: Date; now: Date; blocks: readonly ScheduleBlock[] };
  /** The content is sample data: the schedule and the account menu say so visibly. */
  sample?: boolean;
  children: ReactNode;
}

export function ShellFrame({ workspaces, profile, schedule, sample = false, children }: ShellFrameProps) {
  return (
    <ShellProvider workspaces={workspaces} profile={profile} sample={sample}>
      <ScopeBoundary>
        <AppShell
          topBar={
            <TopBar
              contextSwitcher={<ShellContextSwitcher />}
              schedule={
                <ScheduleIsland date={schedule.date} now={schedule.now} blocks={schedule.blocks} sample={sample} />
              }
              actions={<ShellActions />}
            />
          }
          rail={<FloatingRail />}
          mobileHeader={<MobileHeader />}
          mobileNav={<MobileShellNav />}
          floating={<AssistantLauncher />}
        >
          {children}
        </AppShell>
      </ScopeBoundary>
    </ShellProvider>
  );
}
