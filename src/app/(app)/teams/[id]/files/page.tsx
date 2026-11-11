import { TeamFilesScreen } from "@/features/teams/files/team-files-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-11 · Team files: /teams/[id]/files, inside the team gate. */
export default function TeamFilesPage() {
  return <TeamFilesScreen />;
}
