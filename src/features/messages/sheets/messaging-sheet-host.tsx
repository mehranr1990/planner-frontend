"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { MsgSource } from "@/data/messaging-domain";
import { useMessagingAvailable } from "@/data/messaging-provider";
import { consumeOpenedSheet, SHEET_PARAM } from "@/features/sheets/sheet-params";
import { MeetingNewSheet } from "../meetings/meeting-new-sheet";
import { sourceScope } from "../paths";
import { isMessagingSheetId, messagingSheetHref, type MessagingSheetId } from "./messaging-sheet-params";
import { ChannelNewSheet, ConversationNewSheet } from "./messaging-sheets";

/*
 * Global messaging sheet host (MS-90 · MT-02), mounted once in the app
 * layout: ?sheet=conversation-new · channel-new (&ws=kind:id) · meeting-new
 * (&source=kind:id|personal, &day=YYYY-MM-DD). End drawer on desktop,
 * bottom sheet on phones; closing goes Back when this tab opened it.
 */

export function parseSource(value: string | null): MsgSource | null {
  if (!value) return null;
  if (value === "personal") return { kind: "personal", workspaceId: null, name: "" };
  const [kind, id] = value.split(":");
  if ((kind === "project" || kind === "team" || kind === "company") && id) return { kind, workspaceId: id, name: "" };
  return null;
}

export function MessagingSheetHost() {
  const params = useSearchParams();
  const available = useMessagingAvailable();
  const id = params.get(SHEET_PARAM);
  if (!available || !isMessagingSheetId(id)) return null;
  return <MessagingSheet key={id} id={id} ws={parseSource(params.get("ws"))} source={parseSource(params.get("source"))} day={params.get("day")} />;
}

function MessagingSheet({ id, ws, source, day }: { id: MessagingSheetId; ws: MsgSource | null; source: MsgSource | null; day: string | null }) {
  const t = useTranslations("Msg.sheets");
  const router = useRouter();
  const pathname = usePathname();
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  const close = useCallback(() => {
    if (consumeOpenedSheet()) router.back();
    else router.replace(messagingSheetHref(pathname, window.location.search, null), { scroll: false });
  }, [router, pathname]);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    else document.getElementById("main-content")?.focus();
  }, []);

  if (id === "channel-new" && (!ws || ws.kind === "personal")) return null;
  const title = id === "conversation-new" ? t("conversation.title") : id === "channel-new" ? t("channel.title") : t("meeting.title");
  const scope = id === "channel-new" && ws ? sourceScope(ws) : id === "meeting-new" && source ? sourceScope(source) : "messages";

  return (
    <Sheet defaultOpen onOpenChange={(open) => !open && close()}>
      <SheetContent side="end" size="drawer" title={title} data-scope={scope} data-messaging-sheet={id} onCloseAutoFocus={onCloseAutoFocus}>
        {id === "conversation-new" ? <ConversationNewSheet onDone={close} /> : null}
        {id === "channel-new" && ws ? <ChannelNewSheet source={ws} onDone={close} /> : null}
        {id === "meeting-new" ? <MeetingNewSheet initialSource={source} day={day} onDone={close} /> : null}
      </SheetContent>
    </Sheet>
  );
}
