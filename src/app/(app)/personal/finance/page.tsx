import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata, PersonalSkeleton } from "@/features/personal/personal-skeleton";
import { SearchParamsProbe } from "@/features/personal/seams";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("finance");
}

export default function FinancePage() {
  return (
    <PersonalSkeleton page="finance">
      <Suspense fallback={null}>
        <SearchParamsProbe names={["tab","month"]} />
      </Suspense>
    </PersonalSkeleton>
  );
}
