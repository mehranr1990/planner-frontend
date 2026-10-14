"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ContextSwitcherPanel } from "@/components/navigation/context-switcher-panel";
import { ContextSwitcherTrigger } from "@/components/navigation/context-switcher-trigger";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAppContext } from "@/features/navigation/contexts";
import { useActiveWorkspace, useShell } from "./shell-provider";
import { useRouteScopedOpen, useShellScope } from "./use-shell-ui";

/*
 * Top-bar context switcher (Shell board): the context pill opens the panel
 * of contexts and their workspaces. Choosing a workspace remembers it for
 * that context (UI state only) and goes to the context's overview.
 *
 * The panel carries its own surface, so it renders through the unstyled
 * PopoverContent (asChild): portal, dir, z-index, transform origin and the
 * pop animation come from the primitive, without a second surface.
 */
export function ShellContextSwitcher() {
  const t = useTranslations("Navigation");
  const router = useRouter();
  const scope = useShellScope();
  const { workspaces, activeWorkspaceIds, selectWorkspace } = useShell();
  const workspace = useActiveWorkspace(scope);
  const [open, setOpen] = useRouteScopedOpen();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ContextSwitcherTrigger
          context={scope}
          workspaceName={workspace?.name ?? t(getAppContext(scope).labelKey)}
          className="max-w-64"
        />
      </PopoverTrigger>
      <PopoverContent unstyled asChild align="start" aria-label={t("switcher.label")}>
        <ContextSwitcherPanel
          activeContext={scope}
          activeWorkspaceId={activeWorkspaceIds[scope]}
          workspaces={workspaces}
          data-scope={scope}
          className="max-h-(--radix-popover-content-available-height) overflow-y-auto"
          onSelect={(context, workspaceId) => {
            selectWorkspace(context, workspaceId);
            setOpen(false);
            router.push(getAppContext(context).basePath);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
