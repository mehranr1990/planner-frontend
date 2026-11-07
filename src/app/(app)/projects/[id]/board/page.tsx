import { ProjectBoardScreen } from "@/features/projects/board/project-board-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-03 · Project board: /projects/[id]/board (Tasks view mode; ?lanes, q and filters in the URL). */
export default function ProjectBoardPage() {
  return <ProjectBoardScreen />;
}
