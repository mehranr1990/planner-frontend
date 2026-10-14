import type { Metadata } from "next";
import { personalPageMetadata, PersonalSkeleton } from "@/features/personal/personal-skeleton";
import { InboxCountProbe } from "@/features/personal/seams";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("overview");
}

export default function PersonalOverviewPage() {
  return (
    <PersonalSkeleton page="overview">
      <InboxCountProbe />
    </PersonalSkeleton>
  );
}
