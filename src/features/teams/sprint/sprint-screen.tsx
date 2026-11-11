"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArrowRight, Check, GripVertical, ListTodo, Play } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { useMemo, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { BacklogItem, SprintEstimateUnit, TeamSprint } from "@/data/team-domain";
import { useSprintActions, useSprintReviews, useTeamBacklog, useTeamSprint } from "@/data/team-queries";
import { teamHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { SourceChip } from "../source-chip";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";
import { TeamStatusChip } from "../work/team-task-row";
import { CompleteSprintDialog, StartSprintDialog } from "./sprint-dialogs";
import { useEstimate } from "./use-estimate";

/*
 * TM-05 · Sprint & backlog (/teams/[id]/planning?tab=sprint·backlog·reviews),
 * only when Settings › Planning › Sprints is on (otherwise /planning is the
 * weekly plan, and these tabs show "This team plans weekly"). Backlog =
 * ranked team tasks + project tasks the viewer can open (Lead+ drag to rank,
 * keyboard via Space + arrows). Sprint = Signature card: goal, dates,
 * committed vs capacity, burndown (remaining vs ideal, plain SVG mirrored by
 * coordinates), status list; notch Complete sprint (Lead+) / Open my sprint
 * tasks (Members). Reviews = read-only summaries; velocity is team-only.
 */

type Tab = "backlog" | "sprint" | "reviews";
const TABS: readonly Tab[] = ["backlog", "sprint", "reviews"];

export const isSprintTab = (value: string | null): value is Tab => (TABS as readonly string[]).includes(value ?? "");

export function SprintScreen() {
  const t = useTranslations("Sprint");
  const tPlan = useTranslations("Planning");
  const { team, capabilities, demo } = useTeam();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTabState] = useState<Tab>(() => {
    const requested = params.get("tab");
    return isSprintTab(requested) ? requested : "sprint";
  });
  const state = useTeamSprint(team.id, true, teamDemoAccessOptions(demo));
  const [dialog, setDialog] = useState<"start" | "complete" | null>(null);

  const setTab = (next: Tab) => {
    setTabState(next);
    const search = new URLSearchParams(params.toString());
    search.set("tab", next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };

  const sprintLabel = state.data?.sprint
    ? t("tabs.sprint", { n: state.data.sprint.number })
    : t("tabs.sprint", { n: state.data?.next.number ?? "" });
  const header = (
    <TeamPageHeader
      module="planning"
      title={tPlan("title")}
      subtitle={t("subtitle")}
      actions={
        <Segmented<Tab>
          label={t("tabs.label")}
          value={tab}
          onValueChange={setTab}
          options={TABS.map((value) => ({ value, label: value === "sprint" ? sprintLabel : t(`tabs.${value}`) }))}
        />
      }
    />
  );

  if (state.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void state.refetch()} />
      </>
    );
  }
  if (!state.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  return (
    <>
      {header}
      {tab === "reviews" ? (
        <SprintReviews />
      ) : tab === "backlog" ? (
        <BacklogCard unit={state.data.unit} />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
          <BacklogCard unit={state.data.unit} />
          {state.data.sprint ? (
            <SprintCard sprint={state.data.sprint} onComplete={() => setDialog("complete")} />
          ) : (
            <EmptyState
              icon={Play}
              title={t("noSprint")}
              description={t("noSprintBody")}
              primaryAction={
                capabilities.editWeekFocus ? (
                  <Button onClick={() => setDialog("start")}>{t("start")}</Button>
                ) : undefined
              }
            />
          )}
        </div>
      )}
      <StartSprintDialog
        teamId={team.id}
        state={state.data}
        open={dialog === "start"}
        onOpenChange={(open) => setDialog(open ? "start" : null)}
      />
      {state.data.sprint ? (
        <CompleteSprintDialog
          teamId={team.id}
          sprint={state.data.sprint}
          nextNumber={state.data.next.number}
          open={dialog === "complete"}
          onOpenChange={(open) => setDialog(open ? "complete" : null)}
          onCompleted={() => setTab("reviews")}
        />
      ) : null}
    </>
  );
}

/** "Sprints off" (default): this team plans weekly. */
export function SprintsOff() {
  const t = useTranslations("Sprint");
  const tPlan = useTranslations("Planning");
  const router = useRouter();
  const { team, capabilities } = useTeam();
  return (
    <>
      <TeamPageHeader module="planning" title={tPlan("title")} subtitle={tPlan("subtitle")} />
      <EmptyState
        icon={ListTodo}
        title={t("off")}
        description={t("offBody")}
        primaryAction={
          capabilities.modules.settings ? (
            <Button variant="secondary" onClick={() => router.push(teamHref(team.id, "settings"))}>
              {t("openSettings")}
            </Button>
          ) : undefined
        }
      />
    </>
  );
}

