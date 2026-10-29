import type { Metadata } from "next";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { SettingsScreen } from "@/features/settings/settings-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("settings");
}

/** P17 · Settings: one page, in-page index; groups are utility cards. Core module: never hidden. */
export default function SettingsPage() {
  return <SettingsScreen />;
}
