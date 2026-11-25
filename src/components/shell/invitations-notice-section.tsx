"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useAcceptCompanyInvitation, useCompanyInvitations, useDeclineCompanyInvitation } from "@/data/company-queries";
import { useAcceptInvitation, useDeclineInvitation, useMyInvitations } from "@/data/project-queries";
import { useAcceptTeamInvitation, useDeclineTeamInvitation, useMyTeamInvitations } from "@/data/team-queries";
import { companyHref, projectHref, teamHref } from "@/features/navigation/contexts";

/*
 * Pending Project / Team / Company invitations in the bell, so someone who
 * already has an account sees an invitation without opening the context
 * switcher. Read from the viewer's own pending lists (the same ones the
 * switcher and the /invite landing use); answering here is the in-app path:
 * Accept opens the space, Decline drops the row. Lists that fail or are not
 * enabled on the server stay quiet; the switcher still explains them.
 */

type Scope = "project" | "team" | "company";

interface Row {
  key: string;
  id: string;
  scope: Scope;
  name: string | null;
}

/** Every pending workspace invitation of the viewer, newest lists first. */
export function usePendingInvitations(): readonly Row[] {
  const projects = useMyInvitations();
  const teams = useMyTeamInvitations();
  const companies = useCompanyInvitations();
  return [
    ...(projects.data ?? []).map((item) => ({ key: `p-${item.id}`, id: item.id, scope: "project" as const, name: item.projectName })),
    ...(teams.data ?? []).map((item) => ({ key: `t-${item.id}`, id: item.id, scope: "team" as const, name: item.teamName })),
    ...(companies.data ?? []).map((item) => ({ key: `c-${item.id}`, id: item.id, scope: "company" as const, name: item.companyName })),
  ];
}

export function InvitationsNoticeSection({ onNavigate }: { onNavigate(): void }) {
  const t = useTranslations("Invitations");
  const tShell = useTranslations("Shell.notifications");
  const titleId = useId();
  const router = useRouter();
  const rows = usePendingInvitations();
  const acceptProject = useAcceptInvitation();
  const declineProject = useDeclineInvitation();
  const acceptTeam = useAcceptTeamInvitation();
  const declineTeam = useDeclineTeamInvitation();
  const acceptCompany = useAcceptCompanyInvitation();
  const declineCompany = useDeclineCompanyInvitation();
  const busy = [acceptProject, declineProject, acceptTeam, declineTeam, acceptCompany, declineCompany].some((mutation) => mutation.isPending);
  if (!rows.length) return null;

  const onError = () => toast({ title: t("answerFailed"), tone: "danger" });
  const open = (href: string) => {
    onNavigate();
    router.push(href);
  };
  const accept = (row: Row) => {
    if (row.scope === "project") acceptProject.mutate(row.id, { onSuccess: ({ projectId }) => open(projectHref(projectId)), onError });
    else if (row.scope === "team") acceptTeam.mutate(row.id, { onSuccess: ({ teamId }) => open(teamHref(teamId)), onError });
    else acceptCompany.mutate(row.id, { onSuccess: ({ companyId }) => open(companyHref(companyId)), onError });
  };
  const decline = (row: Row) => {
    if (row.scope === "project") declineProject.mutate({ id: row.id }, { onError });
    else if (row.scope === "team") declineTeam.mutate(row.id, { onError });
    else declineCompany.mutate(row.id, { onError });
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1 border-b border-line pb-2">
      <h3 id={titleId} className="flex items-center gap-1.5 px-1.5 text-xs font-bold text-fg-secondary">
        <Mail aria-hidden="true" className="size-3.5" />
        {tShell("invitations")}
      </h3>
      <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto" aria-busy={busy}>
        {rows.map((row) => (
          <li key={row.key} data-scope={row.scope} className="flex flex-col gap-2 rounded-row bg-subtle p-2">
            <p className="flex min-w-0 items-start gap-2 text-sm font-bold text-fg">
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-scope-deep" />
              <span className="min-w-0">
                {row.name ? <bdi dir="auto">{t(`offer.${row.scope}Named`, { name: row.name })}</bdi> : t(`offer.${row.scope}`)}
              </span>
            </p>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => decline(row)}>
                {t("decline")}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => accept(row)}>
                {t("accept")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
