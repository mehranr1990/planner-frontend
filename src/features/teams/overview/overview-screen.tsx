"use client";

import { ChevronRight, Plus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useMyPresence, useTeamWeekPlan } from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { useTeamLabels } from "../labels";
import { PresenceDot } from "../presence";
import { useOpenTeamSheet } from "../sheets/team-sheet-params";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";
import { ProjectsCard } from "./projects-card";
import { TeamCalendarCard } from "./team-calendar-card";
import { TeamPeopleCard } from "./team-people-card";
import { UpdatesTabs } from "./updates-tabs";
import { WeekCard } from "./week-card";
import { WorkTabs } from "./work-tabs";

/*
 * TM-01 · Team overview (/teams/[id]). Where does our week stand, who is
 * around, what needs attention — not a ranking, not surveillance. Read
 * order: header (people, lead) → People & workload (full width) → This week
 * (the one signature card) · Work tabs · Projects | Team calendar · Activity /
 * Check-ins / Recognition. Two columns → one below 1180px. Phones (TMM01)
 * add the "You" row that opens Set status. S5 removals: decisions/votes,
 * mood, member cards with empty notches, Assistant FAB.
 */
export function TeamOverviewScreen() {
  const t = useTranslations("Team");
  const tTeams = useTranslations("Teams");
  const router = useRouter();
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const plan = useTeamWeekPlan(team.id);
  const openSheet = useOpenTeamSheet();
  const archived = team.lifecycle === "archived";

  const actions = archived ? null : (
    <>
      {capabilities.invite ? (
        <Button
          variant="secondary"
          size="lg"
          className="bg-surface"
          aria-haspopup="dialog"
          onClick={() => openSheet("team-invite")}
        >
          <Icon icon={UserPlus} size={18} />
          {t("header.invite")}
        </Button>
      ) : null}
      {capabilities.createTask ? (
        <Button size="lg" className="max-sm:hidden" onClick={() => router.push(`${teamHref(team.id, "work")}?add=task`)}>
          <Icon icon={Plus} size={18} />
          {t("header.newTask")}
        </Button>
      ) : null}
    </>
  );

  const chip = "rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-fg inset-ring inset-ring-line";
  const meta = (
    <span className="flex flex-wrap items-center gap-2">
      <span className={chip}>{tTeams("people", { n: format.number(team.memberCount) })}</span>
      {team.lead ? <span className={chip}>{t("header.lead", { name: team.lead.name })}</span> : null}
    </span>
  );

  return (
    <>
      <TeamPageHeader title={<bdi>{team.name}</bdi>} subtitle={meta} actions={actions} />
      {capabilities.setOwnStatus ? <YouRow teamId={team.id} onOpen={() => openSheet("team-status")} /> : null}
      <TeamPeopleCard />
      <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <WeekCard teamId={team.id} plan={plan.data} />
          <WorkTabs teamId={team.id} />
          <ProjectsCard teamId={team.id} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {plan.data ? <TeamCalendarCard teamId={team.id} week={plan.data.week} /> : null}
          <UpdatesTabs teamId={team.id} canReply={capabilities.setOwnStatus} />
        </div>
      </div>
    </>
  );
}

/** Phones (TMM01): "You · Available — tap to change" opens ?sheet=team-status. */
function YouRow({ teamId, onOpen }: { teamId: string; onOpen: () => void }) {
  const t = useTranslations("Team");
  const labels = useTeamLabels();
  const mine = useMyPresence(teamId);
  const status = mine.data?.status ?? null;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="flex min-h-14 items-center gap-3 rounded-row bg-surface px-4 py-2 text-start lg:hidden"
    >
      <span className="relative shrink-0">
        <Avatar name={t("people.you")} initials="MR" size={32} tone="team" decorative />
        <PresenceDot status={status} className="absolute end-0 bottom-0 ring-2 ring-surface" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="text-sm font-bold text-fg">
          {t("people.you")} · {labels.status(status)}
        </span>
        <span className="text-xs text-fg-secondary">{t("people.tapToChange")}</span>
      </span>
      <Icon icon={ChevronRight} size={16} mirror className="text-fg-muted" />
    </button>
  );
}
