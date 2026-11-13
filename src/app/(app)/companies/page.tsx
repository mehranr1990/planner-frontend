import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccessLoading } from "@/components/feedback/access-state";
import { AllCompaniesScreen } from "@/features/companies/all/all-companies-screen";

// Localised from the preferences cookie, so navigating here waits for the
// server (same decision as the root layout): opt out of instant validation.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Company");
  return { title: t("title") };
}

/** CO-00 · All companies: /companies. */
export default function CompaniesPage() {
  return (
    <Suspense fallback={<AccessLoading />}>
      <AllCompaniesScreen />
    </Suspense>
  );
}
