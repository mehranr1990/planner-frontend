"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "@/components/ui/toast";
import { useSetBlockDone } from "@/data/queries";

/*
 * "Mark done" with an Undo toast. Uses mutateAsync so the toast still appears
 * when the card that asked has already switched state (a done block is no
 * longer "now", so the Now card re-renders as soon as the data refreshes).
 */
export function useMarkDone(): (block: { id: string; title: string }) => Promise<void> {
  const t = useTranslations("MyDay.now");
  const { mutateAsync } = useSetBlockDone();

  return useCallback(
    async ({ id, title }) => {
      try {
        await mutateAsync({ blockId: id, done: true });
      } catch {
        toast({ tone: "danger", title: t("markDoneFailed") });
        return;
      }
      toast({
        tone: "success",
        title: t("markedDone"),
        description: <bdi dir="auto">{title}</bdi>,
        action: {
          label: t("undo"),
          altText: t("undoAlt", { title }),
          onClick: () => void mutateAsync({ blockId: id, done: false }).catch(() => undefined),
        },
      });
    },
    [mutateAsync, t],
  );
}
