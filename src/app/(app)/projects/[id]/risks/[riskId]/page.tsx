import { Suspense } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { RiskDetailView } from "@/features/projects/risks/risk-detail-view";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

type Params = Promise<{ riskId: string }>;

async function Detail({ params }: { params: Params }) {
  const { riskId } = await params;
  return <RiskDetailView riskId={decodeURIComponent(riskId)} variant="page" />;
}

/** PJ-16 full page: hard navigation (shared link, refresh) and phones. */
export default function ProjectRiskDetailPage({ params }: { params: Params }) {
  return (
    <section className="mx-auto flex w-full max-w-[560px] flex-col">
      <Suspense fallback={<AccessLoading />}>
        <Detail params={params} />
      </Suspense>
    </section>
  );
}
