"use client";

import { Building2, ChevronRight, Home, Link2, LockKeyhole, Move, Pencil, Plus, Settings2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import type { CompanyTeamRow, Department, EffectivePolicy } from "@/data/company-domain";
import {
  useBudgets,
  useCapacity,
  useCompanyMutation,
  useCompanyProjects,
  useCompanyTeams,
  useDepartments,
  useEffectivePolicies,
  useMovePreview,
  useStaff,
} from "@/data/company-queries";
import { Progress } from "@/design-system/feedback/progress";
import { MetricTile } from "@/design-system/surfaces/metric-tile";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { companyHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";
import { useOpenCompanySheet } from "../sheets/company-sheet-params";

/*
 * CO-02 · Departments (/companies/[id]/departments). Company → Departments →
 * Units / Teams. Tree (expand / collapse; Org Admin re-parents by dragging
 * or "Move…" — always through a preview of moved people, budget and teams)
 * or Chart (read-only org chart). Department signature card: notch Edit
 * department (Org Admin / that Dept Manager), others Copy link; other
 * departments show names only for dept-scoped roles. Policies here: the
 * inherited list with Mandatory (locked) · Default (override with reason,
 * audited) · Optional. Departments are not data spaces. Tree editing is
 * read-only on phones.
 */

type View = "tree" | "chart";

export function DepartmentsScreen() {
  const t = useTranslations("Company.departments");
  const { company, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const departments = useDepartments(company.id);
  const teams = useCompanyTeams(company.id);
  const openSheet = useOpenCompanySheet();
  const [view, setView] = useState<View>("tree");
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const list = departments.data ?? [];
  const selected = list.find((dept) => dept.id === selectedId) ?? list[0];

  const header = (
    <CompanyPageHeader
      module="departments"
      title={t("title")}
      actions={
        <>
          <Segmented<View>
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "tree", label: t("view.tree") },
              { value: "chart", label: t("view.chart") },
            ]}
          />
          {capabilities.manageDepartments && writable ? (
            <Button className="gap-2" onClick={() => openSheet("department-new")}>
              <Icon icon={Plus} size={16} />
              {t("new")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (departments.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void departments.refetch()} />
      </>
    );
  }
  if (!departments.data) {
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
      {view === "chart" ? (
        <OrgChart departments={list} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,20rem)]">
          <OrgTree departments={list} teams={teams.data ?? []} selectedId={selected?.id} onSelect={setSelectedId} />
          {selected ? <DepartmentCard department={selected} departments={list} teams={teams.data ?? []} /> : null}
          {selected ? <PoliciesHere department={selected} /> : null}
        </div>
      )}
    </>
  );
}

/* ── Tree (role=tree, roving focus; drag or Move… to re-parent with a preview) ── */

interface TreeNode {
  id: string;
  kind: "company" | "department" | "unit" | "team";
  name: string;
  count: number;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
}

function OrgTree({
  departments,
  teams,
  selectedId,
  onSelect,
}: {
  departments: Department[];
  teams: CompanyTeamRow[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("Company.departments");
  const { company, capabilities } = useCompany();
  const format = useCompanyFormat(company.currency);
  const writable = useCompanyWritable();
  const desktop = useIsDesktop();
  const canMove = capabilities.manageDepartments && writable && desktop;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [focusId, setFocusId] = useState<string>("root");
  const [moving, setMoving] = useState<{ id: string; parentId: string | null } | null>(null);
  const dragId = useRef<string | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);

  const nodes = useMemo(() => {
    const result: TreeNode[] = [{ id: "root", kind: "company", name: company.name, count: company.people, depth: 0, parentId: null, hasChildren: true }];
    const walk = (parentId: string | null, depth: number) => {
      for (const dept of departments.filter((item) => item.parentId === parentId)) {
        const deptTeams = teams.filter((team) => team.departmentId === dept.id);
        const hasChildren = deptTeams.length > 0 || departments.some((item) => item.parentId === dept.id);
        result.push({ id: dept.id, kind: dept.kind, name: dept.name, count: dept.people, depth, parentId: parentId ?? "root", hasChildren });
        if (collapsed.has(dept.id)) continue;
        for (const team of deptTeams) {
          result.push({ id: `team:${team.id}`, kind: "team", name: team.name, count: team.people, depth: depth + 1, parentId: dept.id, hasChildren: false });
        }
        walk(dept.id, depth + 1);
      }
    };
    if (!collapsed.has("root")) walk(null, 1);
    return result;
  }, [departments, teams, collapsed, company.name, company.people]);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const focusNode = (id: string) => {
    setFocusId(id);
    treeRef.current?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, node: TreeNode, index: number) => {
    const move = (to: number) => {
      const target = nodes[Math.max(0, Math.min(nodes.length - 1, to))];
      if (target) {
        event.preventDefault();
        focusNode(target.id);
      }
    };
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const open = rtl ? "ArrowLeft" : "ArrowRight";
    const close = rtl ? "ArrowRight" : "ArrowLeft";
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(nodes.length - 1);
    else if (event.key === open && node.hasChildren && collapsed.has(node.id)) {
      event.preventDefault();
      toggle(node.id);
    } else if (event.key === close) {
      event.preventDefault();
      if (node.hasChildren && !collapsed.has(node.id)) toggle(node.id);
      else if (node.parentId) focusNode(node.parentId);
    } else if ((event.key === "Enter" || event.key === " ") && (node.kind === "department" || node.kind === "unit")) {
      event.preventDefault();
      onSelect(node.id);
    }
  };

  return (
    <ProductCard as="section" aria-label={t("tree")} padding="compact" className="gap-1 self-start">
      <ul ref={treeRef} role="tree" aria-label={t("tree")} className="flex flex-col gap-0.5">
        {nodes.map((node, index) => {
          const selectable = node.kind === "department" || node.kind === "unit";
          const selected = node.id === selectedId;
          const expanded = node.hasChildren ? !collapsed.has(node.id) : undefined;
          return (
            <li
              key={node.id}
              role="treeitem"
              aria-level={node.depth + 1}
              aria-expanded={expanded}
              aria-selected={selectable ? selected : undefined}
              tabIndex={focusId === node.id ? 0 : -1}
              data-node={node.id}
              draggable={canMove && selectable}
              onDragStart={() => {
                dragId.current = node.id;
              }}
              onDragOver={(event) => {
                if (canMove && dragId.current && dragId.current !== node.id && node.kind !== "team") event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragId.current && dragId.current !== node.id) setMoving({ id: dragId.current, parentId: node.id === "root" ? null : node.id });
                dragId.current = null;
              }}
              onFocus={() => setFocusId(node.id)}
              onKeyDown={(event) => onKeyDown(event, node, index)}
              onClick={() => (selectable ? onSelect(node.id) : undefined)}
              className={cn(
                "group flex min-h-11 cursor-default items-center gap-1.5 rounded-row pe-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus",
                selectable && "cursor-pointer hover:bg-subtle",
                selected && "bg-scope-soft text-scope-deep inset-ring-[1.5px] inset-ring-scope-deep",
              )}
              style={{ paddingInlineStart: `${0.5 + node.depth * 1}rem` }}
            >
              {node.hasChildren ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(node.id);
                  }}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-raised"
                >
                  <Icon icon={ChevronRight} size={14} mirror className={cn("transition-transform", expanded && "rotate-90")} />
                </button>
              ) : (
                <span aria-hidden="true" className="size-6 shrink-0" />
              )}
              <Icon
                icon={node.kind === "team" ? Users : node.kind === "unit" ? Building2 : Home}
                size={15}
                className={cn("shrink-0", node.kind === "team" ? "text-team-deep" : "text-fg-secondary")}
              />
              <bdi className={cn("min-w-0 flex-1 truncate", node.kind === "team" ? "font-medium" : "font-bold")}>{node.name}</bdi>
              <span className="shrink-0 text-xs font-semibold tabular text-fg-muted">
                {node.kind === "team" ? t("teamCount", { n: format.number(node.count) }) : node.kind === "unit" ? t("unitCount", { n: format.number(node.count) }) : format.number(node.count)}
              </span>
              {canMove && selectable ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMoving({ id: node.id, parentId: departments.find((dept) => dept.id === node.id)?.parentId ?? null });
                  }}
                  aria-label={t("move.label", { name: node.name })}
                  className="hidden size-7 shrink-0 items-center justify-center rounded-full text-fg-secondary group-hover:inline-flex group-focus-visible:inline-flex hover:bg-raised"
                >
                  <Icon icon={Move} size={14} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canMove ? (
        <>
          <p className="px-2 pt-2 text-xs text-fg-muted">{t("move.hint")}</p>
          {moving ? <MoveDialog moving={moving} departments={departments} onClose={() => setMoving(null)} /> : null}
        </>
      ) : null}
    </ProductCard>
  );
}

