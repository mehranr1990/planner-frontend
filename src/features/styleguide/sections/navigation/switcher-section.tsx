"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ContextSwitcherPanel } from "@/components/navigation/context-switcher-panel";
import { ContextSwitcherTrigger } from "@/components/navigation/context-switcher-trigger";
import type { ContextId } from "@/features/navigation/types";
import { useSampleShellData } from "../../use-sample-shell-data";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

interface SwitcherSectionProps {
  context: ContextId;
  workspaceId: string;
  workspaceName: string;
  onSelect: (context: ContextId, workspaceId: string) => void;
}

/**
 * Trigger + panel rendered inline (no popover) so both are always visible.
 * Choosing a workspace switches the preview context of the whole page.
 */
export function SwitcherSection({ context, workspaceId, workspaceName, onSelect }: SwitcherSectionProps) {
  const t = useTranslations("Styleguide.navigationPage.switcher");
  const { workspaces } = useSampleShellData();
  const panelId = useId();
  const [open, setOpen] = useState(true);

  return (
    <StyleguideSection tier="signature" id="switcher" span="half" title={t("title")} description={t("description")}>
      <PreviewFrame label={t("caption")} contentClassName="flex min-h-136 flex-col items-start gap-3">
        <ContextSwitcherTrigger
          context={context}
          workspaceName={workspaceName}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((value) => !value)}
        />
        {open ? (
          <ContextSwitcherPanel
            key={context}
            id={panelId}
            className="w-full max-w-85"
            activeContext={context}
            activeWorkspaceId={workspaceId}
            workspaces={workspaces}
            onSelect={onSelect}
          />
        ) : null}
      </PreviewFrame>
    </StyleguideSection>
  );
}
