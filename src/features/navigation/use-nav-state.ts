"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { ProjectModule } from "@/data/project-domain";
import { useInboxCount } from "@/data/queries";
import { useWorkspaceMentions } from "@/data/messaging-queries";
import { useCurrentProjectAccess } from "@/features/projects/use-current-project";
import type { TeamModule } from "@/data/team-domain";
import { useCurrentTeamAccess } from "@/features/teams/use-current-team";
import type { CompanyModule } from "@/data/company-domain";
import { useCurrentCompanyAccess } from "@/features/companies/use-current-company";
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

// Channels show for every workspace member: which channels they see is decided by the messaging server (MS-03).
const ALWAYS_VISIBLE = new Set<string>(["overview", "tasks", "channels"]);
const TEAM_ALWAYS_VISIBLE = new Set<string>(["overview", "work", "channels"]);
const COMPANY_ALWAYS_VISIBLE = new Set<string>(["overview", "work", "channels"]);

/** Whether a nav item is shown in this context, given the hidden modules. */
export function useNavItemFilter(context: AppContext): (item: NavItem) => boolean {
  const settings = usePlannerSettings();
  const personal = context.id === "personal";
  const { capabilities } = useCurrentProjectAccess();
  const inProject = context.id === "project" && context.workspaceId !== undefined;
  const { capabilities: teamCapabilities } = useCurrentTeamAccess();
  const inTeam = context.id === "team" && context.workspaceId !== undefined;
  const { capabilities: companyCapabilities } = useCurrentCompanyAccess();
  const inCompany = context.id === "company" && context.workspaceId !== undefined;
  return useCallback(
    (item: NavItem) => {
      // Inside a company (CS-01): hidden when the role can't open it (until loaded: Overview and Work).
      if (inCompany) {
        if (COMPANY_ALWAYS_VISIBLE.has(item.id)) return true;
        return companyCapabilities?.modules[item.id as CompanyModule] === true;
      }
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
    [personal, settings, inProject, capabilities, inTeam, teamCapabilities, inCompany, companyCapabilities],
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
  const { company } = useCurrentCompanyAccess();
  const channelsWorkspace = item.badge === "channels" ? /^\/(?:projects|teams|companies)\/([^/]+)\//.exec(item.href)?.[1] : undefined;
  const mentions = useWorkspaceMentions(channelsWorkspace ? decodeURIComponent(channelsWorkspace) : undefined);
  if (item.badge === "channels") {
    // Rail badge = unread mentions in this workspace's channels (MS-01).
    const count = mentions.data ?? 0;
    if (count <= 0) return undefined;
    const shown = formatNumber(count, digits);
    return { count: shown, label: t("channels", { count: shown }) };
  }
  if (item.badge === "approvals") {
    // Rail badge = approvals waiting for me (CO-09).
    const waiting = company?.approvalsForMe ?? 0;
    if (waiting <= 0) return undefined;
    const shown = formatNumber(waiting, digits);
    return { count: shown, label: t("approvals", { count: shown }) };
  }
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
