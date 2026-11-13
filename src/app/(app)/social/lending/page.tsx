import { MyThingsScreen } from "@/features/social/things/my-things-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-18 · My things & lending */
export default function Page() {
  return <MyThingsScreen />;
}
