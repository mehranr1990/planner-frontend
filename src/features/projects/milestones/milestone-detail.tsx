"use client";

import { format as formatDay } from "date-fns";
import { Link2, Pencil, Zap } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Progress } from "@/design-system/feedback/progress";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { MilestoneRow, ProjectPhase, ProjectRisk, ProjectTask, ProjectWorkflow } from "@/data/project-domain";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { dayToDate, useProjectFormat } from "../format";
import { WorkflowStatusChip } from "../workflow-status-chip";

/*
 * Milestone detail (PJ-08 right column): a SignatureCard whose notch holds
 * "Edit milestone" for Manager+ (Copy link otherwise: notches are never
 * empty). Status eyebrow, phase · due · owner, linked-task progress (number
 * + linear bar) with days left, the linked risk, the tasks and "Open in
 * Tasks (filtered)". The edit dialog renames directly; a new date goes
 * through the schedule preview when anything depends on the milestone.
 */

export interface MilestoneDetailProps {
  projectId: string;
  row: MilestoneRow;
  phase: ProjectPhase | undefined;
  tasks: readonly ProjectTask[];
  workflow: ProjectWorkflow;
  risk: ProjectRisk | null | undefined;
  canEdit: boolean;
  /** Title / date edit: the screen saves the title and previews the date. */
  onSave: (input: { title: string; due: string }) => void;
  /** Heading level (h2 in the column, h1-less sheet on phones). */
  headingId?: string;
}

export function MilestoneDetail({ projectId, row, phase, tasks, workflow, risk, canEdit, onSave, headingId }: MilestoneDetailProps) {
  const t = useTranslations("Milestones");
  const tTask = useTranslations("ProjectTask");
  const tRisk = useTranslations("Project.risks.severity");
  const format = useProjectFormat();
  const [editing, setEditing] = useState(false);
  const { milestone, status, tasksDone, tasksTotal } = row;
  const daysLeft = format.daysFromToday(milestone.due);
  const statusText = t(`status.${status}`);

  const action = canEdit ? (
    <SignatureCardAction icon={Pencil} label={t("detail.edit")} onClick={() => setEditing(true)} />
  ) : (
    <SignatureCardAction
      icon={Link2}
      variant="neutral"
      label={tTask("copyLink")}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href);
        toast({ title: tTask("copied") });
      }}
    />
  );

  return (
    <SignatureCard as="section" aria-labelledby={headingId} action={action} contentClassName="flex flex-col gap-3">
      <p
        className={cn(
          "text-xs font-bold uppercase tracking-wide",
          status === "risk" ? "text-danger-text" : status === "reached" ? "text-success-text" : "text-fg-secondary",
        )}
      >
        {t("detail.eyebrow", { status: statusText })}
      </p>
      <h2 id={headingId} className="type-h2 break-words text-fg">
        <bdi>{milestone.title}</bdi>
      </h2>
      <p className="text-xs font-medium text-fg-secondary">
        <bdi>
          {milestone.owner
            ? t("detail.meta", { phase: phase?.name ?? "", date: format.day(milestone.due), name: milestone.owner.name })
            : t("detail.metaNoOwner", { phase: phase?.name ?? "", date: format.day(milestone.due) })}
        </bdi>
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
          <span className="text-fg">
            {t("detail.progress", { done: format.number(tasksDone), total: format.number(tasksTotal) })}
          </span>
          {daysLeft >= 0 && status !== "reached" ? (
            <span className="text-fg-secondary">
              {t("detail.daysLeft", { n: daysLeft, count: format.number(daysLeft) })}
            </span>
          ) : null}
        </div>
        <Progress
          value={tasksTotal ? (tasksDone / tasksTotal) * 100 : status === "reached" ? 100 : 0}
          label={t("detail.progress", { done: format.number(tasksDone), total: format.number(tasksTotal) })}
          indicatorClassName={status === "risk" ? "bg-danger" : undefined}
        />
      </div>
      {risk ? (
        <p className="flex items-center gap-2 rounded-row bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-text">
          <Icon icon={Zap} size={14} />
          <bdi>{t("detail.risk", { title: risk.title, severity: tRisk(risk.severity) })}</bdi>
        </p>
      ) : null}
      <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-fg-secondary">{t("detail.tasks")}</h3>
      {tasks.length ? (
        <ul className="flex flex-col">
          {tasks.map((task) => {
            const taskStatus = workflow.statuses.find((candidate) => candidate.id === task.statusId);
            return (
              <li key={task.id} className="flex min-h-11 items-center gap-2.5 border-b border-hairline last:border-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-[18px] shrink-0 rounded-full border-[1.8px] border-icon-muted",
                    taskStatus?.category === "done" && "border-0 bg-primary",
                  )}
                />
                <Link
                  href={`/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-fg hover:underline"
                >
                  <bdi>{task.title}</bdi>
                </Link>
                <WorkflowStatusChip status={taskStatus} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-fg-secondary">{t("detail.noTasks")}</p>
      )}
      <Link
        href={`${projectHref(projectId, "tasks")}?milestone=${encodeURIComponent(milestone.id)}`}
        className="self-start text-sm font-semibold text-fg underline underline-offset-2"
      >
        {t("detail.open")}
      </Link>
      {editing ? (
        <EditMilestoneDialog
          title={milestone.title}
          due={milestone.due}
          onClose={() => setEditing(false)}
          onSave={(input) => {
            setEditing(false);
            onSave(input);
          }}
        />
      ) : null}
    </SignatureCard>
  );
}

function EditMilestoneDialog({
  title,
  due,
  onClose,
  onSave,
}: {
  title: string;
  due: string;
  onClose: () => void;
  onSave: (input: { title: string; due: string }) => void;
}) {
  const t = useTranslations("Milestones.edit");
  const tCommon = useTranslations("Common");
  const [name, setName] = useState(title);
  const [day, setDay] = useState(due);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} size="md" data-scope="project">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onSave({ title: name.trim(), due: day });
          }}
        >
          <Field required>
            <FieldLabel>{t("name")}</FieldLabel>
            <Input dir="auto" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-fg">{t("due")}</p>
            <DatePicker
              value={dayToDate(day)}
              onValueChange={(date) => setDay(formatDay(date, "yyyy-MM-dd"))}
              showLegend={false}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
