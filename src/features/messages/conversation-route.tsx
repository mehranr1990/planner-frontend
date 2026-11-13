"use client";

import { useParams } from "next/navigation";
import { ConversationView, globalHrefs, type ConversationHrefs, type ConversationPanel } from "./conversation-view";
import { InfoPanel } from "./info/info-panel";
import { ThreadPanel } from "./thread/thread-panel";

/** Panel from the catch-all segments: [] · ["thread", mid] · ["info"]. */
export function panelFrom(segments: string[] | undefined): ConversationPanel {
  if (!segments?.length) return null;
  if (segments[0] === "thread" && segments[1]) return { kind: "thread", messageId: decodeURIComponent(segments[1]) };
  if (segments[0] === "info") return { kind: "info" };
  return null;
}

/** One conversation with its thread / info panel; shared by /messages and workspace Channels. */
export function ConversationRoute({ hrefs = globalHrefs, conversationId, panelSegments }: { hrefs?: ConversationHrefs; conversationId?: string; panelSegments?: string[] }) {
  const params = useParams<{ cid?: string; panel?: string[] }>();
  const cid = conversationId ?? decodeURIComponent(params.cid ?? "");
  const panel = panelFrom(conversationId ? panelSegments : params.panel);
  return (
    <ConversationView
      key={cid}
      conversationId={cid}
      hrefs={hrefs}
      panel={panel}
      renderPanel={(conversation, p) =>
        p.kind === "thread" ? (
          <ThreadPanel conversation={conversation} parentId={p.messageId} closeHref={hrefs.conversation(conversation.id)} />
        ) : (
          <InfoPanel conversation={conversation} closeHref={hrefs.conversation(conversation.id)} backHref={hrefs.back} />
        )
      }
    />
  );
}
