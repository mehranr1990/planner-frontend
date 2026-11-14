"use client";

import { UsersRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { TeamInvitation } from "@/data/team-domain";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";
import { useTeamLabels } from "../labels";

/*
 * TeamInvitationStrip (TM-00): public-safe preview only — team name,
 * inviter, offered role, size — and the note that joining does not give
 * project access by itself. Phones (TMM01) show the compact strip with
 * Review (the team route then shows the invite state with Accept/Decline).
 */
export function TeamInvitationStrip({
  invitation,
  busy,
  onAccept,
  onDecline,
}: {
  invitation: TeamInvitation;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useTranslations("Teams");
  const labels = useTeamLabels();
  const format = useProjectFormat();
  const role = invitation.role ? labels.role(invitation.role) : null;
  const title = invitation.teamName && role ? t("invite.title", { team: invitation.teamName, role }) : t("invite.generic");

  return (
    <section aria-label={title} className="flex items-center gap-3 rounded-row bg-scope-soft px-4 py-3 text-scope-deep">
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-scope-deep"
      >
        <Icon icon={UsersRound} size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-snug">
        <p className="truncate text-sm font-bold text-fg">
          <span className="max-sm:hidden">{title}</span>
          <bdi className="sm:hidden">{invitation.teamName ?? t("invite.generic")}</bdi>
        </p>
        <p className="truncate text-xs font-semibold">
          <span className="max-sm:hidden">
            {invitation.inviter && invitation.memberCount !== null ? (
              <>
                {invitation.inviter.name} · {t("people", { n: format.number(invitation.memberCount) })} ·{" "}
              </>
            ) : null}
            {t("invite.note")}
          </span>
          <span className="sm:hidden">{role ? t("invite.short", { role }) : t("invite.note")}</span>
        </p>
      </div>
      {invitation.teamId ? (
        <Link href={teamHref(invitation.teamId)} className={cn(buttonVariants({ size: "sm" }), "sm:hidden")}>
          {t("switcher.review")}
        </Link>
      ) : null}
      <div className={cn("flex shrink-0 items-center gap-2", invitation.teamId && "max-sm:hidden")}>
        <Button variant="secondary" size="sm" className="bg-surface" disabled={busy} onClick={onDecline}>
          {t("invite.decline")}
        </Button>
        <Button size="sm" disabled={busy} onClick={onAccept}>
          {t("invite.accept")}
        </Button>
      </div>
    </section>
  );
}
