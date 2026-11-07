import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessLoading } from "@/components/feedback/access-state";
import { AllProjectsScreen } from "@/features/projects/all/all-projects-screen";

// Localised from the preferences cookie, so navigating here waits for the
// server (same decision as the root layout): opt out of instant validation.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Projects");
  return { title: t("title") };
}

/** PJ-00 · All projects: /projects (?state= demo states in mock mode). */
export default function ProjectsPage() {
  return (
    <Suspense fallback={<AccessLoading />}>
      <AllProjectsScreen />
    </Suspense>
  );
}
