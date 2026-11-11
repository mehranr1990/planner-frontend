"use client";

import { ChevronDown, Link2, MoreHorizontal, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { PresenceDot } from "@/components/context/presence-dot";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { TeamCapacityEntry, TeamMemberRow, TeamPresence, TeamRole, TeamTask } from "@/data/team-domain";
import {
  useTeamCapacity,
  useTeamMemberActions,
  useTeamMemberRows,
  useTeamPendingInvites,
  useTeamPersonCapacity,
  useTeamPresence,
  useTeamProjects,
  useTeamTasks,
  useTeamWeekPlan,
} from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { useTeamLabels } from "../labels";
import { TeamPeopleCard } from "../overview/team-people-card";
import { useOpenTeamSheet } from "../sheets/team-sheet-params";
import { SourceChip, teamTaskHref } from "../source-chip";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";
import { CapacityDialog, MoveMemberDialog, RemoveMemberDialog, useWeekdayName, WEEK_ORDER } from "./member-dialogs";
import { InvitationsList } from "./invitations-list";

/*
 * TM-08 · People & capacity (/teams/[id]/people). The shared PeopleWorkload
 * strip (rows hidden) at the top picks the person for the whole page: the
 * highlighted member row and the Person signature card follow it. Member
 * rows: manual status (set by each person only), role (Owner/Admin change it
 * in a menu; Owner only by transfer), weekly capacity and this week's
 * booking (Viewers: not shown, OPEN default). Person card notch: Assign a
 * task (Lead+) → Work quick add with that assignee; others: Copy profile
 * link. Capacity editor, Move to another team and Remove previews (open
 * team tasks become Unassigned). Invitations tab. Never a ranking: A–Z only.
 */

type Tab = "members" | "invitations";
type Filter = "all" | "available" | "over" | "off";
const FILTERS: readonly Filter[] = ["all", "available", "over", "off"];

interface PersonView {
  row: TeamMemberRow;
  presence: TeamPresence | undefined;
  capacity: TeamCapacityEntry | undefined;
  percent: number | null;
}

const matches = (view: PersonView, filter: Filter) =>
  filter === "all" ||
  (filter === "available" && view.presence?.status === "available") ||
  (filter === "off" && view.presence?.status === "off") ||
  (filter === "over" && view.percent !== null && view.percent > 100);

export function PeopleScreen() {
  const t = useTranslations("People");
  const format = useProjectFormat();
  const { team, capabilities, demo } = useTeam();
  const openSheet = useOpenTeamSheet();
  const rows = useTeamMemberRows(team.id, teamDemoAccessOptions(demo));
  const presence = useTeamPresence(team.id);
  // OPEN(DECISIONS): whether Viewers may see this-week booking — default off (not requested).
  const capacity = useTeamCapacity(team.id, capabilities.seeBooking);
  const invites = useTeamPendingInvites(team.id, capabilities.invite);
  const [tab, setTab] = useState<Tab>("members");
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState<Filter>("all");

  const views = useMemo<PersonView[]>(
    () =>
      [...(rows.data ?? [])]
        .sort((a, b) => a.person.name.localeCompare(b.person.name))
        .map((row) => {
          const entry = capacity.data?.find((item) => item.personId === row.person.id);
          return {
            row,
            presence: presence.data?.find((item) => item.personId === row.person.id),
            capacity: entry,
            percent:
              entry && entry.capacityHours > 0 ? Math.round((entry.bookedHours / entry.capacityHours) * 100) : null,
          };
        }),
    [rows.data, presence.data, capacity.data],
  );

  const header = (
    <TeamPageHeader
      module="people"
      title={t("title")}
      actions={
        <>
          {capabilities.invite ? (
            <Segmented<Tab>
              label={t("tabs.label")}
              value={tab}
              onValueChange={setTab}
              options={[
                { value: "members", label: t("tabs.members", { n: format.number(team.memberCount) }) },
                { value: "invitations", label: t("tabs.invitations", { n: format.number(invites.data?.length ?? 0) }) },
              ]}
            />
          ) : null}
          {capabilities.invite ? (
            <Button className="gap-2" onClick={() => openSheet("team-invite")}>
              <Icon icon={UserPlus} size={16} />
              {t("invite")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (rows.isError || presence.isError) {
    return (
      <>
        {header}
        <ErrorState
          onRetry={() => {
            void rows.refetch();
            void presence.refetch();
          }}
        />
      </>
    );
  }
  if (!rows.data || !presence.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }
  if (tab === "invitations") {
    return (
      <>
        {header}
        <InvitationsList />
      </>
    );
  }

  const selected = views.find((view) => view.row.person.id === selectedId) ?? views[0];
  const shown = views.filter((view) => matches(view, filter));

  return (
    <>
      {header}
      <TeamPeopleCard
        mode="strip"
        selectedId={selected?.row.person.id}
        onSelect={setSelectedId}
        footnote={t("stripFootnote")}
      />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
        <ProductCard as="section" aria-label={t("title")} className="gap-3">
          <div role="group" aria-label={t("filter.label")} className="flex flex-wrap gap-1.5">
            {FILTERS.filter((key) => key !== "over" || capabilities.seeBooking).map((key) => (
              <ToggleChip
                key={key}
                scope="team"
                size="sm"
                selected={filter === key}
                onSelectedChange={() => setFilter(key)}
              >
                {t(`filter.${key}`, { n: format.number(views.filter((view) => matches(view, key)).length) })}
              </ToggleChip>
            ))}
          </div>
          {shown.length ? (
            <MemberTable views={shown} selectedId={selected?.row.person.id} onSelect={setSelectedId} />
          ) : (
            <p className="text-sm text-fg-muted">{t("filtered")}</p>
          )}
          <p className="text-xs text-fg-secondary">{t("footnote")}</p>
        </ProductCard>
        {selected ? <PersonCard view={selected} /> : null}
      </div>
    </>
  );
}

const GRID = "lg:grid-cols-[minmax(11rem,1.4fr)_minmax(8rem,1fr)_7rem_4rem_minmax(7rem,1fr)_2.75rem]";

function MemberTable({
  views,
  selectedId,
  onSelect,
}: {
  views: readonly PersonView[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("People");
  const labels = useTeamLabels();
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const actions = useTeamMemberActions(team.id);
  const [dialog, setDialog] = useState<{ kind: "capacity" | "move" | "remove"; row: TeamMemberRow } | null>(null);
  const roleOptions: Exclude<TeamRole, "owner">[] = capabilities.inviteAdmin
    ? ["admin", "lead", "member", "viewer"]
    : ["lead", "member", "viewer"];

  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden className={cn("hidden gap-3 px-3 text-xs font-semibold text-fg-secondary lg:grid", GRID)}>
        <span>{t("columns.person")}</span>
        <span>{t("columns.status")}</span>
        <span>{t("columns.role")}</span>
        <span>{t("columns.capacity")}</span>
        <span>{t("columns.week")}</span>
        <span />
      </div>
      <ul className="flex flex-col gap-1.5">
        {views.map((view) => {
          const { person } = view.row;
          const selected = person.id === selectedId;
          const status = view.presence?.status ?? null;
          const until = view.presence?.until;
          const name = person.id === "me" ? t("you", { name: person.name }) : person.name;
          const over = view.percent !== null && view.percent > 100;
          return (
            <li
              key={person.id}
              data-person={person.id}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-row bg-subtle px-3 py-2.5 lg:grid",
                GRID,
                selected && "bg-surface inset-ring-2 inset-ring-scope-deep",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(person.id)}
                aria-label={t("select", { name: person.name })}
                aria-pressed={selected}
                className="flex min-w-0 items-center gap-3 text-start focus-visible:focus-ring"
              >
                <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-scope-soft text-xs font-bold text-scope-deep">
                  <span aria-hidden>{person.initials}</span>
                  <PresenceDot status={status} className="absolute -end-0.5 -bottom-0.5" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <bdi className="truncate text-sm font-bold text-fg">{name}</bdi>
                  <bdi className="truncate text-xs text-fg-secondary">{view.row.title}</bdi>
                </span>
              </button>
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-fg max-lg:order-last max-lg:col-span-2">
                <PresenceDot status={status} />
                {labels.status(status)}
                {view.presence?.note ? (
                  <bdi className="truncate font-medium text-fg-secondary">· {view.presence.note}</bdi>
                ) : null}
                {!view.presence?.note && until && status ? (
                  <span className="font-medium text-fg-secondary">
                    · {t("until", { time: convertDigits(until.slice(11, 16), format.digits) })}
                  </span>
                ) : null}
              </span>
              <span>
                {view.row.can.changeRole ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-1"
                        aria-label={`${t("changeRole", { name: person.name })}: ${labels.role(view.row.role)}`}
                      >
                        {labels.role(view.row.role)}
                        <ChevronDown aria-hidden size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup
                        value={view.row.role}
                        onValueChange={(role) =>
                          actions.setRole.mutate(
                            { personId: person.id, role: role as Exclude<TeamRole, "owner"> },
                            {
                              onSuccess: () =>
                                toast({
                                  title: t("roleSaved", { name: person.name, role: labels.role(role as TeamRole) }),
                                }),
                              onError: () => toast({ tone: "danger", title: t("failed") }),
                            },
                          )
                        }
                      >
                        {roleOptions.map((role) => (
                          <DropdownMenuRadioItem key={role} value={role}>
                            {labels.role(role)}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="rounded-pill bg-surface px-2.5 py-1 text-xs font-bold text-fg inset-ring inset-ring-outline">
                    {labels.role(view.row.role)}
                  </span>
                )}
              </span>
              <span className="text-xs font-semibold text-fg tabular">
                {view.capacity ? t("hours", { n: format.number(view.capacity.capacityHours) }) : "—"}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                {view.percent !== null ? (
                  <>
                    <Progress
                      value={Math.min(100, view.percent)}
                      size="sm"
                      className="min-w-0 flex-1"
                      label={t("booked", { name: person.name, percent: format.percent(view.percent) })}
                      indicatorClassName={over ? "bg-danger" : undefined}
                    />
                    <span
                      className={cn(
                        "w-10 shrink-0 text-end text-xs font-bold tabular",
                        over ? "text-danger-text" : "text-fg",
                      )}
                    >
                      {format.percent(view.percent)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-fg-muted">{t("noBooking")}</span>
                )}
              </span>
              <span className="justify-self-end">
                {view.row.can.editCapacity || view.row.can.move || view.row.can.remove ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        icon={MoreHorizontal}
                        size="sm"
                        variant="ghost"
                        label={t("actions", { name: person.name })}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {view.row.can.editCapacity ? (
                        <DropdownMenuItem onSelect={() => setDialog({ kind: "capacity", row: view.row })}>
                          {t("editCapacity")}
                        </DropdownMenuItem>
                      ) : null}
                      {view.row.can.move ? (
                        <DropdownMenuItem onSelect={() => setDialog({ kind: "move", row: view.row })}>
                          {t("move")}
                        </DropdownMenuItem>
                      ) : null}
                      {view.row.can.remove ? (
                        <DropdownMenuItem onSelect={() => setDialog({ kind: "remove", row: view.row })}>
                          {t("remove")}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <CapacityDialog row={dialog?.kind === "capacity" ? dialog.row : null} onClose={() => setDialog(null)} />
      <MoveMemberDialog row={dialog?.kind === "move" ? dialog.row : null} onClose={() => setDialog(null)} />
      <RemoveMemberDialog row={dialog?.kind === "remove" ? dialog.row : null} onClose={() => setDialog(null)} />
    </div>
  );
}

function PersonCard({ view }: { view: PersonView }) {
  const t = useTranslations("People");
  const labels = useTeamLabels();
  const format = useProjectFormat();
  const weekday = useWeekdayName();
  const router = useRouter();
  const { team, capabilities } = useTeam();
  const { person } = view.row;
  const tasks = useTeamTasks(team.id);
  const plan = useTeamWeekPlan(team.id);
  const projects = useTeamProjects(team.id);
  const days = useTeamPersonCapacity(team.id, person.id);
  const planned: TeamTask[] = (tasks.data ?? []).filter(
    (task) =>
      task.planWeek === plan.data?.week &&
      task.assignees.some((assignee) => assignee.person.id === person.id && assignee.state !== "declined"),
  );
  const visibleHours = planned.reduce((sum, task) => sum + (task.estimateHours ?? 0), 0);
  const otherHours = view.capacity ? Math.max(0, view.capacity.bookedHours - visibleHours) : 0;
  const shared = (projects.data ?? []).filter((project) => project.teamPeople.some((item) => item.id === person.id));
  const status = view.presence?.status ?? null;
  const ordered = WEEK_ORDER.filter((day) => days.data?.days.includes(day));
  const over = view.percent !== null && view.percent > 100;

  const action = capabilities.assignOthers ? (
    <SignatureCardAction
      icon={Plus}
      label={t("assign")}
      onClick={() => router.push(`${teamHref(team.id, "work")}?add=task&assignee=${encodeURIComponent(person.id)}`)}
    />
  ) : (
    <SignatureCardAction
      icon={Link2}
      label={t("card.copyLink")}
      onClick={() => {
        void navigator.clipboard?.writeText(
          `${window.location.origin}${teamHref(team.id, "people")}?person=${encodeURIComponent(person.id)}`,
        );
        toast({ title: t("card.linkCopied") });
      }}
    />
  );

  return (
    <SignatureCard action={action} as="section" aria-labelledby="person-card-name" contentClassName="gap-3">
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-scope-soft text-sm font-bold text-scope-deep">
          <span aria-hidden>{person.initials}</span>
          <PresenceDot status={status} size="md" className="absolute -end-0.5 -bottom-0.5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id="person-card-name" className="type-title truncate text-fg">
            <bdi>{person.name}</bdi>
          </h2>
          <p className="truncate text-xs text-fg-secondary">
            {t("card.roleLine", { title: view.row.title, role: labels.role(view.row.role) })}
          </p>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-fg">
        <PresenceDot status={status} />
        {labels.status(status)}
        {view.presence?.note ? <bdi className="font-medium text-fg-secondary">· {view.presence.note}</bdi> : null}
        {view.presence?.until && status ? (
          <span className="font-medium text-fg-secondary">
            · {t("until", { time: convertDigits(view.presence.until.slice(11, 16), format.digits) })}
          </span>
        ) : null}
      </p>
      {view.capacity ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-bold text-fg">
              {t("card.week", {
                booked: format.number(view.capacity.bookedHours),
                capacity: format.number(view.capacity.capacityHours),
              })}
            </span>
            {ordered.length ? (
              <span className="text-fg-secondary">
                {t("card.days", {
                  days:
                    ordered.length > 1 ? `${weekday(ordered[0]!)} – ${weekday(ordered.at(-1)!)}` : weekday(ordered[0]!),
                  perDay: format.number(Math.round((view.capacity.capacityHours / ordered.length) * 10) / 10),
                })}
              </span>
            ) : null}
          </div>
          <Progress
            value={Math.min(100, view.percent ?? 0)}
            size="sm"
            label={t("booked", { name: person.name, percent: format.percent(view.percent ?? 0) })}
            indicatorClassName={over ? "bg-danger" : undefined}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("card.planned")}</h3>
        {planned.length ? (
          <ul className="flex flex-col gap-1.5">
            {planned.map((task) => (
              <li key={task.id} className="flex min-h-11 items-center gap-2 rounded-row bg-subtle px-3">
                <Link
                  href={teamTaskHref(team.id, task)}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-fg hover:underline"
                >
                  <bdi>{task.title}</bdi>
                </Link>
                <SourceChip source={task.source} />
                {task.estimateHours !== null ? (
                  <span className="shrink-0 text-xs font-semibold text-fg-secondary tabular">
                    {t("hours", { n: format.number(task.estimateHours) })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t("card.noPlanned")}</p>
        )}
        {view.capacity?.otherProjectTasks && otherHours > 0 ? (
          <p className="text-xs text-fg-secondary">
            {t("otherProject", { n: view.capacity.otherProjectTasks, h: format.number(otherHours) })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("card.shared")}</h3>
        {shared.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {shared.map((project) => (
              <li key={project.id}>
                <SourceChip source={{ kind: "project", projectId: project.id, projectName: project.name }} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t("card.noShared")}</p>
        )}
      </div>
    </SignatureCard>
  );
}