function BacklogCard({ unit }: { unit: SprintEstimateUnit }) {
  const t = useTranslations("Backlog");
  const tSprint = useTranslations("Sprint");
  const tBoard = useTranslations("Tasks.board");
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const backlog = useTeamBacklog(team.id, true);
  const { rank } = useSprintActions(team.id);
  const [order, setOrder] = useState<readonly string[] | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const items = useMemo(() => {
    const list = backlog.data ?? [];
    if (!order) return list;
    return order
      .map((id) => list.find((item) => item.taskId === id))
      .filter((item): item is BacklogItem => item !== undefined);
  }, [backlog.data, order]);
  const ids = items.map((item) => item.taskId);
  const title = useMemo(() => new Map(items.map((item) => [item.taskId, item.title])), [items]);
  const position = (id: string) => format.number(ids.indexOf(id) + 1);
  const announcements: Announcements = {
    onDragStart: ({ active }) => tBoard("drag.start", { title: title.get(String(active.id)) ?? "" }),
    onDragOver: ({ over }) => (over ? tBoard("drag.over", { column: position(String(over.id)) }) : undefined),
    onDragEnd: ({ active, over }) =>
      over
        ? tBoard("drag.drop", { title: title.get(String(active.id)) ?? "", column: position(String(over.id)) })
        : tBoard("drag.cancel", { title: title.get(String(active.id)) ?? "" }),
    onDragCancel: ({ active }) => tBoard("drag.cancel", { title: title.get(String(active.id)) ?? "" }),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = [...ids];
    next.splice(next.indexOf(String(active.id)), 1);
    next.splice(ids.indexOf(String(over.id)), 0, String(active.id));
    setOrder(next);
    rank.mutate(next, {
      onSuccess: () => toast({ title: tSprint("toast.ranked") }),
      onError: () => {
        setOrder(null);
        toast({ tone: "danger", title: tSprint("toast.failed") });
      },
    });
  };

  return (
    <ProductCard as="section" aria-labelledby="backlog-title" className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="backlog-title" className="type-title text-fg">
          {t("title")}
        </h2>
        {backlog.data ? (
          <span className="text-xs font-medium text-fg-secondary">{t("meta", { n: format.number(items.length) })}</span>
        ) : null}
      </div>
      {backlog.isError ? (
        <ErrorState onRetry={() => void backlog.refetch()} />
      ) : !backlog.data ? (
        <AccessLoading />
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ announcements, screenReaderInstructions: { draggable: tBoard("drag.instructions") } }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-1.5">
              {items.map((item, index) => (
                <BacklogRow
                  key={item.taskId}
                  item={item}
                  rank={index + 1}
                  unit={unit}
                  draggable={capabilities.editWeekFocus}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {capabilities.editWeekFocus ? <p className="text-xs font-medium text-fg-secondary">{t("hint")}</p> : null}
    </ProductCard>
  );
}

function BacklogRow({
  item,
  rank,
  unit,
  draggable,
}: {
  item: BacklogItem;
  rank: number;
  unit: SprintEstimateUnit;
  draggable: boolean;
}) {
  const t = useTranslations("Backlog");
  const format = useProjectFormat();
  const estimate = useEstimate();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.taskId,
    disabled: !draggable,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-row bg-subtle px-3",
        isDragging && "relative z-10 bg-surface shadow-elevated",
      )}
    >
      {draggable ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("move", { title: item.title })}
          className="-ms-1 inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-full text-icon-muted focus-visible:focus-ring"
        >
          <Icon icon={GripVertical} size={14} />
        </button>
      ) : null}
      <span className="w-5 shrink-0 text-xs font-semibold text-fg-secondary tabular">{format.number(rank)}</span>
      <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{item.title}</bdi>
      <SourceChip source={item.source} />
      <span className="shrink-0 rounded-pill bg-surface px-2 py-0.5 text-xs font-bold text-fg inset-ring inset-ring-outline">
        {estimate(item.estimate, unit)}
      </span>
    </li>
  );
}

function SprintCard({ sprint, onComplete }: { sprint: TeamSprint; onComplete: () => void }) {
  const t = useTranslations("Sprint");
  const format = useProjectFormat();
  const estimate = useEstimate();
  const router = useRouter();
  const { team, capabilities } = useTeam();
  const action = capabilities.editWeekFocus ? (
    <SignatureCardAction icon={Check} label={t("complete")} onClick={onComplete} />
  ) : (
    <SignatureCardAction
      icon={ArrowRight}
      mirror
      label={t("openMine")}
      onClick={() => router.push(`${teamHref(team.id, "work")}?filter=mine`)}
    />
  );
  return (
    <SignatureCard action={action} as="section" aria-labelledby="sprint-goal" contentClassName="gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">
          {t("kicker", {
            n: format.number(sprint.number),
            day: format.number(sprint.dayIndex),
            days: format.number(sprint.days.length),
          })}
        </p>
        <h2 id="sprint-goal" className="type-title text-fg">
          <span className="sr-only">{t("goal")}: </span>
          <bdi>{sprint.goal}</bdi>
        </h2>
        <p className="text-xs font-medium text-fg-secondary">
          {t("meta", {
            range: format.range(sprint.start, sprint.end),
            committed: estimate(sprint.committed, sprint.unit),
            capacity: estimate(sprint.capacity, sprint.unit),
          })}
        </p>
      </div>
      <p className="flex items-baseline gap-2 text-fg">
        <span className="text-5xl font-bold tabular">{format.number(sprint.done)}</span>
        <span className="text-sm font-medium text-fg-secondary">
          {t("doneOf", { committed: estimate(sprint.committed, sprint.unit) })}
        </span>
      </p>
      <Burndown sprint={sprint} />
      <ul className="flex flex-col divide-y divide-hairline">
        {sprint.items.map((item) => (
          <li key={item.taskId} className="flex min-h-12 items-center gap-3">
            <TeamStatusChip status={item.status} />
            <bdi className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{item.title}</bdi>
            {item.assignee ? (
              <span
                title={item.assignee.name}
                className="grid size-7 shrink-0 place-items-center rounded-full bg-scope-soft text-[10px] font-bold text-scope-deep"
              >
                <span aria-hidden>{item.assignee.initials}</span>
                <span className="sr-only">{item.assignee.name}</span>
              </span>
            ) : null}
            <span className="shrink-0 rounded-pill bg-surface px-2 py-0.5 text-xs font-bold text-fg inset-ring inset-ring-outline">
              {estimate(item.estimate, sprint.unit)}
            </span>
          </li>
        ))}
      </ul>
    </SignatureCard>
  );
}

