"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ContextId } from "@/features/navigation/types";
import { sampleWorkspaces } from "@/fixtures/shell";
import { useSampleShellData } from "./use-sample-shell-data";
import { PreviewScopeControl } from "./preview-scope-control";
import { LiveShellSection } from "./sections/navigation/live-shell-section";
import { MobileSection } from "./sections/navigation/mobile-section";
import { NavListSection } from "./sections/navigation/nav-list-section";
import { PageHeaderSection } from "./sections/navigation/page-header-section";
import { RailSection } from "./sections/navigation/rail-section";
import { ScheduleSection } from "./sections/navigation/schedule-section";
import { SwitcherSection } from "./sections/navigation/switcher-section";
import { TopBarSection } from "./sections/navigation/top-bar-section";
import { StyleguideMessages } from "./styleguide-messages";
import { StyleguideShell } from "./styleguide-shell";

type WorkspaceSelection = Record<ContextId, string>;

const firstWorkspaces: WorkspaceSelection = {
  personal: sampleWorkspaces.personal[0]?.id ?? "",
  project: sampleWorkspaces.project[0]?.id ?? "",
  team: sampleWorkspaces.team[0]?.id ?? "",
  company: sampleWorkspaces.company[0]?.id ?? "",
};

/** /styleguide/navigation: navigation and shell parts, previewed in frames. */
function NavigationViewContent() {
  const t = useTranslations("Styleguide");
  const [context, setContext] = useState<ContextId>("personal");
  // Remembers the chosen workspace per context, as the real switcher will.
  const [workspaces, setWorkspaces] = useState<WorkspaceSelection>(firstWorkspaces);
  const workspaceId = workspaces[context];
  const { workspaces: sampleNames } = useSampleShellData();
  const workspaceName =
    sampleNames[context].find((workspace) => workspace.id === workspaceId)?.name ?? sampleNames[context][0]?.name ?? "";

  const select = (nextContext: ContextId, nextWorkspace: string) => {
    setContext(nextContext);
    setWorkspaces((current) => ({ ...current, [nextContext]: nextWorkspace }));
  };

  const workspaceProps = { context, workspaceId, workspaceName, onSelect: select };

  return (
    <StyleguideShell
      current="navigation"
      overline={t("navigationPage.overline")}
      title={t("navigationPage.title")}
      intro={t("navigationPage.intro")}
      scope={context}
      toolbar={<PreviewScopeControl scope={context} onScopeChange={setContext} description={t("navigationPage.scopeHint")} />}
    >
      <LiveShellSection />
      <TopBarSection />
      <SwitcherSection {...workspaceProps} />
      <RailSection context={context} />
      <MobileSection context={context} />
      <PageHeaderSection context={context} workspaceName={workspaceName} />
      <NavListSection context={context} />
      <ScheduleSection />
    </StyleguideShell>
  );
}

export function NavigationView() {
  return (
    <StyleguideMessages>
      <NavigationViewContent />
    </StyleguideMessages>
  );
}
