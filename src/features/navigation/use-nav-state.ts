"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { ProjectModule } from "@/data/project-domain";
import { useInboxCount } from "@/data/queries";
import { useCurrentProjectAccess } from "@/features/projects/use-current-project";
import type { TeamModule } from "@/data/team-domain";
import { useCurrentTeamAccess } from "@/features/teams/use-current-team";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { isCoreModule, isOptionalModule } from "@/features/planner-settings/modules";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import type { AppContext, NavItem } from "./types";

/*
 * Live navigation state for the Personal context: hidden modules (P17) leave
 * the rail, the More sheet and search; the Inbox carries its untriaged count
 * (P07). Inside a project (SH01) items the role cannot open are hidden, not
 * disabled (capabilities from the repository; until they load only Overview
 * and Tasks show), and Risks carries the open high-risk count. Inside a team
 * (TS-01) the same rule applies (until they load only Overview and Work show)
 * and Check-ins carries "your reply missing".
 */

const ALWAYS_VISIBLE = new Set<string>(["overview", "tasks"]);
const TEAM_ALWAYS_VISIBLE = new Set<string>(["overview", "work"]);

/** Whether a nav item is shown in this context, given the hidden modules. */
export function useNavItemFilter(context: AppContext): (item: NavItem) => boolean {
  const settings = usePlannerSettings();
  const personal = context.id === "personal";
  const { capabilities } = useCurrentProjectAccess();
  const inProject = context.id === "project" && context.workspaceId !== undefined;
  const { capabilities: teamCapabilities } = useCurrentTeamAccess();
  const inTeam = context.id === "team" && context.workspaceId !== undefined;
  return useCallback(
    (item: NavItem) => {
      if (inTeam) {
        if (TEAM_ALWAYS_VISIBLE.has(item.id)) return true;
        return teamCapabilities?.modules[item.id as TeamModule] === true;
      }
      if (inProject) {
        if (ALWAYS_VISIBLE.has(item.id)) return true;
        return capabilities?.modules[item.id as ProjectModule] === true;
      }
      return !personal || isCoreModule(item.id) || !isOptionalModule(item.id) || isModuleVisible(settings, item.id);
    },
    [personal, settings, inProject, capabilities, inTeam, teamCapabilities],
  );
}

/** The visible count badge for an item, or undefined (no badge item, loading, or zero). */
export function useNavBadge(item: NavItem): { count: string; label: string } | undefined {
  const t = useTranslations("Navigation.badges");
  const { digits } = usePreferences();
  // Always called (hooks order); the query is shared and cheap.
  const inbox = useInboxCount();
  const { project } = useCurrentProjectAccess();
  const { team } = useCurrentTeamAccess();
  if (item.badge === "checkins") {
    if (!team?.checkinMissing) return undefined;
    const shown = formatNumber(1, digits);
    return { count: shown, label: t("checkins") };
  }
  if (item.badge === "risks") {
    const risks = project?.openHighRisks ?? 0;
    if (risks <= 0) return undefined;
    const shown = formatNumber(risks, digits);
    return { count: shown, label: t("risks", { count: shown }) };
  }
  if (item.badge !== "inbox") return undefined;
  const count = inbox.data ?? 0;
  if (count <= 0) return undefined;
  const visible = formatNumber(count, digits);
  return { count: visible, label: t("inbox", { count: visible }) };
}
