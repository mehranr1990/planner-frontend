"use client";

import { CalendarDays, Check, Flag, Link2, ListTodo, Pencil, Repeat2, UserRound, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FolderTabsCard, type FolderTab } from "@/design-system/surfaces/folder-tabs-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { ProjectRisk, RiskCloseReason, RiskHistoryEntry, RiskStatus } from "@/data/project-domain";
import {
  useProjectMembers,
  useProjectMilestones,
  useProjectPhases,
  useProjectTaskActions,
  useProjectTasks,
  useRisk,
  useRiskActions,
  useRiskComments,
  useRiskHistory,
  useRiskRegister,
} from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProbabilityChip, RiskStatusChip, SeverityChip } from "./risk-chips";
import { SEVERITIES } from "./risk-model";

/*
 * PJ-16 · Risk / issue detail — same container as the PJ-15 task drawer
 * (soft-nav intercept, full page on hard load, full screen on phones).
 * Head = SignatureCard; the notch is never empty: open risk → Close risk
 * (reason chips + optional note), open issue → Resolve (resolution note
 * required), otherwise (Viewer, closed, no right) → Copy link. Chips:
 * severity, probability, status, linked milestone; the title is editable
 * inline by Manager+ / the risk owner. Properties, Convert to issue + Edit,
 * then FolderTabs Mitigation (plan + checklist, "Make task") · History
 * (audit, never deleted) · Comments (no box for Viewers). Project data only.
 */

const CLOSE_REASONS = ["mitigated", "not-happened", "accepted", "transferred"] as const;
const REASON_KEY: Record<
  RiskCloseReason,
  "mitigated" | "notHappened" | "accepted" | "transferred" | "becameIssue" | "resolved"
> = {
  mitigated: "mitigated",
  "not-happened": "notHappened",
  accepted: "accepted",
  transferred: "transferred",
  "became-issue": "becameIssue",
  resolved: "resolved",
};

export function riskHref(projectId: string, riskId: string) {
  return `${projectHref(projectId, "risks")}/${encodeURIComponent(riskId)}`;
}

export interface RiskDetailViewProps {
  riskId: string;
  variant: "drawer" | "page";
  closeControl?: ReactNode;
}

export function RiskDetailView({ riskId, variant, closeControl }: RiskDetailViewProps) {
  const t = useTranslations("Risk");
  const tDeleted = useTranslations("Access.states.deleted");
  const { project, capabilities } = useProject();
  const risk = useRisk(project.id, riskId);
  const milestones = useProjectMilestones(project.id);

  if (risk.isError) {
    return (
      <AccessState
        kind="deleted"
        titleAs={variant === "page" ? "h1" : "h2"}
        primaryAction={
          <Link href={projectHref(project.id, "risks")} className={buttonVariants()}>
            {tDeleted("action")}
          </Link>
        }
      />
    );
  }
  if (!risk.data || !milestones.data) return <AccessLoading />;

  const data = risk.data;
  const milestone = milestones.data.find((candidate) => candidate.id === data.milestoneId);
  const canEdit = capabilities.editAnyRisk || (capabilities.editOwnRisk && data.owner.id === "me");
  return (
    <article className="flex flex-col gap-3" data-scope="project">
      <RiskHead
        risk={data}
        milestoneTitle={milestone?.title}
        canEdit={canEdit && data.open}
        closeControl={closeControl}
        headingLevel={variant === "page" ? "h1" : "h2"}
      />
      {!capabilities.editOwnRisk ? <InlineAlert tone="info" title={t("viewer")} /> : null}
      <Properties risk={data} />
      {data.open && (capabilities.closeRisk || canEdit) ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {data.kind === "risk" && capabilities.closeRisk ? <ConvertButton risk={data} /> : null}
          {canEdit ? <EditButton risk={data} /> : null}
        </div>
      ) : null}
      <RiskTabs risk={data} canEdit={canEdit && data.open} phaseId={milestone?.phaseId} />
    </article>
  );
}