/** Remaining vs ideal; plain SVG, mirrored by coordinates in RTL (never CSS-flipped). */
function Burndown({ sprint }: { sprint: TeamSprint }) {
  const t = useTranslations("Sprint");
  const estimate = useEstimate();
  const rtl = Direction.useDirection() === "rtl";
  const W = 320;
  const H = 96;
  const pad = 6;
  const steps = Math.max(1, sprint.days.length - 1);
  const x = (index: number) => {
    const raw = pad + (index / steps) * (W - pad * 2);
    return rtl ? W - raw : raw;
  };
  const y = (remaining: number) => pad + (1 - remaining / Math.max(1, sprint.committed)) * (H - pad * 2);
  const points = sprint.burndown.map((point, index) => `${x(index)},${y(point.remaining)}`).join(" ");
  const last = sprint.burndown.at(-1);
  const lastIndex = sprint.burndown.length - 1;
  const ideal = Math.round(sprint.committed * (1 - Math.max(0, lastIndex) / steps));
  return (
    <svg
      role="img"
      aria-label={t("burndown", {
        remaining: estimate(last?.remaining ?? sprint.committed, sprint.unit),
        committed: estimate(sprint.committed, sprint.unit),
        ideal: estimate(ideal, sprint.unit),
      })}
      viewBox={`0 0 ${W} ${H}`}
      className="h-24 w-full"
      preserveAspectRatio="none"
    >
      <line
        x1={x(0)}
        y1={y(sprint.committed)}
        x2={x(steps)}
        y2={y(0)}
        className="stroke-fg-muted"
        strokeWidth={1.5}
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />
      {points ? (
        <polyline
          points={points}
          fill="none"
          className="stroke-scope-deep"
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {last ? <circle cx={x(lastIndex)} cy={y(last.remaining)} r={4} className="fill-scope-deep" /> : null}
    </svg>
  );
}

function SprintReviews() {
  const t = useTranslations("Sprint.reviews");
  const format = useProjectFormat();
  const estimate = useEstimate();
  const { team } = useTeam();
  const reviews = useSprintReviews(team.id, true);
  if (reviews.isError) return <ErrorState onRetry={() => void reviews.refetch()} />;
  if (!reviews.data) return <AccessLoading />;
  const recent = reviews.data.slice(0, 3);
  const velocity = recent.length ? Math.round(recent.reduce((sum, review) => sum + review.done, 0) / recent.length) : 0;
  return (
    <ProductCard as="section" aria-labelledby="sprint-reviews" className="gap-3">
      <h2 id="sprint-reviews" className="type-title text-fg">
        {t("title")}
      </h2>
      {reviews.data.length ? (
        <>
          <p className="text-sm font-semibold text-fg">
            {t("velocity", { n: estimate(velocity, recent[0]!.unit), count: format.number(recent.length) })}
          </p>
          <ul className="flex flex-col gap-1.5">
            {reviews.data.map((review) => (
              <li
                key={review.sprintId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-row bg-subtle px-3 py-2.5"
              >
                <span className="text-sm font-bold text-fg">{t("row", { n: format.number(review.number) })}</span>
                <bdi className="min-w-0 flex-1 truncate text-sm text-fg">{review.goal}</bdi>
                <span className="text-xs font-medium text-fg-secondary">{format.range(review.start, review.end)}</span>
                <span className="text-xs font-bold text-fg">
                  {t("doneOf", {
                    done: format.number(review.done),
                    committed: estimate(review.committed, review.unit),
                  })}
                </span>
                <span className="w-full text-xs text-fg-secondary">
                  {t("moved", {
                    next: format.number(review.movedToNext),
                    backlog: format.number(review.movedToBacklog),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      )}
      <p className="text-xs text-fg-secondary">{t("teamOnly")}</p>
    </ProductCard>
  );
}
