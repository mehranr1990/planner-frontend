import { Suspense } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { MinutesScreen } from "@/features/messages/meetings/minutes-screen";

export const instant = false;

type Params = Promise<{ id: string }>;

async function Body({ params }: { params: Params }) {
  const { id } = await params;
  return <MinutesScreen id={decodeURIComponent(id)} />;
}

/** MT-03 · /messages/meetings/[id]/minutes. */
export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <Body params={params} />
    </Suspense>
  );
}
