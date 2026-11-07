import { SettingsScreen } from "@/features/projects/settings/settings-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** PJ-14 · Project settings: /projects/[id]/settings?tab=general|workflow|fields|access|import|lifecycle. */
export default function ProjectSettingsPage() {
  return <SettingsScreen />;
}
