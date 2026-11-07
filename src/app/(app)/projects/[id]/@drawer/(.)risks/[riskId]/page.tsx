import { Suspense } from "react";
import { RiskDrawer } from "@/features/projects/risks/risk-drawer";

type Params = Promise<{ riskId: string }>;

async function Drawer({ params }: { params: Params }) {
  const { riskId } = await params;
  return <RiskDrawer riskId={decodeURIComponent(riskId)} />;
}

/** Soft navigation inside a project: the PJ-16 risk drawer over the register it was opened from. */
export default function InterceptedProjectRiskDetail({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Drawer params={params} />
    </Suspense>
  );
}
