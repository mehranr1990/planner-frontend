"use client";

import { Flag, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { EmptyState } from "@/components/feedback/state-views";
import { ComingSoonBadge } from "@/components/navigation/coming-soon-badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { StatusChip } from "@/design-system/feedback/status-chip";
import type { StatusTone } from "@/design-system/tokens/colors";
import { Avatar } from "@/components/ui/avatar";
import type { MilestoneRow, MilestoneStatus, ScheduleChange } from "@/data/project-domain";
import {
  useMilestoneRisk,
  useMilestoneRows,
  usePhaseRows,
  useProjectTasks,
  useProjectWorkflow,
  useScheduleActions,
} from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { getPlannerToday } from "@/data/clock";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { SchedulePreviewDialog } from "../schedule/schedule-preview-dialog";
import { useMediaQuery } from "../use-media";
import { MilestoneDetail } from "./milestone-detail";
import { PhaseList } from "./phase-list";

/*
 * PJ-08 · Phases & milestones (/projects/[id]/milestones). Left: PhaseList
 * (drag to reorder, Manager+). Center: milestone rows (product cards, status
 * chips Reached / Next / At risk / Planned, server-computed). Right: the
 * selected milestone as a SignatureCard (notch = Edit milestone). A new date
 * on a milestone with dependents opens the SchedulePreviewDialog (never a
 * silent cascade). Below 1180px the right column drops under the list;
 * phones: phase chips, the list, and the detail as a full-screen view.
 * The Journey view is a proposal only (not built). `?m=` = selected milestone.
 */

const STATUS_TONE: Record<MilestoneStatus, StatusTone> = {
  reached: "success",
  next: "info",
  risk: "danger",
  planned: "neutral",
};

export function MilestonesScreen() {
  const t = useTranslations("Milestones");
  const tAccess = useTranslations("Access.states.conflict");
  const tTasks = useTranslations("ProjectTasks");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const format = useProjectFormat();
  const { project, capabilities, demo } = useProject();
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const phases = usePhaseRows(project.id);
  const rows = useMilestoneRows(project.id);
  const workflow = useProjectWorkflow(project.id);
  const actions = useScheduleActions(project.id);
  const [preview, setPreview] = useState<{ change: ScheduleChange; title: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const detailHeadingId = useId();

  const list = rows.data ?? [];
  const defaultRow = list.find((row) => row.status === "risk") ?? list.find((row) => row.status === "next") ?? list[0];
  const selected = list.find((row) => row.milestone.id === params.get("m")) ?? defaultRow ?? null;
  const milestoneTasks = useProjectTasks(project.id, {
    filters: { milestoneIds: selected ? [selected.milestone.id] : ["-"] },
  });
  const risk = useMilestoneRisk(project.id, selected?.milestone.id ?? null);
  const canEdit = capabilities.createMilestone;

  const select = (row: MilestoneRow) => {
    const next = new URLSearchParams(params.toString());
    next.set("m", row.milestone.id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    if (phone) setSheetOpen(true);
  };

  const header = (
    <ProjectPageHeader
      module="milestones"
      title={t("title")}
      actions={
        canEdit ? (
          <>
            {/* Creating phases / milestones is not part of this step: shown as coming soon. */}
            <Button variant="secondary" size="lg" aria-disabled className="gap-2 bg-surface opacity-70">
              <Icon icon={Plus} size={18} />
              {t("phase")}
              <ComingSoonBadge />
            </Button>
            <Button size="lg" aria-disabled className="gap-2 opacity-70">
              <Icon icon={Flag} size={18} />
              {t("new")}
              <ComingSoonBadge />
            </Button>
          </>
        ) : null
      }
    />
  );

  // Live: phase rows (dates, progress) and milestone rows (server status) are not served.
  if (phases.isError || rows.isError) {
    return (
      <>
        {header}
        <EmptyState variant="card" title={t("unavailable")} titleAs="h2" />
      </>
    );
  }

  if (!phases.data || !rows.data || !workflow.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const today = getPlannerToday();
  const current =
    phases.data.find((row) => !row.phase.done && row.phase.start !== null && row.phase.end !== null && today >= row.phase.start && today <= row.phase.end) ??
    phases.data.find((row) => !row.phase.done);
  const phaseOf = (id: string | null) => phases.data!.find((row) => row.phase.id === id)?.phase;
  const reached = list.filter((row) => row.status === "reached").length;
  const empty = demo === "empty" || list.length === 0;

  const save = async (row: MilestoneRow, input: { title: string; due: string }) => {
    const { milestone } = row;
    try {
      if (input.title !== milestone.title) {
        await actions.renameMilestone.mutateAsync({
          milestoneId: milestone.id,
          title: input.title,
          revision: milestone.revision ?? 1,
        });
      }
      if (input.due !== milestone.due) {
        const change = { itemId: milestone.id, start: input.due, end: input.due };
        const result = await actions.preview(change, "cascade");
        if (result.hasDependents) setPreview({ change, title: input.title });
        else await actions.apply.mutateAsync(result.moves);
      }
    } catch (error) {
      toast({
        tone: "danger",
        title: error instanceof RepositoryError && error.code === "conflict" ? tAccess("title") : tTasks("error"),
      });
    }
  };

  const detail = selected ? (
    <MilestoneDetail
      projectId={project.id}
      row={selected}
      phase={phaseOf(selected.milestone.phaseId)}
      tasks={milestoneTasks.data?.tasks ?? []}
      workflow={workflow.data}
      risk={risk.data}
      canEdit={canEdit}
      onSave={(input) => void save(selected, input)}
      headingId={detailHeadingId}
    />
  ) : null;

  return (
    <>
      {header}
      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}
      <div className="grid gap-4 sm:grid-cols-[240px_minmax(0,1fr)] min-[1180px]:grid-cols-[260px_minmax(0,1fr)_minmax(320px,380px)]">
        <PhaseList
          rows={phases.data}
          currentPhaseId={current?.phase.id ?? null}
          canReorder={canEdit}
          onReorder={(ids) => actions.reorderPhases.mutate(ids)}
        />
        <section aria-labelledby="milestones-list" className="flex flex-col gap-3 sm:rounded-[28px] sm:bg-surface sm:p-4">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 id="milestones-list" className="type-title text-fg">
              {t("list.title")}
            </h2>
            <span className="text-xs font-semibold text-fg-secondary">
              {t("list.summary", { n: format.number(list.length), reached: format.number(reached) })}
            </span>
          </div>
          {empty ? (
            <EmptyState variant="card" title={t("list.empty")} titleAs="h3" />
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((row) => (
                <MilestoneRowView
                  key={row.milestone.id}
                  row={row}
                  phaseName={phaseOf(row.milestone.phaseId)?.name ?? ""}
                  selected={row.milestone.id === selected?.milestone.id}
                  onSelect={() => select(row)}
                />
              ))}
            </ul>
          )}
        </section>
        {/* Detail: right column ≥1180px, under the list below; phones open it full screen. */}
        {!phone && !empty ? <div className="sm:col-span-2 min-[1180px]:col-span-1">{detail}</div> : null}
      </div>
      {phone && selected ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent title={t("detail.back")} hideTitle side="end" mobileSide="fullscreen" data-scope="project">
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}
      {preview ? (
        <SchedulePreviewDialog
          projectId={project.id}
          change={preview.change}
          title={preview.title}
          canCascade={canEdit}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}

function MilestoneRowView({
  row,
  phaseName,
  selected,
  onSelect,
}: {
  row: MilestoneRow;
  phaseName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("Milestones");
  const format = useProjectFormat();
  const { milestone, status, tasksDone, tasksTotal } = row;
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-[24px] bg-surface p-3 text-start inset-ring inset-ring-outline focus-visible:focus-ring",
          selected && "inset-ring-[1.5px] inset-ring-scope-deep",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
            status === "risk" ? "bg-danger-soft text-danger-text" : status === "next" ? "bg-scope-soft text-scope-deep" : "bg-subtle text-fg-secondary",
          )}
        >
          <Icon icon={Flag} size={16} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi className="truncate text-sm font-bold text-fg">{milestone.title}</bdi>
          <span className="truncate text-xs font-medium text-fg-secondary">
            <bdi>{t("list.meta", { phase: phaseName, done: format.number(tasksDone), total: format.number(tasksTotal) })}</bdi>
          </span>
        </span>
        <StatusChip tone={STATUS_TONE[status]}>{t(`status.${status}`)}</StatusChip>
        <span className="shrink-0 text-xs font-semibold text-fg max-sm:hidden">{milestone.due ? format.day(milestone.due) : null}</span>
        {milestone.owner ? (
          <Avatar name={milestone.owner.name} initials={milestone.owner.initials} size={32} decorative className="size-7 text-[0.625rem] max-sm:hidden" />
        ) : null}
      </button>
    </li>
  );
}
