"use client";

import { usePathname } from "next/navigation";
import { useTeamAccess } from "@/data/team-queries";
import { getTeamIdFromPathname } from "@/features/navigation/paths";
import { teamDemoAccessOptions, useTeamDemoState } from "./demo-state";

/*
 * The team in the URL (/teams/[id]/…) with the viewer's access answer, for
 * shell islands outside the team layout (rail, mobile More, switcher, sheet
 * host). Shares the gate's query, demo preview included.
 */
export function useCurrentTeamAccess() {
  const teamId = getTeamIdFromPathname(usePathname());
  const demo = useTeamDemoState();
  const query = useTeamAccess(teamId, teamDemoAccessOptions(demo));
  const access = query.data;
  return {
    teamId,
    query,
    team: access?.status === "ok" ? access.team : undefined,
    capabilities: access?.status === "ok" ? access.capabilities : undefined,
  };
}
