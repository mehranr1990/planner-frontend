import { RisksScreen } from "@/features/projects/risks/risks-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-09 · Risks & issues: /projects/[id]/risks (?view=issues = Issues segment). */
export default function ProjectRisksPage() {
  return <RisksScreen />;
}
