"use client";

import { useTranslations } from "next-intl";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useTeamMemberActions, useTeamPendingInvites } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { useTeamLabels } from "../labels";
import { useTeam } from "../team-gate";

/*
 * TM-08 Invitations tab: invitations this team sent that are still pending,
 * with expiry; Resend / Cancel (invite rights). Addresses are what the
 * inviter typed; nothing reveals whether an account exists.
 */
export function InvitationsList() {
  const t = useTranslations("People");
  const labels = useTeamLabels();
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const invites = useTeamPendingInvites(team.id, capabilities.invite);
  const { resendInvite, cancelInvite } = useTeamMemberActions(team.id);

  if (invites.isError) return <ErrorState onRetry={() => void invites.refetch()} />;
  if (!invites.data) return <AccessLoading />;
  return (
    <ProductCard as="section" aria-label={t("invites.label")} className="gap-3">
      {invites.data.length ? (
        <ul className="flex flex-col gap-1.5">
          {invites.data.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-row bg-subtle px-3 py-2.5"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <bdi dir="ltr" className="truncate text-start text-sm font-bold text-fg">
                  {invite.email}
                </bdi>
                <span className="text-xs text-fg-secondary">
                  {t("invites.row", {
                    role: labels.role(invite.role),
                    sent: format.day(invite.sentAt.slice(0, 10)),
                    expires: format.day(invite.expiresAt.slice(0, 10)),
                  })}
                </span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  resendInvite.mutate(invite.id, {
                    onSuccess: () => toast({ title: t("invites.resent") }),
                    onError: () => toast({ tone: "danger", title: t("failed") }),
                  })
                }
              >
                {t("invites.resend")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  cancelInvite.mutate(invite.id, {
                    onSuccess: () => toast({ title: t("invites.cancelled") }),
                    onError: () => toast({ tone: "danger", title: t("failed") }),
                  })
                }
              >
                {t("invites.cancel")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t("invites.empty")}</p>
      )}
    </ProductCard>
  );
}
