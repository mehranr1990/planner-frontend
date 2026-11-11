"use client";

import { useSearchParams } from "next/navigation";
import { isSprintTab, SprintScreen, SprintsOff } from "../sprint/sprint-screen";
import { useTeam } from "../team-gate";
import { PlanningScreen } from "./planning-screen";

/**
 * /teams/[id]/planning: the weekly plan (TM-04, default) or, when Settings ›
 * Planning › Sprints is on, Sprint & backlog (TM-05). Sprint tabs on a weekly
 * team show "This team plans weekly".
 */
export function TeamPlanningRoute() {
  const { team } = useTeam();
  const params = useSearchParams();
  if (team.planningMode === "sprints") return <SprintScreen />;
  if (isSprintTab(params.get("tab"))) return <SprintsOff />;
  return <PlanningScreen />;
}
