import { ChannelsScreen } from "@/features/messages/channels/channels-screen";

export const instant = false;

/** MS-03 · Channels: /companies/[id]/channels/[cid] (+ /thread/[mid] · /info). Same conversation ids as /messages. */
export default function ChannelsPage() {
  return <ChannelsScreen kind="company" />;
}
