"use client";

import { Check, Link2, LockKeyhole, Plus, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { AttachRequest, CompanyProjectRow, CompanyTeamRow } from "@/data/company-domain";
import {
  useAttachCandidates,
  useAttachRequests,
  useCompanyMutation,
  useCompanyProjects,
  useCompanyTeams,
  useDepartments,
} from "@/data/company-queries";
import { RepositoryError } from "@/data/repositories";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { ProjectStatusChip } from "@/features/projects/project-visuals";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";

/*
 * CO-04 · Projects & teams (/companies/[id]/work). The company-custody
 * portfolio: Projects (status from each project, progress, next milestone,
 * open risks, budget = approved spend vs project budget for Owner / Org
 * Admin / Dept Manager, custody) and Teams (department, lead, people, this
 * week's plan completion, custody). Attach existing (P4-06): request →
 * the owner sees the custody & privacy preview and accepts with
 * re-authentication; each linked project needs its own consent; past
 * private items are never revealed in bulk; until accepted the company sees
 * only the name. Detach is not a button (ownership transfer in Settings).
 * The department scope narrows.
 */

type Tab = "projects" | "teams";
type Filter = "all" | "risk" | "paused" | "attached" | "pending";

export function CompanyWorkScreen() {
  const t = useTranslations("Company.work");
  const { company, capabilities, departmentId } = useCompany();
  const writable = useCompanyWritable();
  const projects = useCompanyProjects(company.id, company.role);
  const teams = useCompanyTeams(company.id);
  const requests = useAttachRequests(company.id);
  const [tab, setTab] = useState<Tab>("projects");
  const [filter, setFilter] = useState<Filter>("all");
  const [attaching, setAttaching] = useState(false);
  const format = useCompanyFormat(company.currency);

  const inScope = <T extends { departmentId: string }>(item: T) => departmentId === null || item.departmentId === departmentId;
  const projectList = (projects.data ?? []).filter(inScope);
  const teamList = (teams.data ?? []).filter(inScope);
  const pending = (requests.data ?? []).filter(inScope);

  const header = (
    <CompanyPageHeader
      module="work"
      title={t("title")}
      scope
      actions={
        <>
          <Segmented<Tab>
            label={t("tabs.label")}
            value={tab}
            onValueChange={setTab}
            options={[
              { value: "projects", label: t("tabs.projects", { n: format.number(projectList.length) }) },
              { value: "teams", label: t("tabs.teams", { n: format.number(teamList.length) }) },
            ]}
          />
          {capabilities.requestAttach && writable ? (
            <Button variant="secondary" className="gap-2" onClick={() => setAttaching(true)}>
              <Icon icon={Link2} size={16} />
              {t("attach")}
            </Button>
          ) : null}
          {capabilities.createWork && writable ? (
            <Link
              href={tab === "projects" ? "/projects?sheet=project-new" : "/teams?sheet=team-new"}
              className={cn(buttonVariants(), "gap-2")}
            >
              <Icon icon={Plus} size={16} />
              {tab === "projects" ? t("newProject") : t("newTeam")}
            </Link>
          ) : null}
        </>
      }
    />
  );

  if (projects.isError || teams.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void projects.refetch()} />
      </>
    );
  }
  if (!projects.data || !teams.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  const matches = (project: CompanyProjectRow, key: Filter) =>
    key === "all" ||
    (key === "risk" && project.health !== "on-track" && project.lifecycle === "active") ||
    (key === "paused" && project.lifecycle === "paused") ||
    (key === "attached" && project.custody === "attached");
  const counts = Object.fromEntries((["all", "risk", "paused", "attached"] as const).map((key) => [key, projectList.filter((item) => matches(item, key)).length]));
  const owned = pending.filter((request) => request.iAmOwner);
  const waiting = pending.filter((request) => !request.iAmOwner);

  return (
    <>
      {header}
      {owned.map((request) => (
        <AttachPreview key={request.id} request={request} />
      ))}
      {tab === "projects" ? (
        <ProductCard as="section" aria-label={t("tabs.projectsLabel")} className="gap-3">
          <PillGroup<Filter>
            label={t("filter")}
            value={filter}
            onValueChange={setFilter}
            options={[
              ...(["all", "risk", "paused", "attached"] as const).map((key) => ({ value: key, label: t(`filters.${key}`), count: counts[key] })),
              { value: "pending" as const, label: t("filters.pending"), count: waiting.length + owned.length },
            ]}
          />
          {filter === "pending" ? (
            waiting.length + owned.length === 0 ? (
              <EmptyState title={t("noPending")} size="compact" />
            ) : (
              <p className="text-sm text-fg-secondary">{t("pendingBelow")}</p>
            )
          ) : (
            <ProjectsTable projects={projectList.filter((item) => matches(item, filter))} />
          )}
        </ProductCard>
      ) : (
        <TeamsTable teams={teamList} />
      )}
      {waiting.length > 0 ? (
        <ul aria-label={t("pending.title")} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {waiting.map((request) => (
            <PendingAttachCard key={request.id} request={request} />
          ))}
        </ul>
      ) : null}
      {attaching ? <AttachDialog onClose={() => setAttaching(false)} /> : null}
    </>
  );
}

