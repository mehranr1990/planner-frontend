import { TeamProjectsScreen } from "@/features/teams/projects/team-projects-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-06 · Team projects: /teams/[id]/projects (portfolio table · timeline), inside the team gate. */
export default function TeamProjectsPage() {
  return <TeamProjectsScreen />;
}
