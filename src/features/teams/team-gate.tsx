"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, use, useEffect, type ReactNode } from "react";
import { AccessBanner, AccessBannerAction, pickAccessBanner } from "@/components/feedback/access-banner";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { TeamCapabilities, TeamSummary } from "@/data/team-domain";
import {
  useAcceptTeamInvitation,
  useClearTeamScope,
  useDeclineTeamInvitation,
  useMyTeamInvitations,
  useRestoreTeam,
  useTeamAccess,
} from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { getTeamIdFromPathname } from "@/features/navigation/paths";
import { DemoStateSwitch } from "@/features/projects/demo-state-switch";
import { useProjectFormat } from "@/features/projects/format";
import { useOnline } from "@/features/projects/project-gate";
import { parseTeamDemoState, setTeamDemoState, teamDemoAccessOptions, teamDemoStates, type TeamDemoState } from "./demo-state";
import { useTeamLabels } from "./labels";

/*
 * Every /teams/[id]/… route renders inside this gate (SH-02 + TS-01 team
 * states). It loads the team's access answer (capabilities included) and
 * shows the full-page states — loading, error, unauthenticated, not
 * available (forbidden = not found), invite pending (joining ≠ project
 * access), removed / left — or provides the team to the page, which places
 * <TeamBanner/> under its header (offline › archived › conflict › viewer).
 *
 * Mock mode: `?state=<id>` forces any state (demo-state switch).
 */

interface TeamContextValue {
  team: TeamSummary;
  capabilities: TeamCapabilities;
  /** The forced demo state, or null on real data. */
  demo: TeamDemoState | null;
  refetch: () => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function useTeam(): TeamContextValue {
  const value = use(TeamContext);
  if (!value) throw new Error("useTeam must be used inside <TeamGate>");
  return value;
}

/** Tests and previews: provide a team without the gate. */
export const TeamContextProvider = TeamContext.Provider;

const DEMO_ERROR_REF = "7F3A-31";

export function TeamGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Access.states");
  const labels = useTeamLabels();
  const router = useRouter();
  const pathname = usePathname();
  const id = getTeamIdFromPathname(pathname);
  const demo = parseTeamDemoState(useSearchParams().get("state"));
  const access = useTeamAccess(id, teamDemoAccessOptions(demo));
  const invitations = useMyTeamInvitations();
  const accept = useAcceptTeamInvitation();
  const decline = useDeclineTeamInvitation();
  const clearScope = useClearTeamScope();
  const answer = access.data;

  useEffect(() => {
    setTeamDemoState(demo);
    return () => setTeamDemoState(null);
  }, [demo]);

  const removed = demo === "removed" || answer?.status === "removed";
  // Removed / left: drop everything cached for this team before showing the state.
  useEffect(() => {
    if (removed && id) clearScope(id);
  }, [removed, id, clearScope]);

  const myTeams = (
    <Link href="/teams" className={buttonVariants()}>
      {t("teamNotAvailable.action")}
    </Link>
  );

  let content: ReactNode;
  if (demo === "loading" || access.isPending) {
    content = <AccessLoading onRetry={() => void access.refetch()} />;
  } else if (demo === "error" || access.isError) {
    content = (
      <AccessState
        kind="error"
        errorRef={demo === "error" ? DEMO_ERROR_REF : undefined}
        primaryAction={<Button onClick={() => void access.refetch()}>{t("error.action")}</Button>}
      />
    );
  } else if (demo === "unauthenticated") {
    content = (
      <AccessState
        kind="unauthenticated"
        primaryAction={
          <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className={buttonVariants()}>
            {t("unauthenticated.action")}
          </Link>
        }
      />
    );
  } else if (removed) {
    content = (
      <AccessState
        kind="team-removed"
        primaryAction={
          <Link href="/teams" className={buttonVariants()}>
            {t("teamRemoved.action")}
          </Link>
        }
      />
    );
  } else if (demo === "not-available" || answer?.status === "not-available") {
    content = <AccessState kind="team-not-available" primaryAction={myTeams} />;
  } else if (demo === "invite-pending" || answer?.status === "invite-pending") {
    const invitation = answer?.status === "invite-pending" ? answer.invitation : invitations.data?.[0];
    content = invitation ? (
      <AccessState
        kind="team-invite"
        values={{ team: invitation.teamName, inviter: invitation.inviter.name, role: labels.role(invitation.role) }}
        primaryAction={
          <Button
            disabled={accept.isPending}
            onClick={() =>
              accept.mutate(invitation.id, {
                onSuccess: ({ teamId }) => {
                  toast({ title: t("teamJoined.title"), description: t("teamJoined.description") });
                  router.replace(teamHref(teamId));
                },
              })
            }
          >
            {t("teamInvite.accept")}
          </Button>
        }
        secondaryAction={
          <Button
            variant="secondary"
            disabled={decline.isPending}
            onClick={() => decline.mutate(invitation.id, { onSuccess: () => router.replace("/teams") })}
          >
            {t("teamInvite.decline")}
          </Button>
        }
      />
    ) : (
      <AccessState kind="team-not-available" primaryAction={myTeams} />
    );
  } else if (answer?.status === "ok") {
    content = (
      <TeamContext
        value={{ team: answer.team, capabilities: answer.capabilities, demo, refetch: () => void access.refetch() }}
      >
        {children}
      </TeamContext>
    );
  } else {
    content = <AccessState kind="team-not-available" primaryAction={myTeams} />;
  }

  return (
    <div data-scope="team" className="flex min-w-0 flex-col gap-4">
      {content}
      <DemoStateSwitch value={demo} states={teamDemoStates} />
    </div>
  );
}

/**
 * The one banner for the current team, directly under the page header:
 * offline › archived (Restore for Owner/Admin; linked projects stay active) ›
 * conflict › viewer (read only).
 */
export function TeamBanner({ className }: { className?: string }) {
  const { team, capabilities, demo, refetch } = useTeam();
  const online = useOnline();
  const format = useProjectFormat();
  const t = useTranslations("Access.banners");
  const restore = useRestoreTeam();
  const kind = pickAccessBanner({
    offline: demo === "offline" || !online,
    "team-archived": team.lifecycle === "archived",
    conflict: demo === "conflict",
    "team-read-only": team.role === "viewer",
  });
  if (!kind) return null;

  const values: Record<string, string | number> = {
    date: team.lifecycleAt ? format.day(team.lifecycleAt) : "",
    person: team.members[0]?.name ?? "",
  };
  let action: ReactNode = null;
  if (kind === "offline") action = <AccessBannerAction onClick={refetch}>{t("retry")}</AccessBannerAction>;
  if (kind === "conflict") action = <AccessBannerAction onClick={refetch}>{t("reload")}</AccessBannerAction>;
  if (kind === "team-archived" && capabilities.restore) {
    action = (
      <AccessBannerAction disabled={restore.isPending} onClick={() => restore.mutate(team.id)}>
        {t("restore")}
      </AccessBannerAction>
    );
  }
  return <AccessBanner kind={kind} values={values} action={action} className={className} />;
}