function useSaveError() {
  const t = useTranslations("Risk");
  const tConflict = useTranslations("Access.states.conflict");
  return (error: unknown) =>
    toast({
      tone: "danger",
      title: error instanceof RepositoryError && error.code === "conflict" ? tConflict("title") : t("error"),
    });
}

function RiskHead({
  risk,
  milestoneTitle,
  canEdit,
  closeControl,
  headingLevel: Heading,
}: {
  risk: ProjectRisk;
  milestoneTitle?: string;
  canEdit: boolean;
  closeControl?: ReactNode;
  headingLevel: "h1" | "h2";
}) {
  const t = useTranslations("Risk");
  const tNav = useTranslations("Navigation");
  const format = useProjectFormat();
  const { project, capabilities } = useProject();
  const actions = useRiskActions(project.id);
  const onError = useSaveError();
  const [panel, setPanel] = useState<"close" | "resolve" | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(risk.title);
  const titleId = useId();

  const copyLink = (
    <SignatureCardAction
      icon={Link2}
      variant="neutral"
      label={t("copyLink")}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href);
        toast({ title: t("copied") });
      }}
    />
  );
  const action =
    risk.open && capabilities.closeRisk ? (
      <SignatureCardAction
        icon={Check}
        label={risk.kind === "issue" ? t("issue.resolve") : t("close")}
        onClick={() => setPanel(risk.kind === "issue" ? "resolve" : "close")}
      />
    ) : (
      copyLink
    );

  const saveTitle = () => {
    setEditing(false);
    const next = title.trim();
    if (!next || next === risk.title) {
      setTitle(risk.title);
      return;
    }
    actions.update.mutate({ riskId: risk.id, patch: { title: next }, revision: risk.revision }, { onError });
  };

  const ageDays = Math.max(0, -format.daysFromToday(risk.raisedAt.slice(0, 10)));

  return (
    <SignatureCard as="section" aria-labelledby={titleId} action={action} contentClassName="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-fg-secondary">
        {closeControl}
        <nav aria-label={risk.kind === "issue" ? t("issueTitle") : t("title")} className="flex min-w-0 items-center gap-1.5">
          <Link href={projectHref(project.id)} className="truncate underline underline-offset-2 hover:text-fg">
            <bdi>{project.name}</bdi>
          </Link>
          <span aria-hidden="true">›</span>
          <Link href={projectHref(project.id, "risks")} className="underline underline-offset-2 hover:text-fg">
            {tNav("items.risks")}
          </Link>
          <span aria-hidden="true">›</span>
          <bdi className="text-fg">{risk.code}</bdi>
        </nav>
      </div>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveTitle();
          }}
        >
          <label htmlFor={`${titleId}-input`} className="sr-only">
            {t("titleField")}
          </label>
          <Input
            id={`${titleId}-input`}
            dir="auto"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setTitle(risk.title);
                setEditing(false);
              }
            }}
            className="type-h2"
          />
        </form>
      ) : (
        <Heading id={titleId} className="type-h2 break-words text-fg">
          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                setTitle(risk.title);
                setEditing(true);
              }}
              className="rounded-[10px] text-start hover:bg-subtle focus-visible:focus-ring"
              aria-label={`${t("edit")}: ${risk.title}`}
            >
              <bdi>{risk.title}</bdi>
            </button>
          ) : (
            <bdi>{risk.title}</bdi>
          )}
        </Heading>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityChip severity={risk.severity} />
        <ProbabilityChip risk={risk} long />
        {risk.kind === "issue" && risk.open ? (
          <span className="inline-flex min-h-7 items-center rounded-pill bg-raised px-3 text-xs font-semibold text-fg">
            {t("issue.age", { n: ageDays })}
          </span>
        ) : risk.open ? (
          <RiskStatusChip status={risk.status} />
        ) : (
          <span className="inline-flex min-h-7 items-center rounded-pill bg-success-soft px-3 text-xs font-semibold text-success-text">
            {t("closedAs", { reason: t(`reason.${REASON_KEY[risk.closeReason ?? "mitigated"]}`) })}
          </span>
        )}
        {milestoneTitle ? (
          <span className="inline-flex min-h-7 items-center gap-1 rounded-pill px-3 text-xs font-semibold text-fg inset-ring inset-ring-outline">
            <Icon icon={Flag} size={12} />
            <bdi>{milestoneTitle}</bdi>
          </span>
        ) : null}
      </div>
      {risk.issueId ? (
        <Link href={riskHref(project.id, risk.issueId)} className="self-start text-xs font-bold text-scope-deep underline underline-offset-2">
          {t("becameIssue", { code: risk.issueCode ?? "" })}
        </Link>
      ) : null}
      {risk.fromRiskId && risk.fromRiskCode ? (
        <Link href={riskHref(project.id, risk.fromRiskId)} className="self-start text-xs font-bold text-scope-deep underline underline-offset-2">
          {t("fromRisk", { code: risk.fromRiskCode })}
        </Link>
      ) : null}
      {panel === "close" ? <CloseDialog risk={risk} onClose={() => setPanel(null)} /> : null}
      {panel === "resolve" ? <ResolveDialog risk={risk} onClose={() => setPanel(null)} /> : null}
    </SignatureCard>
  );
}

