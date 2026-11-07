import { FilesScreen } from "@/features/projects/files/files-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-10 · Files: /projects/[id]/files (?folder = folder, ?file = previewed file). */
export default function ProjectFilesPage() {
  return <FilesScreen />;
}
