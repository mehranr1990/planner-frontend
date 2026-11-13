import { notFound } from "next/navigation";
import { CompanyModulePlaceholder } from "@/features/companies/company-module-placeholder";
import { companyModuleSegments } from "@/features/companies/company-modules";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/**
 * /companies/[id]/<module> for every company module that is not built yet
 * (coming soon); built modules get their own static segment, which wins over
 * this dynamic one. Unknown segments are a 404.
 */
export default async function CompanyModulePage({ params }: { params: Promise<{ id: string; module: string }> }) {
  const { module } = await params;
  const item = Object.hasOwn(companyModuleSegments, module) ? companyModuleSegments[module] : undefined;
  if (!item) notFound();
  return <CompanyModulePlaceholder module={item} />;
}
