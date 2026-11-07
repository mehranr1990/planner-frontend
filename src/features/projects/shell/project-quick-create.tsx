"use client";

import {
  Flag,
  FolderPlus,
  Paperclip,
  Plus,
  ShieldAlert,
  SquareCheck,
  User,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useRouteScopedOpen } from "@/components/shell/use-shell-ui";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useOpenProjectSheet, type ProjectSheetId } from "../sheets/project-sheet-params";
import { useCurrentProjectAccess } from "../use-current-project";

/*
 * Quick Create in Projects (SH01 "Breadcrumb · Quick create"). The target is
 * explicit: every entry names the workspace it writes to, and "Personal task
 * instead" is a separate, labelled way out — never a silent Personal create.
 * Capability gating: entries the role cannot use are disabled with a reason
 * (only for resources the user can see); hidden modules are left out.
 */

interface QuickCreateEntry {
  id: "task" | "milestone" | "risk" | "file" | "invite" | "project";
  icon: LucideIcon;
  label: string;
  /** Second line: target ("in Website Redesign"), role hint, or the disabled reason. */
  detail?: string;
  disabled: boolean;
  run: () => void;
}

function useEntries(): { entries: QuickCreateEntry[]; personal: () => void } {
  const t = useTranslations("ContextShell.quickCreate");
  const router = useRouter();
  const openSheet = useOpenProjectSheet();
  const { projectId, project, capabilities } = useCurrentProjectAccess();
  const go = (href: string) => router.push(href);
  const sheet = (id: ProjectSheetId) => openSheet(id);
  const personal = () => router.push("/personal?sheet=quick-add");

  if (!projectId) {
    return {
      entries: [
        {
          id: "project",
          icon: FolderPlus,
          label: t("newProject"),
          disabled: false,
          run: () => sheet("project-new"),
        },
      ],
      personal,
    };
  }
  if (!project || !capabilities) return { entries: [], personal };

  const entries: QuickCreateEntry[] = [
    {
      id: "task",
      icon: SquareCheck,
      label: t("task"),
      detail: capabilities.createTask ? t("inProject", { project: project.name }) : t("reasonViewer"),
      disabled: !capabilities.createTask,
      run: () => go(projectHref(projectId, "tasks")),
    },
  ];
  if (capabilities.modules.milestones) {
    entries.push({
      id: "milestone",
      icon: Flag,
      label: t("milestone"),
      detail: t("managerPlus"),
      disabled: !capabilities.createMilestone,
      run: () => go(projectHref(projectId, "milestones")),
    });
  }
  if (capabilities.modules.risks) {
    entries.push({
      id: "risk",
      icon: ShieldAlert,
      label: t("risk"),
      detail: t("memberPlus"),
      disabled: !capabilities.createRisk,
      run: () => go(projectHref(projectId, "risks")),
    });
  }
  if (capabilities.modules.files) {
    entries.push({
      id: "file",
      icon: Paperclip,
      label: t("file"),
      detail: t("memberPlus"),
      disabled: !capabilities.uploadFile,
      run: () => go(projectHref(projectId, "files")),
    });
  }
  if (capabilities.modules.members) {
    entries.push({
      id: "invite",
      icon: UserPlus,
      label: t("invite"),
      detail: capabilities.invite ? undefined : t("reasonInvite"),
      disabled: !capabilities.invite,
      run: () => sheet("project-invite"),
    });
  }
  return { entries, personal };
}

/** Desktop top-bar "+" in Projects. */
export function ProjectQuickCreateMenu() {
  const t = useTranslations("ContextShell.quickCreate");
  const [open, setOpen] = useRouteScopedOpen();
  const { entries, personal } = useEntries();
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <IconButton icon={Plus} label={t("label")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-scope="project" className="w-72">
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        {entries.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            icon={entry.icon}
            disabled={entry.disabled}
            aria-disabled={entry.disabled || undefined}
            onSelect={entry.run}
            className="h-auto min-h-11 py-1.5"
          >
            <span className="flex min-w-0 flex-col leading-snug">
              <span className="truncate">{entry.label}</span>
              {entry.detail ? (
                <bdi className="truncate text-xs font-medium text-fg-secondary">{entry.detail}</bdi>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={User} onSelect={personal}>
          {t("personalInstead")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Mobile (+) in Projects: the same entries as a bottom sheet. */
export function ProjectQuickAddSheet({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const t = useTranslations("ContextShell.quickCreate");
  const { entries, personal } = useEntries();
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" title={t("title")} data-scope="project" onCloseAutoFocus={onCloseAutoFocus}>
        <ul className="flex flex-col gap-1">
          {[
            ...entries.map((entry) => ({ ...entry, key: entry.id })),
            {
              key: "personal",
              id: "personal",
              icon: User,
              label: t("personalInstead"),
              detail: undefined,
              disabled: false,
              run: personal,
            },
          ].map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                aria-disabled={entry.disabled || undefined}
                onClick={() => {
                  if (!entry.disabled) run(entry.run);
                }}
                className={cn(
                  "flex min-h-touch w-full items-center gap-3 rounded-row px-3 py-2 text-start transition-colors",
                  entry.disabled ? "cursor-not-allowed text-fg-muted" : "text-fg hover:bg-subtle",
                  entry.key === "personal" && "mt-1 border-t border-line pt-3",
                )}
              >
                <Icon icon={entry.icon} className={entry.disabled ? "text-icon-muted" : "text-fg-secondary"} />
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <span className="truncate text-sm font-semibold">{entry.label}</span>
                  {entry.detail ? (
                    <bdi className="truncate text-xs font-medium text-fg-secondary">{entry.detail}</bdi>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
