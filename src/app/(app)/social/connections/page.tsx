import { ConnectionsScreen } from "@/features/social/connections/connections-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-02 · Connections & circles: /social/connections */
export default function Page() {
  return <ConnectionsScreen />;
}
