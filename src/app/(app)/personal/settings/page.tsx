import type { Metadata } from "next";
import { personalPageMetadata, PersonalSkeleton } from "@/features/personal/personal-skeleton";
import { ModuleSwitches, SettingsDefaults } from "@/features/personal/settings-harness";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("settings");
}

export default function SettingsPage() {
  return (
    <>
      <PersonalSkeleton page="settings" />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <ModuleSwitches />
        <SettingsDefaults />
      </div>
    </>
  );
}
