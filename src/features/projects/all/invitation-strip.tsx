"use client";

import { UsersRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectInvitation } from "@/data/project-domain";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProjectLabels } from "../labels";

/*
 * PJ-00 invitation strip: a pending invitation shows only the public-safe
 * preview — project name, inviter, offered role (no tasks, members or
 * files). Accept opens the project; Decline confirms with an optional note.
 * Phones show the compact strip with Review (the project route then shows
 * the SH-02 invite state with Accept / Decline).
 */
export function InvitationStrip({
  invitation,
  busy,
  onAccept,
  onDecline,
}: {
  invitation: ProjectInvitation;
  busy: boolean;
  onAccept: () => void;
  onDecline: (note: string) => void;
}) {
  const t = useTranslations("Projects.invite");
  const labels = useProjectLabels();
  const format = useProjectFormat();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const noteId = useId();
  const role = invitation.role ? labels.role(invitation.role) : null;
  const project = invitation.projectName ?? t("generic");
  const inviter = invitation.inviter?.name ?? t("someone");

  return (
    <section
      aria-label={(invitation.projectName ? t("title", { project }) : t("generic"))}
      className="flex items-center gap-3 rounded-row bg-info-soft px-4 py-3 text-info-text"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-scope-deep"
      >
        <Icon icon={UsersRound} size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-snug">
        <p className="truncate text-sm font-bold text-fg">
          <span className="max-sm:hidden">{(invitation.projectName ? t("title", { project }) : t("generic"))}</span>
          <bdi className="sm:hidden">{project}</bdi>
        </p>
        <p className="truncate text-xs font-semibold">
          <span className="max-sm:hidden">
            {invitation.inviter && role ? <>{t("line", { name: inviter, role })} · </> : null}
            {invitation.sentAt ? t("meta", { time: format.relative(invitation.sentAt) }) : null}
          </span>
          <span className="sm:hidden">{role ? t("short", { role }) : t("generic")}</span>
        </p>
      </div>
      <Link href={invitation.projectId ? projectHref(invitation.projectId) : "#"} aria-hidden={invitation.projectId ? undefined : true} hidden={!invitation.projectId} className={cn(buttonVariants({ size: "sm" }), "sm:hidden")}>
        {t("review")}
      </Link>
      <div className="flex shrink-0 items-center gap-2 max-sm:hidden">
        <Button variant="secondary" size="sm" className="bg-surface" disabled={busy} onClick={() => setDeclining(true)}>
          {t("decline")}
        </Button>
        <Button size="sm" disabled={busy} onClick={onAccept}>
          {t("accept")}
        </Button>
      </div>

      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent
          title={t("declineTitle", { project })}
          description={t("declineDescription", { name: inviter })}
          size="sm"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor={noteId} className="text-sm font-semibold text-fg">
              {t("note")}
            </label>
            <Textarea
              id={noteId}
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("notePlaceholder", { name: inviter })}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">{t("cancel")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setDeclining(false);
                onDecline(note.trim());
              }}
            >
              {t("confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
