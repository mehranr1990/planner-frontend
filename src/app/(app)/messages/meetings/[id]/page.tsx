import { Suspense } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { MeetingPage } from "@/features/messages/meetings/meeting-page";

export const instant = false;

type Params = Promise<{ id: string }>;

async function Body({ params }: { params: Params }) {
  const { id } = await params;
  return <MeetingPage id={decodeURIComponent(id)} />;
}

/** MT-02 · /messages/meetings/[id]. */
export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<AccessLoading />}>
      <Body params={params} />
    </Suspense>
  );
}
