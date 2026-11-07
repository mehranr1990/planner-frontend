"use client";

import { ChevronDown, Plus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import type { ProjectHealth, ProjectSummary } from "@/data/project-domain";
import {
  useProjectMilestones,
  useProjectPhases,
  useProjectSummary,
  useProjectWorkflow,
  useSetProjectStatus,
} from "@/data/project-queries";
import { projectHref } from "@/features/navigation/contexts";
import { useProjectFormat } from "../format";
import { useProjectLabels } from "../labels";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { ProjectStatusChip } from "../project-visuals";
import { useOpenProjectSheet } from "../sheets/project-sheet-params";
import { ForYouCard } from "./for-you-card";
import { NextMilestones, ProjectSectionsTabs } from "./overview-sections";
import { PhasesTimeline } from "./phases-timeline";
import { ProjectStatusCard } from "./status-card";

/*
 * PJ-01 · Project overview (/projects/[id]). Read order: title + status →
 * status card (progress, note, 4 KPIs) → For you → phases/timeline →
 * milestones → Activity / Risks & blockers / Team load. One signature card
 * (status). Volt only on the timeline now-dot. Manager+ edits status + note
 * from the status chip popover; others see it read-only. Viewer: no Invite /
 * New task / Accept / Team load; Guest: only "Your shared tasks"; archived:
 * the banner, actions hidden. The right column drops under the main one
 * below 1180px. S4 zones removed: ring, budget, kanban preview, AI insight,
 * header tabs, Assistant FAB.
 */
export function ProjectOverviewScreen() {
  const t = useTranslations("Project");
  const router = useRouter();
  const labels = useProjectLabels();
  const format = useProjectFormat();
  const openSheet = useOpenProjectSheet();
  const { project, capabilities, demo } = useProject();
  const summary = useProjectSummary(project.id);
  const workflow = useProjectWorkflow(project.id);
  const phases = useProjectPhases(project.id);
  const milestones = useProjectMilestones(project.id);
  const archived = project.lifecycle === "archived";
  const guest = project.role === "guest";

  const actions = archived ? null : (
    <>
      {capabilities.invite ? (
        <Button
          variant="secondary"
          size="lg"
          className="bg-surface"
          aria-haspopup="dialog"
          onClick={() => openSheet("project-invite")}
        >
          <Icon icon={UserPlus} size={18} />
          {t("header.invite")}
        </Button>
      ) : capabilities.createTask ? (
        <Tooltip content={t("header.inviteReason")}>
          <Button
            variant="secondary"
            size="lg"
            className="bg-surface"
            aria-disabled="true"
            aria-description={t("header.inviteReason")}
          >
            <Icon icon={UserPlus} size={18} />
            {t("header.invite")}
          </Button>
        </Tooltip>
      ) : null}
      {capabilities.createTask ? (
        <Button size="lg" onClick={() => router.push(`${projectHref(project.id, "tasks")}?add=1`)}>
          <Icon icon={Plus} size={18} />
          {t("header.newTask")}
        </Button>
      ) : null}
    </>
  );

  const meta = (
    <span className="flex flex-wrap items-center gap-2">
      <StatusControl project={project} canEdit={capabilities.editStatus} />
      <span className="rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-fg inset-ring inset-ring-line">
        {format.range(project.startDate, project.endDate)}
      </span>
      <span className="rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-fg inset-ring inset-ring-line">
        {t("header.you", { role: labels.role(project.role) })}
      </span>
    </span>
  );

  const header = <ProjectPageHeader title={<bdi>{project.name}</bdi>} subtitle={meta} actions={actions} />;

  if (demo === "empty") {
    return (
      <>
        {header}
        <AccessState kind="empty" titleAs="h2" />
      </>
    );
  }
  if (guest) {
    return (
      <>
        {header}
        <ForYouCard
          projectId={project.id}
          workflow={workflow.data ?? { version: 0, statuses: [], transitions: {} }}
          canAccept
          shared
        />
      </>
    );
  }
  if (!workflow.data || !phases.data || !milestones.data) {
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
      {demo === "pending" || demo === "quota" || demo === "conflict" ? <AccessState kind={demo} titleAs="h2" /> : null}
      <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProjectStatusCard project={project} kpis={summary.data} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 min-[1180px]:row-span-2">
          <ForYouCard projectId={project.id} workflow={workflow.data} canAccept={capabilities.acceptAssignments} />
          <NextMilestones projectId={project.id} milestones={milestones.data} phases={phases.data} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <PhasesTimeline project={project} phases={phases.data} />
        </div>
        <div className="min-w-0 min-[1180px]:col-span-2">
          <ProjectSectionsTabs
            projectId={project.id}
            workflow={workflow.data}
            showTeamLoad={capabilities.seeTeamLoad}
          />
        </div>
      </div>
    </>
  );
}

const HEALTHS: readonly ProjectHealth[] = ["on-track", "at-risk", "off-track"];

/** Status chip; Manager+ opens a popover to set status + a short note (D9). */
function StatusControl({ project, canEdit }: { project: ProjectSummary; canEdit: boolean }) {
  const t = useTranslations("Project.status");
  const labels = useProjectLabels();
  const save = useSetProjectStatus(project.id);
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<ProjectHealth>(project.health);
  const [note, setNote] = useState(project.statusNote?.text ?? "");
  const noteId = useId();
  const chip = <ProjectStatusChip health={project.health} lifecycle={project.lifecycle} />;
  if (!canEdit) return chip;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setHealth(project.health);
          setNote(project.statusNote?.text ?? "");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("change")}: ${labels.health(project.health)}`}
          className="inline-flex items-center gap-1 rounded-pill"
        >
          {chip}
          <Icon icon={ChevronDown} size={14} className="text-fg-secondary" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={t("title")} className="w-88" data-scope="project">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(
              { health, note },
              {
                onSuccess: () => {
                  setOpen(false);
                  toast({ title: t("saved"), tone: "success" });
                },
              },
            );
          }}
        >
          <p className="type-title text-fg">{t("title")}</p>
          <PillGroup
            label={t("title")}
            value={health}
            onValueChange={setHealth}
            options={HEALTHS.map((value) => ({ value, label: labels.health(value) }))}
          />
          <label htmlFor={noteId} className="text-sm font-semibold text-fg">
            {t("note")}
          </label>
          <Textarea
            id={noteId}
            dir="auto"
            value={note}
            maxLength={280}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("notePlaceholder")}
          />
          <Button type="submit" disabled={save.isPending}>
            {t("save")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
