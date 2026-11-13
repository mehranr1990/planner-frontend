import { GroupSettingsScreen } from "@/features/social/settings/group-settings-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-14 · Group settings & leave */
export default function Page() {
  return <GroupSettingsScreen />;
}
