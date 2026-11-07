"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { ContextSwitcherPanel } from "@/components/navigation/context-switcher-panel";
import { ContextSwitcherTrigger } from "@/components/navigation/context-switcher-trigger";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMyInvitations, useProjectDirectory } from "@/data/project-queries";
import { getAppContext, projectHref } from "@/features/navigation/contexts";
import type { ContextId } from "@/features/navigation/types";
import { ProjectSwitcherList } from "@/features/projects/shell/project-switcher-list";
import { useOpenProjectSheet } from "@/features/projects/sheets/project-sheet-params";
import { useCurrentProjectAccess } from "@/features/projects/use-current-project";
import { useActiveWorkspace, useShell } from "./shell-provider";
import { useRouteScopedOpen, useShellScope } from "./use-shell-ui";

/*
 * Top-bar context switcher (Shell board · SH01): the context pill opens the
 * panel of contexts and their workspaces. Personal has one space; Projects
 * lists the project directory in sections (Recent · Owned · Member ·
 * Invitations · Archived) from the project repository; Teams / Companies stay
 * disabled until their phase. Choosing a project navigates to /projects/[id]
 * (the URL is the source of truth).
 *
 * The panel carries its own surface, so it renders through the unstyled
 * PopoverContent (asChild): portal, dir, z-index, transform origin and the
 * pop animation come from the primitive, without a second surface.
 *
 * variant="header": the same switcher behind the mobile header identity
 * ("Personal · Mehran"). variant="sheet": the mobile Projects header, where
 * the switcher is a full-height bottom sheet (SH01 Mobile).
 */
export function ShellContextSwitcher({ variant = "pill" }: { variant?: "pill" | "header" | "sheet" }) {
  const t = useTranslations("Navigation");
  const router = useRouter();
  const scope = useShellScope();
  const { workspaces, activeWorkspaceIds, selectWorkspace } = useShell();
  const workspace = useActiveWorkspace(scope);
  const [open, setOpen] = useRouteScopedOpen();
  const directory = useProjectDirectory();
  const invitations = useMyInvitations();
  const current = useCurrentProjectAccess();
  const openSheet = useOpenProjectSheet();

  // Projects: the directory replaces the sample workspace list.
  const panelWorkspaces = useMemo(
    () => ({
      ...workspaces,
      project: (directory.data?.projects ?? []).map((project) => ({
        id: project.id,
        name: project.name,
      })),
    }),
    [workspaces, directory.data],
  );
  const contextLabel = t(getAppContext(scope).labelKey);
  const name = scope === "project" ? (current.project?.name ?? contextLabel) : (workspace?.name ?? contextLabel);
  const activeWorkspaceId = scope === "project" ? current.projectId : activeWorkspaceIds[scope];

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const panel = (
    <ContextSwitcherPanel
      activeContext={scope}
      activeWorkspaceId={activeWorkspaceId}
      workspaces={panelWorkspaces}
      data-scope={scope}
      className={
        variant === "sheet"
          ? "w-full max-w-none bg-transparent p-0 shadow-none"
          : "max-h-(--radix-popover-content-available-height) overflow-y-auto"
      }
      onSelect={(context: ContextId, workspaceId) => {
        selectWorkspace(context, workspaceId);
        go(context === "project" ? projectHref(workspaceId) : getAppContext(context).basePath);
      }}
      projects={
        <ProjectSwitcherList
          directory={directory.data}
          invitations={invitations.data ?? []}
          activeProjectId={current.projectId}
          onOpen={(projectId) => go(projectHref(projectId))}
          onAllProjects={() => go("/projects")}
          onNewProject={() => {
            setOpen(false);
            openSheet("project-new");
          }}
        />
      }
    />
  );

  const headerButton = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={variant === "sheet" ? open : undefined}
      data-slot="mobile-context"
      onClick={variant === "sheet" ? () => setOpen(true) : undefined}
      className="group flex min-h-touch min-w-0 flex-1 items-center gap-1.5 rounded-row text-start text-fg"
    >
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-xs font-semibold text-fg-secondary group-aria-expanded:text-scope-deep">
          {contextLabel}
        </span>
        <bdi className="truncate type-title">{name}</bdi>
      </span>
      <Icon icon={ChevronDown} size={16} className="shrink-0 transition-transform group-aria-expanded:rotate-180" />
      <span className="sr-only">{t("switcher.label")}</span>
    </button>
  );

  if (variant === "sheet") {
    return (
      <>
        {headerButton}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" title={t("switcher.label")} data-scope={scope} className="max-h-[92dvh]">
            {panel}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "header" ? (
          headerButton
        ) : (
          <ContextSwitcherTrigger context={scope} workspaceName={name} className="max-w-64" />
        )}
      </PopoverTrigger>
      <PopoverContent unstyled asChild align="start" aria-label={t("switcher.label")}>
        {panel}
      </PopoverContent>
    </Popover>
  );
}
