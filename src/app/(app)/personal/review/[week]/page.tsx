import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { personalPageMetadata } from "@/features/personal/page-metadata";
import { WeeklyReviewScreen } from "@/features/review/review-screen";
import { parseDateParam } from "@/lib/dates/date-param";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return personalPageMetadata("review");
}

type Params = Promise<{ week: string }>;

async function Review({ params }: { params: Params }) {
  const { week } = await params;
  if (!parseDateParam(week)) notFound();
  return <WeeklyReviewScreen weekParam={week} />;
}

/**
 * P16 · Weekly review: /personal/review/:week (:week = Jalali date of the
 * week's first day, e.g. 1405-07-18). A contextual flow (no nav item);
 * ?step=wins|carry|goals|plan|reflect is read by the screen.
 */
export default function WeeklyReviewPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Review params={params} />
    </Suspense>
  );
}
