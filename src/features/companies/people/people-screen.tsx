"use client";

import { ArrowRightLeft, Copy, Ellipsis, LockKeyhole, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { PeopleWorkload, type PeopleWorkloadPerson } from "@/components/context/people-workload";
import type { ManualStatus } from "@/components/context/presence-dot";
import { Avatar } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { SearchField } from "@/components/ui/search-field";
import { Select, SelectItem } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import type { Department, WorkProfile } from "@/data/company-domain";
import {
  useCompanyMutation,
  useCompanyProjects,
  useCompanyTeams,
  useDepartments,
  usePendingCompanyInvites,
  useStaff,
  useTransferPreview,
} from "@/data/company-queries";
import { RepositoryError } from "@/data/repositories";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { companyHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";
import { useCompanyLabels } from "../labels";
import { useOpenCompanySheet } from "../sheets/company-sheet-params";

/*
 * CO-03 · People (/companies/[id]/people). Department pills (All · each
 * department, server counts) drive the shared PeopleWorkload card for that
 * department (bars only for Owner / Org Admin / that department's manager;
 * everyone else sees status rows; "All" lists departments as rows with
 * people + average booked). Then the directory (work profile only — never
 * the sealed file) and the work-profile signature card (notch Edit work
 * profile for Org Admin / HR grant, others Copy contact), whose sealed-file
 * row offers Request access (logged; no file content here). Dept-scoped
 * roles see other departments' people as name + department only.
 */

type View = "directory" | "invitations";
type StatusFilter = "all" | "active" | "leave" | "new";
const LEGEND: readonly ManualStatus[] = ["available", "busy", "away", "off"];
const NEW_THIS_QUARTER = new Set(["p-yasmin", "p-mina", "p-kian"]);

export function CompanyPeopleScreen() {
  const t = useTranslations("Company.people");
  const labels = useCompanyLabels();
  const { company, capabilities, departmentId } = useCompany();
  const writable = useCompanyWritable();
  const staff = useStaff(company.id, company.role);
  const departments = useDepartments(company.id);
  const invites = usePendingCompanyInvites(company.id, capabilities.invite);
  const openSheet = useOpenCompanySheet();
  const [view, setView] = useState<View>("directory");
  const format = useCompanyFormat(company.currency);
  const [pill, setPill] = useState<string>(departmentId ?? "all");
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const header = (
    <CompanyPageHeader
      module="people"
      title={t("title")}
      scope
      actions={
        <>
          {capabilities.invite ? (
            <Segmented<View>
              label={t("view.label")}
              value={view}
              onValueChange={setView}
              options={[
                { value: "directory", label: t("view.directory") },
                { value: "invitations", label: t("view.invitations", { n: format.number(invites.data?.length ?? 0) }) },
              ]}
            />
          ) : null}
          {capabilities.invite && writable ? (
            <Button className="gap-2" onClick={() => openSheet("company-invite")}>
              <Icon icon={Plus} size={16} />
              {t("invite")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (staff.isError || departments.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void staff.refetch()} />
      </>
    );
  }
  if (!staff.data || !departments.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  if (view === "invitations") {
    return (
      <>
        {header}
        <ProductCard as="section" aria-label={t("invitations.title")} className="gap-2">
          {invites.isError ? (
            <ErrorState onRetry={() => void invites.refetch()} />
          ) : invites.isPending ? (
            <AccessLoading />
          ) : invites.data.length === 0 ? (
            <EmptyState title={t("invitations.empty")} size="compact" />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {invites.data.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <bdi className="min-w-0 flex-1 font-bold text-fg">{invite.email ?? t("invitations.noEmail", { role: labels.role(invite.role) })}</bdi>
                  <span className="text-fg-secondary">{t("invitations.line", { department: invite.departmentName })}</span>
                  <StatusChip tone="info">{t("invitations.pending")}</StatusChip>
                </li>
              ))}
            </ul>
          )}
        </ProductCard>
      </>
    );
  }

  // Department scope narrows the pills (never widens).
  const visibleDepts = departments.data.filter(
    (dept) => dept.kind === "department" && (departmentId === null || dept.id === departmentId),
  );
  const activePill = visibleDepts.some((dept) => dept.id === pill) ? pill : departmentId ?? "all";
  const people = staff.data.filter((person) => departmentId === null || person.departmentIds.includes(departmentId));
  const selected = people.find((person) => person.id === selectedId) ?? people.find((person) => person.id === "p-katy") ?? people[0];

  return (
    <>
      {header}
      <PillGroup<string>
        label={t("departmentPills")}
        value={activePill}
        onValueChange={setPill}
        options={[
          ...(departmentId === null ? [{ value: "all", label: t("all"), count: company.people }] : []),
          ...visibleDepts.map((dept) => ({ value: dept.id, label: dept.name, count: dept.people })),
        ]}
      />
      {activePill === "all" ? (
        <DepartmentRows departments={visibleDepts} people={people} onPick={setPill} />
      ) : (
        <DepartmentWorkload
          department={visibleDepts.find((dept) => dept.id === activePill)!}
          people={people}
          selectedId={selected?.id}
          onSelect={setSelectedId}
        />
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Directory people={people} selectedId={selected?.id} onSelect={setSelectedId} />
        {selected ? <WorkProfileCard person={selected} /> : null}
      </div>
    </>
  );
}

function canSeeBars(capabilities: ReturnType<typeof useCompany>["capabilities"], departmentId: string) {
  return capabilities.allDepartments || capabilities.managedDepartmentIds.includes(departmentId);
}

function DepartmentWorkload({
  department,
  people,
  selectedId,
  onSelect,
}: {
  department: Department;
  people: WorkProfile[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("Company.people");
  const tStatus = useTranslations("Team.status");
  const { company, capabilities, me } = useCompany();
  const members = people.filter((person) => person.departmentIds.includes(department.id) && person.status !== "left");
  const bars = canSeeBars(capabilities, department.id);
  const workload: PeopleWorkloadPerson[] = members.map((person) => ({
    id: person.id,
    name: person.name,
    initials: person.initials,
    role: person.position,
    status: person.manualStatus,
    workingOn: person.limited ? undefined : person.workingOn,
    bookedPercent: bars && !person.limited ? person.bookedPercent : null,
    isSelf: person.id === me.id,
  }));
  return (
    <PeopleWorkload
      title={t("workloadTitle", { department: department.name })}
      scope="company"
      people={workload}
      selectedId={members.some((person) => person.id === selectedId) ? selectedId : undefined}
      onSelect={onSelect}
      statusLabel={(status) => tStatus(status ?? "none")}
      legend={LEGEND}
      statusOnly={!bars}
      moreHref={`${companyHref(company.id, "people")}#directory`}
      footnote={bars ? t("workloadNote") : t("statusOnlyNote")}
    />
  );
}

function DepartmentRows({ departments, people, onPick }: { departments: Department[]; people: WorkProfile[]; onPick: (id: string) => void }) {
  const t = useTranslations("Company.people");
  const { company, capabilities } = useCompany();
  const format = useCompanyFormat(company.currency);
  return (
    <ProductCard as="section" aria-labelledby="all-departments" className="gap-3">
      <h2 id="all-departments" className="type-title text-fg">
        {t("allTitle")}
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {departments.map((dept) => {
          // Booking figures are not served in live mode (null): no bar rather than an invented average.
          const members = people.filter((person) => person.departmentIds.includes(dept.id) && !person.limited && person.bookedPercent !== null);
          const average = members.length ? Math.round(members.reduce((total, person) => total + (person.bookedPercent ?? 0), 0) / members.length) : null;
          const bars = canSeeBars(capabilities, dept.id) && average !== null;
          return (
            <li key={dept.id}>
              <button
                type="button"
                onClick={() => onPick(dept.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-row px-2 py-2.5 text-start hover:bg-subtle sm:grid-cols-[minmax(0,10rem)_6rem_minmax(0,1fr)_3.5rem]"
              >
                <bdi className="truncate text-sm font-bold text-fg">{dept.name}</bdi>
                <span className="text-xs font-semibold text-fg-secondary">{t("count", { n: format.number(dept.people) })}</span>
                {bars ? (
                  <>
                    <span aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-subtle max-sm:hidden">
                      <span className="block h-full rounded-pill bg-scope-dot" style={{ width: `${Math.min(100, average!)}%` }} />
                    </span>
                    <span className="text-xs font-bold tabular text-fg max-sm:hidden">{t("avgBooked", { percent: format.percent(average!) })}</span>
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-muted">{t("allNote")}</p>
    </ProductCard>
  );
}

function Directory({
  people,
  selectedId,
  onSelect,
}: {
  people: WorkProfile[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("Company.people");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const matches = (person: WorkProfile, key: StatusFilter) =>
    key === "all" || (key === "active" && person.status === "active") || (key === "leave" && person.status === "leave") || (key === "new" && NEW_THIS_QUARTER.has(person.id));
  const shown = people
    .filter((person) => matches(person, filter))
    .filter((person) => !needle || person.name.toLocaleLowerCase().includes(needle) || person.position.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const count = (key: StatusFilter) => people.filter((person) => matches(person, key)).length;
  return (
    <ProductCard as="section" id="directory" aria-label={t("directory")} className="gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <PillGroup<StatusFilter>
          label={t("statusFilter")}
          value={filter}
          onValueChange={setFilter}
          options={(["all", "active", "leave", "new"] as const).map((key) => ({ value: key, label: t(`filters.${key}`), count: count(key) }))}
        />
        <SearchField value={query} onValueChange={setQuery} aria-label={t("search")} placeholder={t("search")} className="ms-auto w-full sm:w-60" />
      </div>
      {shown.length === 0 ? (
        <EmptyState title={t("noMatch")} size="compact" />
      ) : (
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t("directory")}</caption>
          <thead className="text-start text-xs font-semibold text-fg-muted">
            <tr>
              <th scope="col" className="w-auto pb-2 text-start font-semibold">
                {t("col.person")}
              </th>
              <th scope="col" className="w-32 pb-2 text-start font-semibold max-sm:hidden">
                {t("col.department")}
              </th>
              <th scope="col" className="w-28 pb-2 text-start font-semibold max-md:hidden">
                {t("col.supervisor")}
              </th>
              <th scope="col" className="w-24 pb-2 text-start font-semibold">
                {t("col.status")}
              </th>
              <th scope="col" className="w-10 pb-2">
                <span className="sr-only">{t("col.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((person) => {
              const selected = person.id === selectedId;
              return (
                <tr
                  key={person.id}
                  aria-selected={selected}
                  className={cn("border-t border-line", selected && "bg-scope-soft/60 outline-[1.5px] -outline-offset-[1.5px] outline-scope-deep")}
                >
                  <td className="py-2 pe-2">
                    <button type="button" onClick={() => onSelect(person.id)} className="flex min-h-11 w-full items-center gap-2.5 text-start">
                      <Avatar name={person.name} initials={person.initials} size={32} decorative />
                      <span className="flex min-w-0 flex-col">
                        <bdi className="truncate font-bold text-fg">{person.name}</bdi>
                        {!person.limited ? <bdi className="truncate text-xs text-fg-secondary">{person.position}</bdi> : null}
                      </span>
                    </button>
                  </td>
                  <td className="py-2 pe-2 max-sm:hidden">
                    <span className="inline-flex max-w-full rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep">
                      <bdi className="truncate">{person.departmentNames[0]}</bdi>
                    </span>
                  </td>
                  <td className="py-2 pe-2 text-xs text-fg-secondary max-md:hidden">
                    <bdi>{person.limited ? "" : (person.supervisorName ?? "—")}</bdi>
                  </td>
                  <td className="py-2 pe-2">
                    {person.limited ? null : (
                      <StatusChip tone={person.status === "leave" ? "warning" : "neutral"}>{t(`status.${person.status}`)}</StatusChip>
                    )}
                  </td>
                  <td className="py-2">
                    <RowMenu person={person} onSelect={() => onSelect(person.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-xs text-fg-muted">{t("shown", { n: format.number(shown.length), total: format.number(company.people) })}</p>
    </ProductCard>
  );
}

function RowMenu({ person, onSelect }: { person: WorkProfile; onSelect: () => void }) {
  const t = useTranslations("Company.people");
  const { company, capabilities, me } = useCompany();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={Ellipsis} size="sm" variant="ghost" label={t("menu", { name: person.name })} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onSelect}>{t("viewProfile")}</DropdownMenuItem>
        {capabilities.requestFileAccess || person.id === me.id ? (
          <DropdownMenuItem onSelect={() => router.push(`${companyHref(company.id, "people")}/${person.id}/file`)}>
            {t("file.open")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkProfileCard({ person }: { person: WorkProfile }) {
  const t = useTranslations("Company.people.profile");
  const tPeople = useTranslations("Company.people");
  const labels = useCompanyLabels();
  const { company, capabilities, me } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const teams = useCompanyTeams(company.id);
  const projects = useCompanyProjects(company.id, company.role);
  const [editing, setEditing] = useState(false);
  const titleId = useId();
  const own = person.id === me.id;
  const canEdit = writable && capabilities.editWorkProfile && !person.limited;

  const action = canEdit ? (
    <SignatureCardAction icon={Pencil} label={t("edit")} onClick={() => setEditing(true)} />
  ) : (
    <SignatureCardAction
      icon={Copy}
      variant="neutral"
      label={t("copyContact")}
      disabled={person.limited}
      onClick={() => {
        void navigator.clipboard?.writeText(`${person.name} <${person.email}>`);
        toast({ title: t("copied") });
      }}
    />
  );

  const visibleTeams = (teams.data ?? []).filter((team) => person.departmentIds.includes(team.departmentId)).slice(0, 2);
  const visibleProjects = (projects.data ?? []).filter((project) => project.lead === person.name || person.departmentIds.includes(project.departmentId)).slice(0, 2);

  return (
    <SignatureCard as="section" aria-labelledby={titleId} action={action} contentClassName="gap-3" className="self-start">
      <div className="flex items-center gap-3 pe-14">
        <Avatar name={person.name} initials={person.initials} size={48} tone="company" decorative />
        <div className="flex min-w-0 flex-col">
          <h2 id={titleId} className="type-title text-fg">
            <bdi>{person.name}</bdi>
          </h2>
          <p className="text-xs font-semibold text-fg-secondary">
            {person.limited ? <bdi>{person.departmentNames.join(" · ")}</bdi> : <><bdi>{person.position}</bdi> · <bdi>{person.departmentNames.join(" · ")}</bdi></>}
          </p>
        </div>
      </div>
      {person.limited ? (
        <AccessState kind="company-outside" titleAs="h3" />
      ) : (
        <>
          <dl className="flex flex-col gap-1.5">
            {[
              ["supervisor", person.supervisorName ?? "—"],
              ["role", labels.role(person.role)],
              ["started", person.startedOn ? format.day(person.startedOn, "full") : "—"],
              ["email", `${person.email} · ${t("verified")}`],
              ["hours", person.workHours],
              ["location", person.location],
              ["equipment", person.equipment === null ? "—" : person.equipment.length ? person.equipment.join(" · ") : t("none")],
            ].map(([key, value]) => (
              <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 rounded-row px-3 py-2 inset-ring inset-ring-line">
                <dt className="text-xs text-fg-secondary">{t(key as "supervisor")}</dt>
                <dd className="truncate text-xs font-bold text-fg">
                  <bdi>{value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          {visibleTeams.length + visibleProjects.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("visibleWork")}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {visibleTeams.map((team) => (
                  <li key={team.id} className="inline-flex items-center gap-1.5 rounded-pill bg-team-soft px-3 py-1 text-xs font-bold text-team-deep">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-team-deep" />
                    <bdi>{team.name}</bdi>
                  </li>
                ))}
                {visibleProjects.map((project) => (
                  <li key={project.id} className="inline-flex items-center gap-1.5 rounded-pill bg-project-soft px-3 py-1 text-xs font-bold text-project-deep">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-project-deep" />
                    <bdi>{project.name}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
      {person.limited ? null : <DepartmentSeatRow person={person} own={own} />}
      <SealedFileRow person={person} own={own} />
      {editing ? <EditProfileDialog person={person} onClose={() => setEditing(false)} /> : null}
      <span className="sr-only">{tPeople("profileNote")}</span>
    </SignatureCard>
  );
}

/* Department seat: the person's current department(s); "Move" transfers one seat inside this company (OD-5). */
function DepartmentSeatRow({ person, own }: { person: WorkProfile; own: boolean }) {
  const t = useTranslations("Company.people.transfer");
  const { capabilities } = useCompany();
  const writable = useCompanyWritable();
  const [open, setOpen] = useState(false);
  // Managers move seats only between departments they manage; the server checks every move.
  const sources = person.departmentIds.filter((id) => capabilities.allDepartments || capabilities.managedDepartmentIds.includes(id));
  const canMove = writable && capabilities.transferStaff && !own && person.status !== "left" && sources.length > 0;
  return (
    <div className="flex items-center gap-3 rounded-row px-3 py-2.5 inset-ring inset-ring-line">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-fg-secondary">{t("current")}</span>
        <span className="truncate text-xs font-bold text-fg">{person.departmentNames.length ? <bdi>{person.departmentNames.join(" · ")}</bdi> : t("none")}</span>
      </div>
      {canMove ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Icon icon={ArrowRightLeft} size={14} />
          {t("move")}
        </Button>
      ) : null}
      {open ? <TransferDialog person={person} sources={sources} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

type TransferBlocker = "allocations" | "resourceRequests" | "expenseReviews";

function TransferDialog({ person, sources, onClose }: { person: WorkProfile; sources: string[]; onClose: () => void }) {
  const t = useTranslations("Company.people.transfer");
  const labels = useCompanyLabels();
  const { company, capabilities } = useCompany();
  const format = useCompanyFormat(company.currency);
  const departments = useDepartments(company.id);
  const [from, setFrom] = useState<string | null>(sources.length === 1 ? sources[0]! : null);
  const [to, setTo] = useState<string | null>(null);
  const preview = useTransferPreview(company.id, person.id, from, to);
  const transfer = useCompanyMutation(company.id, (repo, id, vars: { from: string; to: string }) => repo.transferEmployee(id, person.id, vars.from, vars.to));
  // Same company only: another department or unit the person has no seat in (managers: one they manage).
  const targets = (departments.data ?? []).filter(
    (department) => !person.departmentIds.includes(department.id) && (capabilities.allDepartments || capabilities.managedDepartmentIds.includes(department.id)),
  );
  const nameOf = (id: string) => (departments.data ?? []).find((department) => department.id === id)?.name ?? person.departmentNames[person.departmentIds.indexOf(id)] ?? "";
  const failure = transfer.error instanceof RepositoryError ? transfer.error.code : transfer.error ? "other" : null;
  const blockers: [TransferBlocker, number][] = preview.data
    ? ([
        ["allocations", preview.data.activeAllocations],
        ["resourceRequests", preview.data.pendingResourceRequests],
        ["expenseReviews", preview.data.pendingExpenseReviews],
      ] as [TransferBlocker, number][]).filter(([, count]) => count > 0)
    : [];
  const pick = (set: (value: string) => void) => (value: string) => {
    set(value);
    transfer.reset();
  };
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent title={t("title", { name: person.name })} description={t("description")}>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>{t("from")}</FieldLabel>
            {sources.length === 1 ? (
              <p className="text-sm font-bold text-fg">
                <bdi>{nameOf(sources[0]!)}</bdi>
              </p>
            ) : (
              <Select value={from ?? undefined} placeholder={t("choose")} onValueChange={pick(setFrom)}>
                {sources.map((id) => (
                  <SelectItem key={id} value={id}>
                    {nameOf(id)}
                  </SelectItem>
                ))}
              </Select>
            )}
          </Field>
          <Field>
            <FieldLabel>{t("to")}</FieldLabel>
            <Select value={to ?? undefined} placeholder={t("choose")} disabled={!targets.length} onValueChange={pick(setTo)}>
              {targets.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </Select>
            {departments.data && !targets.length ? <p className="text-xs text-fg-secondary">{t("noTargets")}</p> : null}
          </Field>
          {from && to ? (
            preview.isPending ? (
              <p className="text-xs text-fg-secondary" aria-live="polite">
                {t("checking")}
              </p>
            ) : preview.isError ? (
              <InlineAlert tone="danger" title={t(preview.error instanceof RepositoryError && preview.error.code === "forbidden" ? "forbidden" : "previewFailed")} />
            ) : preview.data.allowed ? (
              <InlineAlert tone="info" title={t("readyTitle")} description={t("ready", { role: preview.data.role ? labels.role(preview.data.role) : "—", to: nameOf(to) })} />
            ) : (
              <InlineAlert
                tone="warning"
                title={t("blockedTitle")}
                description={blockers.length ? blockers.map(([key, count]) => t(key, { count, formatted: format.number(count) })).join(" · ") : t("roleChange")}
              />
            )
          ) : null}
          {failure ? <InlineAlert tone="danger" title={t(failure === "conflict" ? "conflict" : failure === "forbidden" ? "forbidden" : "failed")} /> : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!from || !to || !preview.data?.allowed || transfer.isPending}
            onClick={() =>
              transfer.mutate(
                { from: from!, to: to! },
                {
                  onSuccess: () => {
                    toast({ title: t("done", { name: person.name, to: nameOf(to!) }) });
                    onClose();
                  },
                  // Changed or newly blocked elsewhere: ask the server again before another try.
                  onError: () => void preview.refetch(),
                },
              )
            }
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SealedFileRow({ person, own }: { person: WorkProfile; own: boolean }) {
  const t = useTranslations("Company.people.file");
  const { company, capabilities } = useCompany();
  const [requested, setRequested] = useState(false);
  const request = useCompanyMutation(company.id, (repo, id) => repo.requestFileAccess(id, person.id));
  const href = `${companyHref(company.id, "people")}/${person.id}/file`;
  return (
    <div className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
      <Icon icon={LockKeyhole} size={16} className="shrink-0 text-fg-secondary" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-bold text-fg">{own ? t("mine") : t("sealed")}</span>
        <span className="text-xs text-fg-secondary">{own ? t("mineHint") : t("hint")}</span>
      </div>
      {own ? (
        <Link href={href} className="shrink-0 rounded-pill bg-surface px-3 py-1.5 text-xs font-bold text-fg hover:bg-raised">
          {t("openMine")}
        </Link>
      ) : capabilities.requestFileAccess ? (
        requested ? (
          <Link href={href} className="shrink-0 text-xs font-bold text-scope-deep hover:underline">
            {t("requested")}
          </Link>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="bg-surface"
            disabled={request.isPending}
            onClick={() =>
              request.mutate(undefined, {
                onSuccess: () => {
                  setRequested(true);
                  toast({ title: t("requestSent"), description: t("requestSentBody", { name: person.name }) });
                },
              })
            }
          >
            {t("request")}
          </Button>
        )
      ) : null}
    </div>
  );
}

function EditProfileDialog({ person, onClose }: { person: WorkProfile; onClose: () => void }) {
  const t = useTranslations("Company.people.editor");
  const { company } = useCompany();
  const [position, setPosition] = useState(person.position);
  const [location, setLocation] = useState(person.location);
  const [workHours, setWorkHours] = useState(person.workHours);
  const [phone, setPhone] = useState(person.phone ?? "");
  const save = useCompanyMutation(company.id, (repo, id, vars: { position: string; location: string; workHours: string; phone: string | null }) =>
    repo.updateWorkProfile(id, person.id, vars),
  );
  const invalid = !position.trim();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title", { name: person.name })} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (invalid) return;
            save.mutate(
              { position, location, workHours, phone: phone || null },
              {
                onSuccess: () => {
                  toast({ title: t("saved") });
                  onClose();
                },
              },
            );
          }}
        >
          <Field invalid={invalid}>
            <FieldLabel>{t("position")}</FieldLabel>
            <Input dir="auto" value={position} onChange={(event) => setPosition(event.target.value)} />
            {invalid ? <FieldError>{t("positionRequired")}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel>{t("hours")}</FieldLabel>
            <Input dir="auto" value={workHours} onChange={(event) => setWorkHours(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{t("location")}</FieldLabel>
            <Input dir="auto" value={location} onChange={(event) => setLocation(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{t("phone")}</FieldLabel>
            <Input dir="ltr" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
