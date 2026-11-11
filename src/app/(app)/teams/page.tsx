import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessLoading } from "@/components/feedback/access-state";
import { AllTeamsScreen } from "@/features/teams/all/all-teams-screen";

// Localised from the preferences cookie, so navigating here waits for the
// server (same decision as the root layout): opt out of instant validation.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Teams");
  return { title: t("title") };
}

/** TM-00 · All teams: /teams (?state= demo states in mock mode). */
export default function TeamsPage() {
  return (
    <Suspense fallback={<AccessLoading />}>
      <AllTeamsScreen />
    </Suspense>
  );
}
