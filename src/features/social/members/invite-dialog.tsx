"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { GroupDetail } from "@/data/social-domain";
import { useConnections, useSocialMutation } from "@/data/social-queries";
import { useSocialErrorText } from "../use-social";

/** Invite connections to a group (SO-03 / SO-04 / SO-19): only my connections, never a lookup. */
export function InviteDialog({ group, onClose }: { group: GroupDetail; onClose: () => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const connections = useConnections();
  const memberIds = new Set(group.members.map((m) => m.person.id));
  const candidates = (connections.data ?? []).filter((c) => !memberIds.has(c.person.id));
  const [picked, setPicked] = useState<string[]>([]);
  const invite = useSocialMutation((repo, ids: string[]) => repo.groups.invite(group.id, ids));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("members.inviteTitle")} description={t("members.inviteHint")}>
        <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {candidates.map((c) => (
            <Checkbox
              key={c.person.id}
              checked={picked.includes(c.person.id)}
              onCheckedChange={(checked) => setPicked(checked === true ? [...picked, c.person.id] : picked.filter((id) => id !== c.person.id))}
              label={<bdi>{c.person.name}</bdi>}
            />
          ))}
        </div>
        {invite.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(invite.error)}</p> : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={picked.length === 0 || invite.isPending}
            onClick={() =>
              invite.mutate(picked, {
                onSuccess: () => {
                  toast({ title: t("members.invited"), tone: "success" });
                  onClose();
                },
              })
            }
          >
            {t("common.invite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
