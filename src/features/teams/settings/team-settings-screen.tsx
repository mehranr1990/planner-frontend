"use client";

import { Archive, CalendarClock, ChevronLeft, ChevronRight, Pencil, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import { useTeamSettings } from "@/data/team-queries";
import { DirtyContext } from "@/features/projects/settings/settings-shared";
import { useMediaQuery } from "@/features/projects/use-media";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";
import { AccessTab, GeneralTab, LifecycleTab, PlanningTab } from "./team-settings-tabs";

/*
 * TM-14 · Team settings (/teams/[id]/settings?tab=general · planning ·
 * access · lifecycle), one page with FolderTabs (members live on People).
 * Reuses the PJ-14 settings pieces (dirty registry + sticky bar, setting
 * rows, reauth dialog). Tabs a role can see but not change are read-only
 * with the reason (SH-02). Phones: a settings root list, each tab its own
 * page; check-in schedule editing is not on phones.
 */

export const TEAM_SETTINGS_TABS = ["general", "planning", "access", "lifecycle"] as const;
export type TeamSettingsTab = (typeof TEAM_SETTINGS_TABS)[number];

const ICONS: Record<TeamSettingsTab, typeof Pencil> = {
  general: Pencil,
  planning: CalendarClock,
  access: ShieldCheck,
  lifecycle: Archive,
};

export function TeamSettingsScreen() {
  const t = useTranslations("TeamSettings");
  const tProject = useTranslations("ProjectSettings");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { team } = useTeam();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const settings = useTeamSettings(team.id);
  const raw = params.get("tab");
  const tab: TeamSettingsTab = (TEAM_SETTINGS_TABS as readonly string[]).includes(raw ?? "") ? (raw as TeamSettingsTab) : "general";
  const dirtyRef = useRef(false);
  const [pending, setPending] = useState<TeamSettingsTab | null>(null);
  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const registry = useMemo(() => ({ setDirty }), [setDirty]);

  const go = (next: TeamSettingsTab | null) => {
    const query = new URLSearchParams(params.toString());
    if (next) query.set("tab", next);
    else query.delete("tab");
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ""}`, { scroll: false });
  };
  const request = (next: TeamSettingsTab | null) => {
    if (next === tab && raw) return;
    if (dirtyRef.current) setPending(next ?? "general");
    else go(next);
  };

  const header = <TeamPageHeader module="settings" title={t("title")} />;
  if (settings.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void settings.refetch()} />
      </>
    );
  }
  if (!settings.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const data = settings.data;
  const content: Record<TeamSettingsTab, ReactNode> = {
    general: <GeneralTab key={data.revision} settings={data} />,
    planning: <PlanningTab settings={data} phone={phone} />,
    access: <AccessTab settings={data} />,
    lifecycle: <LifecycleTab />,
  };

  const confirmLeave = pending ? (
    <Dialog open onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent title={tProject("dirty.leaveTitle")} description={tProject("dirty.leaveBody")} size="sm" data-scope="team">
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPending(null)}>
            {tProject("dirty.stay")}
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
            {tProject("dirty.leave")}
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
          <section aria-labelledby="team-settings-tab" className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => request(null)}
              className="inline-flex items-center gap-1 self-start text-sm font-semibold text-fg-secondary focus-visible:focus-ring"
            >
              <Icon icon={ChevronLeft} size={16} mirror />
              {t("back")}
            </button>
            <h2 id="team-settings-tab" className="type-title text-fg">
              {t(`tab.${tab}`)}
            </h2>
            <div className="rounded-[24px] bg-surface p-4">{content[tab]}</div>
          </section>
        ) : (
          <nav aria-label={t("tabsLabel")}>
            <ul className="flex flex-col overflow-hidden rounded-[24px] bg-surface">
              {TEAM_SETTINGS_TABS.map((value) => (
                <li key={value} className="border-b border-hairline last:border-b-0">
                  <Link href={`${pathname}?tab=${value}`} className="flex min-h-14 items-center gap-3 px-4 py-2 focus-visible:focus-ring">
                    <Icon icon={ICONS[value]} size={18} className="text-fg-secondary" />
                    <span className="min-w-0 flex-1 text-sm font-bold text-fg">{t(`tab.${value}`)}</span>
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

  const tabs: FolderTab[] = TEAM_SETTINGS_TABS.map((value) => ({
    value,
    label: t(`tab.${value}`),
    content: tab === value ? content[value] : null,
  }));

  return (
    <DirtyContext.Provider value={registry}>
      {header}
      <FolderTabsCard label={t("tabsLabel")} tabs={tabs} value={tab} onValueChange={(value) => request(value as TeamSettingsTab)} />
      {confirmLeave}
    </DirtyContext.Provider>
  );
}
