import { Suspense } from "react";
import type { Metadata } from "next";
import { personalPageMetadata, PersonalSkeleton } from "@/features/personal/personal-skeleton";
import { RouteParamProbe } from "@/features/personal/route-param-probe";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("journal");
}

type Params = Promise<{ date?: string[] }>;

async function Param({ params }: { params: Params }) {
  const { date } = await params;
  return <RouteParamProbe name="date" value={date?.join("/")} />;
}

export default function JournalPage({ params }: { params: Params }) {
  return (
    <PersonalSkeleton page="journal">
      <Suspense fallback={null}>
        <Param params={params} />
      </Suspense>
    </PersonalSkeleton>
  );
}
