"use client";

import { useTranslations } from "next-intl";
import { AssistantFab } from "@/components/shell/assistant-fab";
import { ScheduleIsland } from "@/components/shell/schedule-island";
import { ShellActions } from "@/components/shell/shell-actions";
import { ShellContextSwitcher } from "@/components/shell/shell-context-switcher";
import { ShellProvider } from "@/components/shell/shell-provider";
import { TopBar } from "@/components/shell/top-bar";
import { toast } from "@/components/ui/toast";
import { defaultContextId } from "@/features/navigation/contexts";
import { useSampleShellData } from "../../use-sample-shell-data";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/**
 * The desktop top bar (CommandBar direction A) built from the real shell
 * islands: the context switcher and the actions island (search ⌘K, quick
 * create, notifications, account) run on a ShellProvider fed with sample data.
 *
 * The live shell is not mounted on styleguide routes, so this is the page's
 * only ShellProvider and its ⌘K / Ctrl+K shortcut is registered once. Like
 * the app outside a context, the islands resolve to the default context, so
 * the preview keeps that tint rather than following the page's scope switch.
 */
export function TopBarSection() {
  const t = useTranslations("Styleguide.navigationPage.topBar");
  const tCommon = useTranslations("Common");
  const { workspaces, profile, schedule } = useSampleShellData();

  return (
    <StyleguideSection tier="signature" id="top-bar" title={t("title")} description={t("description")}>
      <ShellProvider workspaces={workspaces} profile={profile}>
        <PreviewFrame label={t("caption")} contentClassName="p-3 sm:p-4">
          <div data-scope={defaultContextId} className="min-w-240">
            <TopBar
              homeLabel={t("home")}
              contextSwitcher={<ShellContextSwitcher />}
              schedule={
                <ScheduleIsland date={schedule.date} now={schedule.now} blocks={schedule.blocks} label={t("scheduleLabel")} />
              }
              actions={<ShellActions />}
            />
          </div>
        </PreviewFrame>
      </ShellProvider>

      <PreviewFrame label={t("assistantCaption")} contentClassName="flex justify-end">
        {/* The FAB positions itself (fixed, lg+); here it is put back in flow. */}
        <AssistantFab
          className="static inline-flex"
          onClick={() => toast({ tone: "neutral", title: t("assistant"), description: tCommon("comingSoon") })}
        />
      </PreviewFrame>
    </StyleguideSection>
  );
}
