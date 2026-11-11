import { TeamSettingsScreen } from "@/features/teams/settings/team-settings-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-14 · Team settings: /teams/[id]/settings?tab=…, inside the team gate. */
export default function TeamSettingsPage() {
  return <TeamSettingsScreen />;
}
