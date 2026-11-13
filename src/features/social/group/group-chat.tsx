"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { toast } from "@/components/ui/toast";
import { useMessagingRepository } from "@/data/messaging-provider";
import { useSocialRepository } from "@/data/social-provider";
import { messagesHref } from "@/features/messages/paths";
import { useSocialGroup } from "../social-gate";
import { isUnsupported, SocialUnsupported } from "../social-ui";

/*
 * Social chat through the Messages engine (Phase 5; README: group and
 * activity chat use it — no second messaging system). The group's
 * conversation is created once (idempotent clientOpId per group) with the
 * group's members; a direct message reuses the existing 1:1 conversation.
 */

export function useOpenDirectMessage() {
  const messaging = useMessagingRepository();
  const router = useRouter();
  const t = useTranslations("Social.common");
  return useCallback(
    async (personId: string) => {
      try {
        const id = await messaging.conversations.create({ personIds: [personId], clientOpId: `social-dm:${personId}` });
        router.push(messagesHref.conversation(id));
      } catch {
        // Live API: DM create is refused by the Messages adapter (retentionPolicyVersion, OD-1).
        toast({ title: t("unsupportedTitle"), description: t("unsupportedBody"), tone: "warning" });
      }
    },
    [messaging, router, t],
  );
}

/** Opens (or creates once) a conversation for a group or an activity. */
export function useOpenSocialConversation() {
  const messaging = useMessagingRepository();
  const router = useRouter();
  return useCallback(
    async (key: string, name: string, personIds: string[], replace = false) => {
      const id = await messaging.conversations.create({ personIds, name, clientOpId: `social-chat:${key}` });
      if (replace) router.replace(messagesHref.conversation(id));
      else router.push(messagesHref.conversation(id));
    },
    [messaging, router],
  );
}

/** /social/groups/[id]/chat: the group's conversation in Messages. */
export function GroupChat() {
  const group = useSocialGroup();
  const social = useSocialRepository();
  const open = useOpenSocialConversation();
  const started = useRef(false);
  const [failed, setFailed] = useState<unknown>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void social.groups
      .chatMembers(group.id)
      .then(({ name, personIds }) => open(`group:${group.id}`, name, personIds, true))
      .catch((error: unknown) => setFailed(error ?? new Error("chat")));
  }, [group.id, social, open]);
  if (failed) return isUnsupported(failed) ? <SocialUnsupported /> : <ErrorState onRetry={() => window.location.reload()} />;
  return <AccessLoading />;
}
