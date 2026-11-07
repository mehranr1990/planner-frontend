"use client";

import { usePathname } from "next/navigation";
import { useProjectAccess } from "@/data/project-queries";
import { getProjectIdFromPathname } from "@/features/navigation/paths";
import { demoAccessOptions, useProjectDemoState } from "./demo-state";

/*
 * The project in the URL (/projects/[id]/…) with the user's access answer,
 * for shell islands outside the project layout (rail, Quick create, mobile
 * More, switcher). Shares the gate's query, demo preview included.
 */
export function useCurrentProjectAccess() {
  const projectId = getProjectIdFromPathname(usePathname());
  const demo = useProjectDemoState();
  const query = useProjectAccess(projectId, demoAccessOptions(demo));
  const access = query.data;
  return {
    projectId,
    query,
    project: access?.status === "ok" ? access.project : undefined,
    capabilities: access?.status === "ok" ? access.capabilities : undefined,
  };
}