function CloseDialog({ risk, onClose }: { risk: ProjectRisk; onClose: () => void }) {
  const t = useTranslations("Risk");
  const { project } = useProject();
  const actions = useRiskActions(project.id);
  const onError = useSaveError();
  const [reason, setReason] = useState<(typeof CLOSE_REASONS)[number]>("mitigated");
  const [note, setNote] = useState("");
  const noteId = useId();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t("close")} size="sm" data-scope="project">
        <div role="radiogroup" aria-label={t("reason.label")} className="flex flex-wrap gap-1.5">
          {CLOSE_REASONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={reason === value}
              onClick={() => setReason(value)}
              className={cn(
                "inline-flex min-h-9 items-center rounded-pill px-3.5 text-xs font-semibold focus-visible:focus-ring",
                reason === value ? "bg-scope-soft text-scope-deep" : "text-fg-secondary inset-ring inset-ring-outline",
              )}
            >
              {t(`reason.${REASON_KEY[value]}`)}
            </button>
          ))}
        </div>
        <label htmlFor={noteId} className="sr-only">
          {t("closeNote")}
        </label>
        <Textarea
          id={noteId}
          dir="auto"
          rows={3}
          value={note}
          placeholder={t("closeNote")}
          onChange={(event) => setNote(event.target.value)}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={actions.close.isPending}
            onClick={() =>
              actions.close.mutate(
                { riskId: risk.id, reason, note, revision: risk.revision },
                {
                  onSuccess: () => {
                    toast({ title: t("closed") });
                    onClose();
                  },
                  onError,
                },
              )
            }
          >
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ risk, onClose }: { risk: ProjectRisk; onClose: () => void }) {
  const t = useTranslations("Risk");
  const { project } = useProject();
  const actions = useRiskActions(project.id);
  const onError = useSaveError();
  const [note, setNote] = useState("");
  const noteId = useId();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t("issue.resolve")} size="sm" data-scope="project">
        <Field>
          <FieldLabel htmlFor={noteId} marker="required">
            {t("issue.resolution")}
          </FieldLabel>
          <Textarea id={noteId} dir="auto" rows={3} required value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!note.trim() || actions.resolve.isPending}
            onClick={() =>
              actions.resolve.mutate(
                { riskId: risk.id, resolution: note, revision: risk.revision },
                {
                  onSuccess: () => {
                    toast({ title: t("issue.resolved") });
                    onClose();
                  },
                  onError,
                },
              )
            }
          >
            {t("issue.resolve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertButton({ risk }: { risk: ProjectRisk }) {
  const t = useTranslations("Risk");
  const tLevel = useTranslations("Risks.level");
  const router = useRouter();
  const { project } = useProject();
  const issues = useRiskRegister(project.id, "issue");
  const actions = useRiskActions(project.id);
  const onError = useSaveError();
  const [open, setOpen] = useState(false);
  const code = `I-${String((issues.data?.length ?? 0) + 1).padStart(2, "0")}`;
  return (
    <>
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Icon icon={Repeat2} size={16} />
        {t("convert")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={t("convert")}
          description={t("convertBody", {
            code,
            title: risk.title,
            severity: tLevel(risk.severity),
            risk: risk.code,
          })}
          size="sm"
          data-scope="project"
        >
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={actions.convert.isPending}
              onClick={() =>
                actions.convert.mutate(
                  { riskId: risk.id, revision: risk.revision },
                  {
                    onSuccess: (issue) => {
                      setOpen(false);
                      toast({ title: t("converted", { code: issue.code }) });
                      router.replace(riskHref(project.id, issue.id));
                    },
                    onError,
                  },
                )
              }
            >
              {t("convertAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditButton({ risk }: { risk: ProjectRisk }) {
  const t = useTranslations("Risk");
  const tRisks = useTranslations("Risks");
  const { project } = useProject();
  const members = useProjectMembers(project.id);
  const actions = useRiskActions(project.id);
  const onError = useSaveError();
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState(risk.severity);
  const [probability, setProbability] = useState(risk.probability);
  const [status, setStatus] = useState<Exclude<RiskStatus, "closed">>(risk.status === "closed" ? "open" : risk.status);
  const [ownerId, setOwnerId] = useState(risk.owner.id);
  const ids = { severity: useId(), probability: useId(), status: useId(), owner: useId() };
  const people = members.data ?? [risk.owner];
  const ownerOptions = people.some((person) => person.id === risk.owner.id) ? people : [risk.owner, ...people];
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => {
          setSeverity(risk.severity);
          setProbability(risk.probability);
          setStatus(risk.status === "closed" ? "open" : risk.status);
          setOwnerId(risk.owner.id);
          setOpen(true);
        }}
      >
        <Icon icon={Pencil} size={16} />
        {t("edit")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("edit")} size="sm" data-scope="project">
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor={ids.severity}>{tRisks("severity")}</FieldLabel>
              <Select id={ids.severity} value={severity} onValueChange={(value) => setSeverity(value as typeof severity)}>
                {SEVERITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {tRisks(`level.${value}`)}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            {risk.kind === "risk" ? (
              <Field>
                <FieldLabel htmlFor={ids.probability}>{tRisks("probability")}</FieldLabel>
                <Select
                  id={ids.probability}
                  value={probability}
                  onValueChange={(value) => setProbability(value as NonNullable<typeof probability>)}
                >
                  {(["low", "medium", "high"] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {tRisks(`level.${value}`)}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
            ) : null}
            {risk.kind === "risk" ? (
              <Field>
                <FieldLabel htmlFor={ids.status}>{tRisks("columns.status")}</FieldLabel>
                <Select id={ids.status} value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                  {(["open", "mitigating", "watching"] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {tRisks(`status.${value}`)}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor={ids.owner}>{t("props.owner")}</FieldLabel>
              <Select id={ids.owner} value={ownerId} onValueChange={setOwnerId}>
                {ownerOptions.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={actions.update.isPending}
              onClick={() =>
                actions.update.mutate(
                  {
                    riskId: risk.id,
                    patch: {
                      severity,
                      ...(risk.kind === "risk" ? { probability, status } : {}),
                      ownerId,
                    },
                    revision: risk.revision,
                  },
                  { onSuccess: () => setOpen(false), onError },
                )
              }
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PropertyRow({ icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-12 grid-cols-[1.25rem_7rem_minmax(0,1fr)] items-center gap-2.5 rounded-row bg-surface px-3.5 py-2">
      <Icon icon={icon} size={16} className="text-fg-secondary" />
      <dt className="text-xs font-medium text-fg-secondary">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold text-fg">{children}</dd>
    </div>
  );
}

function Properties({ risk }: { risk: ProjectRisk }) {
  const t = useTranslations("Risk.props");
  const format = useProjectFormat();
  const { project } = useProject();
  const tasks = useProjectTasks(project.id, {});
  const linked = (risk.taskIds ?? [])
    .map((id) => tasks.data?.tasks.find((task) => task.id === id))
    .filter((task) => task !== undefined);
  return (
    <dl aria-label={t("label")} className="flex flex-col gap-1.5">
      <PropertyRow icon={UserRound} label={t("owner")}>
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={risk.owner.name} initials={risk.owner.initials} size={32} decorative className="size-6 text-[0.5625rem]" />
          <bdi>{risk.owner.name}</bdi>
        </span>
      </PropertyRow>
      {risk.kind === "risk" ? (
        <PropertyRow icon={CalendarDays} label={t("reviewBy")}>
          {risk.reviewBy
            ? risk.reviewCadence === "weekly"
              ? t("review", { date: format.day(risk.reviewBy) })
              : format.day(risk.reviewBy)
            : t("none")}
        </PropertyRow>
      ) : null}
      <PropertyRow icon={ListTodo} label={t("tasks")}>
        {linked.length === 0 ? (
          t("none")
        ) : (
          <span className="flex flex-wrap gap-x-1.5">
            {linked.map((task, index) => (
              <span key={task.id}>
                <Link
                  href={`${projectHref(project.id, "tasks")}/${encodeURIComponent(task.id)}`}
                  className="underline underline-offset-2 hover:text-scope-deep"
                >
                  <bdi>{task.title}</bdi>
                </Link>
                {index < linked.length - 1 ? <span aria-hidden="true"> ·</span> : null}
              </span>
            ))}
          </span>
        )}
      </PropertyRow>
      {risk.kind === "risk" ? (
        <PropertyRow icon={Zap} label={t("trigger")}>
          {risk.trigger ? <bdi dir="auto">{risk.trigger}</bdi> : t("none")}
        </PropertyRow>
      ) : null}
    </dl>
  );
}

function RiskTabs({ risk, canEdit, phaseId }: { risk: ProjectRisk; canEdit: boolean; phaseId?: string }) {
  const t = useTranslations("Risk");
  const format = useProjectFormat();
  const { project, capabilities } = useProject();
  const history = useRiskHistory(project.id, risk.id);
  const comments = useRiskComments(project.id, risk.id);
  const actions = useRiskActions(project.id);
  const taskActions = useProjectTaskActions(project.id);
  const phases = useProjectPhases(project.id);
  const onError = useSaveError();
  const [comment, setComment] = useState("");
  const commentId = useId();
  const checklist = risk.checklist ?? [];
  const done = checklist.filter((item) => item.done).length;
  const taskPhase = phaseId ?? phases.data?.find((phase) => !phase.done)?.id ?? phases.data?.[0]?.id;

  const makeTask = (itemId: string, text: string) => {
    if (!taskPhase) return;
    taskActions.create.mutate(
      { title: text, phaseId: taskPhase },
      {
        onSuccess: (task) =>
          actions.setChecklistItem.mutate(
            { riskId: risk.id, itemId, patch: { taskId: task.id }, revision: risk.revision },
            { onSuccess: () => toast({ title: t("taskMade") }), onError },
          ),
        onError,
      },
    );
  };

  const tabs: FolderTab[] = [
    {
      value: "mitigation",
      label: t("tabs.mitigation"),
      count: checklist.length > 0 ? `${format.number(done)}/${format.number(checklist.length)}` : undefined,
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold tracking-[0.08em] text-fg-secondary uppercase">{t("plan")}</p>
            <p dir="auto" className="text-sm text-fg">
              {risk.mitigation || <span className="text-fg-muted">{t("noPlan")}</span>}
            </p>
          </div>
          {checklist.length > 0 ? (
            <ul aria-label={t("checklist")} className="flex flex-col gap-1">
              {checklist.map((item) => (
                <li key={item.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-row px-2 hover:bg-subtle">
                  <Checkbox
                    checked={item.done}
                    disabled={!canEdit}
                    label={<bdi dir="auto">{item.text}</bdi>}
                    wrapperClassName="min-w-0 flex-1"
                    onCheckedChange={(checked) =>
                      actions.setChecklistItem.mutate(
                        { riskId: risk.id, itemId: item.id, patch: { done: checked === true }, revision: risk.revision },
                        { onError },
                      )
                    }
                  />
                  {item.person ? (
                    <span className="text-xs font-medium text-fg-secondary">
                      <bdi>
                        {item.done && item.doneOn
                          ? t("doneBy", { name: item.person.name, date: format.day(item.doneOn) })
                          : item.due
                            ? t("dueBy", { name: item.person.name, date: format.day(item.due) })
                            : item.person.name}
                      </bdi>
                    </span>
                  ) : null}
                  {item.taskId ? (
                    <Link
                      href={`${projectHref(project.id, "tasks")}/${encodeURIComponent(item.taskId)}`}
                      className="text-xs font-bold text-scope-deep underline underline-offset-2"
                    >
                      {t("openTask")}
                    </Link>
                  ) : !item.done && canEdit && capabilities.createTask ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={taskActions.create.isPending}
                      onClick={() => makeTask(item.id, item.text)}
                      aria-label={`${t("makeTask")}: ${item.text}`}
                    >
                      {t("makeTask")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ),
    },
    {
      value: "history",
      label: t("tabs.history"),
      content: <HistoryList entries={history.data ?? []} />,
    },
    {
      value: "comments",
      label: t("tabs.comments"),
      count: risk.commentCount > 0 ? format.number(risk.commentCount) : undefined,
      content: (
        <div className="flex flex-col gap-3">
          {(comments.data ?? []).length === 0 ? (
            <p className="text-sm text-fg-muted">{t("comments.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(comments.data ?? []).map((item) => (
                <li key={item.id} className="flex gap-2.5">
                  <Avatar name={item.author.name} initials={item.author.initials} size={32} decorative className="size-7 text-[0.625rem]" />
                  <div className="flex min-w-0 flex-col">
                    <p className="text-xs font-bold text-fg">
                      <bdi>{item.author.name}</bdi> <span className="font-medium text-fg-muted">{format.relative(item.at)}</span>
                    </p>
                    <p dir="auto" className="text-sm text-fg">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {capabilities.comment ? (
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!comment.trim()) return;
                actions.addComment.mutate({ riskId: risk.id, body: comment }, { onSuccess: () => setComment(""), onError });
              }}
            >
              <label htmlFor={commentId} className="sr-only">
                {t("comments.placeholder")}
              </label>
              <Textarea
                id={commentId}
                dir="auto"
                rows={1}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t("comments.placeholder")}
                className="min-h-11 flex-1"
              />
              <Button type="submit" size="sm" disabled={!comment.trim() || actions.addComment.isPending}>
                {t("comments.send")}
              </Button>
            </form>
          ) : null}
        </div>
      ),
    },
  ];
  return <FolderTabsCard label={t("tabs.label")} tabs={tabs} defaultValue="mitigation" />;
}

function HistoryList({ entries }: { entries: readonly RiskHistoryEntry[] }) {
  const t = useTranslations("Risk");
  const tRisks = useTranslations("Risks");
  const format = useProjectFormat();
  if (entries.length === 0) return <p className="text-sm text-fg-muted">{t("history.empty")}</p>;
  const value = (entry: RiskHistoryEntry, raw: string | undefined) => {
    if (!raw) return "";
    if (entry.field === "severity" || entry.field === "probability") return tRisks(`level.${raw as "low"}`);
    if (entry.field === "status") return tRisks(`status.${raw as RiskStatus}`);
    if (entry.field === "closed") return t(`reason.${REASON_KEY[raw as RiskCloseReason] ?? "mitigated"}`);
    return raw;
  };
  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2.5 text-sm">
          <Avatar name={entry.actor.name} initials={entry.actor.initials} size={32} decorative className="size-6 text-[0.5625rem]" />
          <div className="flex min-w-0 flex-col">
            <bdi className="text-fg">
              {t(`history.${entry.field}`, {
                actor: entry.actor.id === "me" ? t("you") : entry.actor.name,
                from: value(entry, entry.from),
                to: value(entry, entry.to),
              })}
            </bdi>
            <span className="text-xs font-medium text-fg-muted">{format.relative(entry.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
