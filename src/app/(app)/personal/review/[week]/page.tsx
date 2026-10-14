import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata, PersonalSkeleton } from "@/features/personal/personal-skeleton";
import { RouteParamProbe } from "@/features/personal/route-param-probe";
import { SearchParamsProbe } from "@/features/personal/seams";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("review");
}

type Params = Promise<{ week: string }>;

async function Param({ params }: { params: Params }) {
  const { week } = await params;
  return <RouteParamProbe name="week" value={week} />;
}

export default function WeeklyReviewPage({ params }: { params: Params }) {
  return (
    <PersonalSkeleton page="review">
      <Suspense fallback={null}>
        <Param params={params} />
      </Suspense>
      <Suspense fallback={null}>
        <SearchParamsProbe names={["step"]} />
      </Suspense>
    </PersonalSkeleton>
  );
}
