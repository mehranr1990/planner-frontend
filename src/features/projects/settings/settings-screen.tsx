"use client";

import { ChevronLeft, ChevronRight, FileUp, GitBranch, ListTree, Pencil, ShieldCheck, Archive } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import { useFieldList, useWorkflowDraft } from "@/data/project-queries";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { useMediaQuery } from "../use-media";
import { AccessTab } from "./settings-access";
import { FieldsTab } from "./settings-fields";
import { GeneralTab } from "./settings-general";
import { ImportTab } from "./settings-import";
import { LifecycleTab } from "./settings-lifecycle";
import { DirtyContext } from "./settings-shared";
import { WorkflowTab } from "./settings-workflow";

/*
 * PJ-14 · Project settings (/projects/[id]/settings?tab=general · workflow ·
 * fields · access · import · lifecycle), one page with FolderTabs (D15;
 * members live on PJ-13). Unsaved General / Fields changes show the dirty
 * bar; switching tabs (or leaving the page) asks first. Tabs a role can see
 * but not change are read-only with the reason (SH-02 "disabled with a
 * reason"). Phones: a settings root list, each tab its own page, workflow
 * read-only (D18).
 */

export const SETTINGS_TABS = ["general", "workflow", "fields", "access", "import", "lifecycle"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const ICONS: Record<SettingsTab, typeof Pencil> = {
  general: Pencil,
  workflow: GitBranch,
  fields: ListTree,
  access: ShieldCheck,
  import: FileUp,
  lifecycle: Archive,
};

export function SettingsScreen() {
  const t = useTranslations("ProjectSettings");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const format = useProjectFormat();
  const { project } = useProject();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const draft = useWorkflowDraft(project.id);
  const fields = useFieldList(project.id);
  const raw = params.get("tab");
  const tab: SettingsTab = (SETTINGS_TABS as readonly string[]).includes(raw ?? "") ? (raw as SettingsTab) : "general";
  const dirtyRef = useRef(false);
  const [pending, setPending] = useState<SettingsTab | null>(null);
  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const registry = useMemo(() => ({ setDirty }), [setDirty]);

  const go = (next: SettingsTab | null) => {
    const query = new URLSearchParams(params.toString());
    if (next) query.set("tab", next);
    else query.delete("tab");
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ""}`, { scroll: false });
  };
  const request = (next: SettingsTab | null) => {
    if (next === tab && raw) return;
    if (dirtyRef.current) setPending(next ?? "general");
    else go(next);
  };

  const content: Record<SettingsTab, ReactNode> = {
    general: <GeneralTab />,
    workflow: <WorkflowTab readOnly={phone} />,
    fields: <FieldsTab />,
    access: <AccessTab />,
    import: <ImportTab phone={phone} />,
    lifecycle: <LifecycleTab />,
  };
  const counts: Partial<Record<SettingsTab, string>> = {
    workflow: draft.data ? t("draftChip", { n: format.number(draft.data.version) }) : undefined,
    fields: fields.data ? format.number(fields.data.length) : undefined,
  };

  const header = <ProjectPageHeader module="settings" title={t("title")} />;

  const confirmLeave = pending ? (
    <Dialog open onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent title={t("dirty.leaveTitle")} description={t("dirty.leaveBody")} size="sm" data-scope="project">
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPending(null)}>
            {t("dirty.stay")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              dirtyRef.current = false;
              const next = pending;
              setPending(null);
              go(next);
            }}
          >
            {t("dirty.leave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  if (phone) {
    return (
      <DirtyContext.Provider value={registry}>
        {header}
        {raw ? (
          <section aria-labelledby="settings-tab" className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => request(null)}
              className="inline-flex items-center gap-1 self-start text-sm font-semibold text-fg-secondary focus-visible:focus-ring"
            >
              <Icon icon={ChevronLeft} size={16} mirror />
              {t("back")}
            </button>
            <h2 id="settings-tab" className="type-title text-fg">
              {t(`tab.${tab}`)}
            </h2>
            <div className="rounded-[24px] bg-surface p-4">{content[tab]}</div>
          </section>
        ) : (
          <nav aria-label={t("tabsLabel")}>
            <ul className="flex flex-col overflow-hidden rounded-[24px] bg-surface">
              {SETTINGS_TABS.map((value) => (
                <li key={value} className="border-b border-hairline last:border-b-0">
                  <Link
                    href={`${pathname}?tab=${value}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 focus-visible:focus-ring"
                  >
                    <Icon icon={ICONS[value]} size={18} className="text-fg-secondary" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-bold text-fg">{t(`tab.${value}`)}</span>
                      {value === "workflow" ? (
                        <span className="text-xs font-medium text-fg-secondary">{t("phoneWorkflow")}</span>
                      ) : value === "import" ? (
                        <span className="text-xs font-medium text-fg-secondary">{t("phoneImport")}</span>
                      ) : value === "fields" && counts.fields ? (
                        <span className="text-xs font-medium text-fg-secondary">{counts.fields}</span>
                      ) : null}
                    </span>
                    <Icon icon={ChevronRight} size={16} mirror className="text-fg-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {confirmLeave}
      </DirtyContext.Provider>
    );
  }

  const tabs: FolderTab[] = SETTINGS_TABS.map((value) => ({
    value,
    label: t(`tab.${value}`),
    count: counts[value],
    content: tab === value ? content[value] : null,
  }));

  return (
    <DirtyContext.Provider value={registry}>
      {header}
      <FolderTabsCard label={t("tabsLabel")} tabs={tabs} value={tab} onValueChange={(value) => request(value as SettingsTab)} />
      {confirmLeave}
    </DirtyContext.Provider>
  );
}
