import { MessagesHome } from "@/features/messages/messages-shell";

export const instant = false;

/** MS-02 · /messages: the list (phones) or the empty conversation pane (desktop). */
export default function MessagesPage() {
  return <MessagesHome />;
}
