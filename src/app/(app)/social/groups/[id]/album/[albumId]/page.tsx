import { AlbumScreen } from "@/features/social/album/album-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** SO-11 · Album photos + lightbox */
export default function Page() {
  return <AlbumScreen />;
}
