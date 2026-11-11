"use client";

import { useTranslations } from "next-intl";
import type { PresenceStatus, TeamRole } from "@/data/team-domain";

/** Localised labels for team enums (roles, manual status). */
export function useTeamLabels() {
  const t = useTranslations("Teams.roles");
  const tStatus = useTranslations("Team.status");
  return {
    role: (role: TeamRole) => t(role),
    status: (status: PresenceStatus | null) => tStatus(status ?? "none"),
  };
}
