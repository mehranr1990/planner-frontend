import { Suspense } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ConversationRoute } from "@/features/messages/conversation-route";

export const instant = false;

/** MS-02 / MS-06 / MS-08 · /messages/[cid] (+ /thread/[mid] · /info panels). */
export default function ConversationPage() {
  return (
    <Suspense fallback={<AccessLoading />}>
      <ConversationRoute />
    </Suspense>
  );
}