function ProjectsTable({ projects }: { projects: CompanyProjectRow[] }) {
  const t = useTranslations("Company.work");
  const { company, capabilities } = useCompany();
  const format = useCompanyFormat(company.currency);
  if (projects.length === 0) return <EmptyState title={t("noProjects")} size="compact" />;
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[46rem] text-sm">
        <caption className="sr-only">{t("tabs.projectsLabel")}</caption>
        <thead className="text-xs font-semibold text-fg-muted">
          <tr>
            {["project", "department", "status", "progress", "milestone", "risks", ...(capabilities.seeWorkBudgets ? ["budget"] : []), "custody"].map((key) => (
              <th key={key} scope="col" className="pb-2 text-start font-semibold">
                {t(`col.${key}` as "col.project")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id} className="border-t border-line">
              <td className="py-3 pe-3">
                <Link
                  href={`/projects/${project.id}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-pill bg-project-soft px-3 py-1 text-xs font-bold text-project-deep hover:underline"
                >
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-project-deep" />
                  <bdi className="truncate">{project.name}</bdi>
                </Link>
              </td>
              <td className="py-3 pe-3">
                <span className="rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">
                  <bdi>{project.departmentName}</bdi>
                </span>
              </td>
              <td className="py-3 pe-3">
                <ProjectStatusChip health={project.health} lifecycle={project.lifecycle === "paused" ? "paused" : "active"} />
              </td>
              <td className="py-3 pe-3">
                <div className="flex items-center gap-2">
                  <Progress value={project.progress} label={project.name} size="sm" className="w-24" indicatorClassName="bg-project-deep" />
                  <span className="text-xs font-bold tabular text-fg">{format.percent(project.progress)}</span>
                </div>
              </td>
              <td className="py-3 pe-3 text-xs text-fg">
                {project.nextMilestone ? (
                  <>
                    <bdi>{project.nextMilestone.title}</bdi> · {format.day(project.nextMilestone.due)}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className={cn("py-3 pe-3 text-xs font-bold tabular", project.openRisks > 0 ? "text-danger-text" : "text-fg-muted")}>
                {project.openRisks > 0 ? format.number(project.openRisks) : "—"}
              </td>
              {capabilities.seeWorkBudgets ? (
                <td className="py-3 pe-3 text-xs font-bold tabular text-fg">
                  <span title={project.budget !== null && project.spent !== null ? t("budgetTitle", { spent: format.money(project.spent), budget: format.money(project.budget) }) : undefined}>
                    {project.budget !== null ? format.short(project.budget) : "—"}
                  </span>
                </td>
              ) : null}
              <td className="py-3 text-xs text-fg-secondary">
                {project.custody === "attached" && project.attachedAt ? t("attachedOn", { date: format.day(project.attachedAt) }) : t("custody.company")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsTable({ teams }: { teams: CompanyTeamRow[] }) {
  const t = useTranslations("Company.work");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  return (
    <ProductCard as="section" aria-label={t("tabs.teamsLabel")} className="gap-3">
      {teams.length === 0 ? (
        <EmptyState title={t("noTeams")} size="compact" />
      ) : (
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{t("tabs.teamsLabel")}</caption>
            <thead className="text-xs font-semibold text-fg-muted">
              <tr>
                {(["team", "department", "lead", "people", "plan", "custody"] as const).map((key) => (
                  <th key={key} scope="col" className="pb-2 text-start font-semibold">
                    {t(`teamCol.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id} className="border-t border-line">
                  <td className="py-3 pe-3">
                    <Link
                      href={`/teams/${team.id}`}
                      className="inline-flex items-center gap-1.5 rounded-pill bg-team-soft px-3 py-1 text-xs font-bold text-team-deep hover:underline"
                    >
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-team-deep" />
                      <bdi>{team.name}</bdi>
                    </Link>
                  </td>
                  <td className="py-3 pe-3">
                    <span className="rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">
                      <bdi>{team.departmentName}</bdi>
                    </span>
                  </td>
                  <td className="py-3 pe-3 text-xs text-fg">
                    <bdi>{team.lead}</bdi>
                  </td>
                  <td className="py-3 pe-3 text-xs font-bold tabular text-fg">{format.number(team.people)}</td>
                  <td className="py-3 pe-3">
                    <div className="flex items-center gap-2">
                      <Progress value={team.planCompletion} label={team.name} size="sm" className="w-24" indicatorClassName="bg-team-deep" />
                      <span className="text-xs font-bold tabular text-fg">{format.percent(team.planCompletion)}</span>
                    </div>
                  </td>
                  <td className="py-3 text-xs text-fg-secondary">{t(`custody.${team.custody}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-fg-muted">{t("teamsNote")}</p>
    </ProductCard>
  );
}

function PendingAttachCard({ request }: { request: AttachRequest }) {
  const t = useTranslations("Company.work.pending");
  const { company, capabilities } = useCompany();
  const format = useCompanyFormat(company.currency);
  const cancel = useCompanyMutation(company.id, (repo, id) => repo.cancelAttach(id, request.id));
  return (
    <li>
      <ProductCard as="article" aria-label={t("title")} className="h-full gap-3 inset-ring-[1.5px] inset-ring-warning-text/40">
        <div className="flex items-center justify-between gap-2">
          <h2 className="type-title text-fg">{t("title")}</h2>
          <span className="rounded-pill bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning-text">{t("waiting")}</span>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-secondary">
          <span className={cn("rounded-pill px-2.5 py-1 font-bold", request.kind === "team" ? "bg-team-soft text-team-deep" : "bg-project-soft text-project-deep")}>
            <bdi>{request.subjectName}</bdi>
          </span>
          {t("requested", { when: format.relative(request.requestedAt) })}
        </p>
        <p className="text-xs text-fg-secondary">{t("body")}</p>
        {capabilities.requestAttach ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(undefined, { onSuccess: () => toast({ title: t("cancelled") }) })}
          >
            {t("cancel")}
          </Button>
        ) : null}
      </ProductCard>
    </li>
  );
}

/** Owner side: the custody & privacy preview (P4-06). Accept needs re-authentication; each linked project its own consent. */
function AttachPreview({ request }: { request: AttachRequest }) {
  const t = useTranslations("Company.work.preview");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [reauth, setReauth] = useState(false);
  const decline = useCompanyMutation(company.id, (repo, id) => repo.declineAttach(id, request.id));
  const items: { icon: typeof Check; text: string; tone: string }[] = [
    { icon: Check, text: t("custodian", { company: company.name, subject: request.subjectName }), tone: "text-success-text" },
    { icon: Check, text: t("accounts", { company: company.name }), tone: "text-success-text" },
    { icon: LockKeyhole, text: t("secrets"), tone: "text-scope-deep" },
    { icon: LockKeyhole, text: t("personal"), tone: "text-scope-deep" },
    { icon: X, text: t("policies"), tone: "text-warning-text" },
  ];
  return (
    <ProductCard as="section" aria-labelledby={`preview-${request.id}`} className="gap-3 bg-subtle">
      <h2 id={`preview-${request.id}`} className="type-title text-fg">
        {t("title", { subject: request.subjectName })}
      </h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.text} className="flex items-center gap-2.5 rounded-row bg-surface px-3 py-2 text-xs font-semibold text-fg">
            <Icon icon={item.icon} size={14} className={cn("shrink-0", item.tone)} />
            {item.text}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-pill bg-surface px-3 py-1 text-fg inset-ring inset-ring-line">{t("members", { n: format.number(request.members) })}</span>
        {request.linkedProjects.length > 0 ? (
          <span className="rounded-pill bg-surface px-3 py-1 text-fg inset-ring inset-ring-line">{t("linked", { n: format.number(request.linkedProjects.length) })}</span>
        ) : null}
      </p>
      {request.linkedProjects.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1 text-xs font-bold text-fg-secondary">{t("consent")}</legend>
          {request.linkedProjects.map((project) => (
            <div key={project.id} className="rounded-row bg-surface px-3 py-1">
              <Checkbox
                label={<bdi>{project.name}</bdi>}
                checked={consent[project.id] === true}
                onCheckedChange={(checked) => setConsent((current) => ({ ...current, [project.id]: checked === true }))}
              />
            </div>
          ))}
        </fieldset>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={decline.isPending} onClick={() => decline.mutate(undefined, { onSuccess: () => toast({ title: t("declined") }) })}>
          {t("decline")}
        </Button>
        <Button onClick={() => setReauth(true)}>{t("accept")}</Button>
      </div>
      {reauth ? <ReauthDialog request={request} consent={consent} onClose={() => setReauth(false)} /> : null}
    </ProductCard>
  );
}

function ReauthDialog({ request, consent, onClose }: { request: AttachRequest; consent: Record<string, boolean>; onClose: () => void }) {
  const t = useTranslations("Company.work.reauth");
  const { company } = useCompany();
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const accept = useCompanyMutation(company.id, (repo, id, vars: { password: string }) => repo.acceptAttach(id, request.id, vars.password, consent));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description", { subject: request.subjectName, company: company.name })}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFailed(false);
            accept.mutate(
              { password },
              {
                onSuccess: () => {
                  toast({ title: t("done", { subject: request.subjectName }) });
                  onClose();
                },
                onError: (error) => setFailed(error instanceof RepositoryError && error.code === "forbidden"),
              },
            );
          }}
        >
          <Field invalid={failed}>
            <FieldLabel>{t("password")}</FieldLabel>
            <Input type="password" autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
            {failed ? <FieldError>{t("failed")}</FieldError> : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={accept.isPending}>
              {t("confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttachDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Company.work.request");
  const { company } = useCompany();
  const candidates = useAttachCandidates(company.id, true);
  const departments = useDepartments(company.id);
  const [candidateId, setCandidateId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [touched, setTouched] = useState(false);
  const request = useCompanyMutation(company.id, (repo, id, vars: { candidateId: string; departmentId: string }) =>
    repo.requestAttach(id, vars.candidateId, vars.departmentId),
  );
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!candidateId || !departmentId) return;
            request.mutate(
              { candidateId, departmentId },
              {
                onSuccess: () => {
                  toast({ title: t("sent"), description: t("sentBody") });
                  onClose();
                },
              },
            );
          }}
        >
          <Field invalid={touched && !candidateId}>
            <FieldLabel>{t("subject")}</FieldLabel>
            <Select value={candidateId} onValueChange={setCandidateId} placeholder={t("choose")}>
              {(candidates.data ?? []).map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {`${candidate.name} · ${t(`kind.${candidate.kind}`)} · ${candidate.ownerName}`}
                </SelectItem>
              ))}
            </Select>
            {touched && !candidateId ? <FieldError>{t("subjectRequired")}</FieldError> : null}
          </Field>
          <Field invalid={touched && !departmentId}>
            <FieldLabel>{t("department")}</FieldLabel>
            <Select value={departmentId} onValueChange={setDepartmentId} placeholder={t("choose")}>
              {(departments.data ?? []).map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </Select>
            {touched && !departmentId ? <FieldError>{t("departmentRequired")}</FieldError> : null}
          </Field>
          <InlineAlert tone="info" title={t("privacyTitle")} description={t("privacy")} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={request.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