function MoveDialog({
  moving,
  departments,
  onClose,
}: {
  moving: { id: string; parentId: string | null };
  departments: Department[];
  onClose: () => void;
}) {
  const t = useTranslations("Company.departments.move");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const [parentId, setParentId] = useState<string | null>(moving.parentId);
  const dept = departments.find((item) => item.id === moving.id);
  const preview = useMovePreview(company.id, moving.id, parentId);
  const move = useCompanyMutation(company.id, (repo, id, vars: { departmentId: string; parentId: string | null }) =>
    repo.moveDepartment(id, vars.departmentId, vars.parentId),
  );
  // Never into itself or one of its own units.
  const blocked = new Set<string>([moving.id]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const item of departments) {
      if (item.parentId && blocked.has(item.parentId) && !blocked.has(item.id)) {
        blocked.add(item.id);
        changed = true;
      }
    }
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title", { name: dept?.name ?? "" })} description={t("description")}>
        <Field>
          <FieldLabel>{t("parent")}</FieldLabel>
          <Select value={parentId ?? "root"} onValueChange={(value) => setParentId(value === "root" ? null : value)}>
            <SelectItem value="root">{company.name}</SelectItem>
            {departments
              .filter((item) => !blocked.has(item.id))
              .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
          </Select>
        </Field>
        {preview.data ? (
          <InlineAlert
            tone="info"
            title={t("previewTitle")}
            description={t("preview", {
              people: format.number(preview.data.people),
              budget: format.money(preview.data.budget),
              teams: format.number(preview.data.teams),
            })}
          />
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={move.isPending || parentId === moving.parentId}
            onClick={() =>
              move.mutate(
                { departmentId: moving.id, parentId },
                {
                  onSuccess: () => {
                    toast({ title: t("done", { name: dept?.name ?? "" }) });
                    onClose();
                  },
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

/* ── Department signature card ── */

function DepartmentCard({ department, departments, teams }: { department: Department; departments: Department[]; teams: CompanyTeamRow[] }) {
  const t = useTranslations("Company.departments.card");
  const { company, capabilities, myDepartmentIds } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const projects = useCompanyProjects(company.id, company.role);
  const capacity = useCapacity(company.id, true);
  const budgets = useBudgets(company.id, capabilities.budgetCard);
  const [editing, setEditing] = useState(false);
  const titleId = useId();
  const parent = departments.find((item) => item.id === department.parentId);
  const own = myDepartmentIds.includes(department.id) || capabilities.managedDepartmentIds.includes(department.id);
  const fullView = capabilities.allDepartments || own;
  const canEdit = writable && (capabilities.manageDepartments || capabilities.managedDepartmentIds.includes(department.id));
  const deptTeams = teams.filter((team) => team.departmentId === department.id);
  const units = departments.filter((item) => item.parentId === department.id);
  const deptProjects = (projects.data ?? []).filter((project) => project.departmentId === department.id);
  const capacityValue = capacity.data?.rows.find((row) => row.departmentId === department.id)?.values[0];
  const line = budgets.data?.find((item) => item.kind === "department" && item.departmentId === department.id);
  // Projects without a served progress are left out of the average.
  const measured = deptProjects.flatMap((item) => (item.progress === null ? [] : [item.progress]));
  const done = measured.length ? Math.round(measured.reduce((total, value) => total + value, 0) / measured.length) : null;

  const action = canEdit ? (
    <SignatureCardAction icon={Pencil} label={t("edit")} onClick={() => setEditing(true)} />
  ) : (
    <SignatureCardAction
      icon={Link2}
      variant="neutral"
      label={t("copyLink")}
      onClick={() => {
        void navigator.clipboard?.writeText(new URL(`${companyHref(company.id, "departments")}?department=${department.id}`, window.location.origin).toString());
        toast({ title: t("copied") });
      }}
    />
  );

  return (
    <SignatureCard as="section" aria-labelledby={titleId} action={action} contentClassName="gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">{department.kind === "unit" ? t("unitKicker") : t("kicker")}</p>
        <h2 id={titleId} className="type-h2 text-fg">
          <bdi>{department.name}</bdi>
        </h2>
        <p className="text-xs font-semibold text-fg-secondary">
          {t("meta", {
            manager: department.managerName ?? t("noManager"),
            parent: parent?.name ?? company.name,
            people: format.number(department.people),
          })}
        </p>
      </div>
      {!fullView ? (
        <AccessState kind="company-outside" titleAs="h3" />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <li>
              <MetricTile label={t("teamsUnits")} value={format.number(deptTeams.length + units.length)} />
            </li>
            <li>
              <MetricTile label={t("projects")} value={format.number(deptProjects.length)} />
            </li>
            <li>
              <MetricTile label={t("capacity")} value={capacityValue === undefined ? "—" : format.percent(capacityValue)} />
            </li>
            <li>
              <MetricTile label={t("done")} value={done === null ? "—" : format.percent(done)} />
            </li>
          </ul>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("teamsAndUnits")}</h3>
            {deptTeams.length + units.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("noTeams")}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {deptTeams.map((team) => (
                  <li key={team.id} className="inline-flex items-center gap-1.5 rounded-pill bg-team-soft px-3 py-1 text-xs font-bold text-team-deep">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-team-deep" />
                    <bdi>{team.name}</bdi>
                  </li>
                ))}
                {units.map((unit) => (
                  <li key={unit.id} className="rounded-pill bg-subtle px-3 py-1 text-xs font-bold text-fg-secondary">
                    <bdi>{unit.name}</bdi>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("projectsTitle")}</h3>
            {deptProjects.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("noProjects")}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {deptProjects.slice(0, 2).map((project) => (
                  <li key={project.id} className="inline-flex items-center gap-1.5 rounded-pill bg-project-soft px-3 py-1 text-xs font-bold text-project-deep">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-project-deep" />
                    <bdi>{project.name}</bdi>
                  </li>
                ))}
                {deptProjects.length > 2 ? (
                  <li className="rounded-pill bg-subtle px-3 py-1 text-xs font-bold text-fg-secondary">+{format.number(deptProjects.length - 2)}</li>
                ) : null}
              </ul>
            )}
          </div>
          {line ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("budget")}</h3>
              <div className="flex items-center gap-3">
                <Progress value={((line.approved + line.committed) / line.budget) * 100} label={t("budget")} className="flex-1" />
                <span className="shrink-0 text-xs font-bold tabular text-fg">
                  {t("budgetOf", { used: format.short(line.approved), budget: format.short(line.budget) })}
                </span>
              </div>
            </div>
          ) : null}
        </>
      )}
      {editing ? <EditDepartmentDialog department={department} onClose={() => setEditing(false)} /> : null}
    </SignatureCard>
  );
}

function EditDepartmentDialog({ department, onClose }: { department: Department; onClose: () => void }) {
  const t = useTranslations("Company.departments.editor");
  const { company } = useCompany();
  const staff = useStaff(company.id, company.role);
  const [name, setName] = useState(department.name);
  const [managerId, setManagerId] = useState(department.managerId ?? "none");
  const update = useCompanyMutation(company.id, (repo, id, vars: { name: string; managerId: string | null }) =>
    repo.updateDepartment(id, department.id, vars),
  );
  const invalid = !name.trim();
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title", { name: department.name })}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (invalid) return;
            update.mutate(
              { name, managerId: managerId === "none" ? null : managerId },
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
            <FieldLabel>{t("name")}</FieldLabel>
            <Input dir="auto" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
            {invalid ? <FieldError>{t("nameRequired")}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel>{t("manager")}</FieldLabel>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectItem value="none">{t("noManager")}</SelectItem>
              {(staff.data ?? [])
                .filter((person) => !person.limited)
                .map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Policies here ── */

function PoliciesHere({ department }: { department: Department }) {
  const t = useTranslations("Company.departments.policies");
  const tLevel = useTranslations("Company.policy");
  const { company, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const policies = useEffectivePolicies(company.id, department.id);
  const [overriding, setOverriding] = useState<EffectivePolicy | null>(null);
  const canOverride =
    writable && capabilities.overridePolicy && (capabilities.allDepartments || capabilities.managedDepartmentIds.includes(department.id));

  return (
    <ProductCard as="section" aria-labelledby="policies-here" className="gap-3 self-start lg:col-span-2 xl:col-span-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="policies-here" className="type-title text-fg">
          {t("title")}
        </h2>
        <span className="text-xs font-semibold text-fg-secondary">{t("inherited", { company: company.name })}</span>
      </div>
      {!policies.data ? (
        <AccessLoading />
      ) : (
        <ul className="flex flex-col gap-2">
          {policies.data.map((policy) => {
            const overridden = policy.override !== null;
            return (
              <li key={policy.id} className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
                <Icon
                  icon={policy.level === "mandatory" ? LockKeyhole : Settings2}
                  size={15}
                  className={cn("shrink-0", policy.level === "mandatory" ? "text-scope-deep" : "text-fg-secondary")}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <bdi className="text-sm font-bold text-fg">{policy.name}</bdi>
                  <span className="text-xs text-fg-secondary">
                    {overridden ? t("overriddenTo", { value: policy.override!.value }) : policy.value}
                  </span>
                  {policy.level === "mandatory" ? (
                    <span className="text-xs text-fg-muted">{t("setBy", { company: company.name })}</span>
                  ) : null}
                </div>
                {policy.level === "default" && canOverride ? (
                  <button
                    type="button"
                    onClick={() => setOverriding(policy)}
                    className="shrink-0 rounded-pill px-2.5 py-1 text-xs font-bold text-fg inset-ring inset-ring-outline hover:bg-raised"
                  >
                    {overridden ? `${tLevel("default")} · ${t("overridden")}` : `${tLevel("default")} · ${t("override")}`}
                  </button>
                ) : (
                  <span
                    className={cn(
                      "shrink-0 rounded-pill px-2.5 py-1 text-xs font-bold",
                      policy.level === "mandatory" ? "bg-scope-soft text-scope-deep" : "text-fg inset-ring inset-ring-outline",
                    )}
                  >
                    {tLevel(policy.level)}
                    {overridden ? ` · ${t("overridden")}` : null}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-fg-secondary">{t("rule")}</p>
      {overriding ? <OverrideDialog policy={overriding} department={department} onClose={() => setOverriding(null)} /> : null}
    </ProductCard>
  );
}

function OverrideDialog({ policy, department, onClose }: { policy: EffectivePolicy; department: Department; onClose: () => void }) {
  const t = useTranslations("Company.departments.override");
  const { company } = useCompany();
  const [value, setValue] = useState(policy.override?.value ?? policy.value);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const save = useCompanyMutation(company.id, (repo, id, vars: { value: string; reason: string }) =>
    repo.overridePolicy(id, department.id, policy.id, vars.value, vars.reason),
  );
  const reasonError = touched && !reason.trim() ? t("reasonRequired") : null;
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title", { policy: policy.name, department: department.name })} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!reason.trim() || !value.trim()) return;
            save.mutate(
              { value, reason },
              {
                onSuccess: () => {
                  toast({ title: t("saved") });
                  onClose();
                },
              },
            );
          }}
        >
          <Field>
            <FieldLabel>{t("value")}</FieldLabel>
            <Input dir="auto" value={value} onChange={(event) => setValue(event.target.value)} />
          </Field>
          <Field invalid={reasonError !== null}>
            <FieldLabel>{t("reason")}</FieldLabel>
            <Textarea dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} onBlur={() => setTouched(true)} />
            {reasonError ? <FieldError>{reasonError}</FieldError> : null}
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

/* ── Chart (read-only org chart) ── */

function OrgChart({ departments }: { departments: Department[] }) {
  const t = useTranslations("Company.departments");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const top = departments.filter((dept) => dept.parentId === null);
  return (
    <ProductCard as="section" aria-label={t("view.chart")} className="items-center gap-6 overflow-x-auto">
      <div className="rounded-card-sm bg-scope-deep px-5 py-3 text-center text-on-accent">
        <p className="text-sm font-bold">
          <bdi>{company.name}</bdi>
        </p>
        <p className="text-xs">{t("people", { n: format.number(company.people) })}</p>
      </div>
      <ul className="flex w-full flex-wrap justify-center gap-3">
        {top.map((dept) => (
          <li key={dept.id} className="flex min-w-36 flex-col items-center gap-2">
            <div className="w-full rounded-card-sm bg-scope-soft px-4 py-3 text-center text-scope-deep">
              <p className="text-sm font-bold">
                <bdi>{dept.name}</bdi>
              </p>
              <p className="text-xs">
                <bdi>{dept.managerName ?? "—"}</bdi> · {format.number(dept.people)}
              </p>
            </div>
            {departments
              .filter((unit) => unit.parentId === dept.id)
              .map((unit) => (
                <div key={unit.id} className="w-full rounded-row bg-subtle px-3 py-2 text-center text-xs font-semibold text-fg">
                  <bdi>{unit.name}</bdi> · {format.number(unit.people)}
                </div>
              ))}
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("chartNote")}</p>
    </ProductCard>
  );
}
