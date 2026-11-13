"use client";

import { ArrowRight, Link2, Plus, RefreshCw, Target } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { CompanyGoal, CompanyKeyResult } from "@/data/company-domain";
import { useCompanyGoals, useCompanyMutation, useDepartments } from "@/data/company-queries";
import { Progress } from "@/design-system/feedback/progress";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { companyHref } from "@/features/navigation/contexts";
import { parseLocalizedNumber } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";

/*
 * CO-05 · Company goals (/companies/[id]/goals). The cascade: company goals →
 * department goals → linked team goals / projects (links, not copies; only
 * what the viewer can open). Same Goal + key-result model as Personal P11 /
 * Team TM-07: each KR is "auto · child goals on pace" or manual, and always
 * shows its source line. No weighted composite score. Goal signature card:
 * notch Update progress for the goal's owner, others Open linked work.
 */

type Period = "q3" | "q4" | "year";

export function CompanyGoalsScreen() {
  const t = useTranslations("Company.goals");
  const { company, capabilities, departmentId } = useCompany();
  const writable = useCompanyWritable();
  const goals = useCompanyGoals(company.id);
  const params = useSearchParams();
  const [period, setPeriod] = useState<Period>("q4");
  const [selectedId, setSelectedId] = useState<string | undefined>(params.get("goal") ?? undefined);
  const [creating, setCreating] = useState(false);

  const header = (
    <CompanyPageHeader
      module="goals"
      title={t("title")}
      scope
      actions={
        <>
          <Segmented<Period>
            label={t("period.label")}
            value={period}
            onValueChange={setPeriod}
            options={[
              { value: "q3", label: t("period.q3") },
              { value: "q4", label: t("period.q4") },
              { value: "year", label: t("period.year") },
            ]}
          />
          {(capabilities.createCompanyGoal || capabilities.createDepartmentGoal) && writable ? (
            <Button className="gap-2" onClick={() => setCreating(true)}>
              <Icon icon={Plus} size={16} />
              {capabilities.createCompanyGoal ? t("new") : t("newDepartment")}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (goals.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void goals.refetch()} />
      </>
    );
  }
  if (!goals.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  // Q3 history is not part of the mock; the year view lists the same quarter's goals.
  const all = period === "q3" ? [] : goals.data;
  // Department scope narrows to that department's goals and the company goals they roll into.
  const departmentGoals = all.filter((goal) => goal.level === "department" && (departmentId === null || goal.departmentId === departmentId));
  const companyGoals = all.filter(
    (goal) => goal.level === "company" && (departmentId === null || departmentGoals.some((child) => child.parentId === goal.id)),
  );
  const ordered = companyGoals.flatMap((goal) => [goal, ...departmentGoals.filter((child) => child.parentId === goal.id)]);
  const orphans = departmentGoals.filter((goal) => !companyGoals.some((parent) => parent.id === goal.parentId));
  const visible = [...ordered, ...orphans];
  const selected = visible.find((goal) => goal.id === selectedId) ?? visible[0];

  return (
    <>
      {header}
      {visible.length === 0 ? (
        <EmptyState icon={Target} title={t("empty.title")} description={t("empty.body")} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <ProductCard as="section" aria-label={t("tree")} padding="compact" className="gap-1.5">
            <ul aria-label={t("tree")} className="flex flex-col gap-1.5">
              {visible.map((goal) => (
                <GoalRow key={goal.id} goal={goal} selected={goal.id === selected?.id} onSelect={() => setSelectedId(goal.id)} />
              ))}
            </ul>
          </ProductCard>
          {selected ? <GoalCard goal={selected} childGoals={departmentGoals.filter((child) => child.parentId === selected.id)} /> : null}
        </div>
      )}
      {creating ? <CreateGoalDialog companyGoals={goals.data.filter((goal) => goal.level === "company")} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function GoalRow({ goal, selected, onSelect }: { goal: CompanyGoal; selected: boolean; onSelect: () => void }) {
  const t = useTranslations("Company.goals");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const depth = goal.level === "company" ? 0 : 1;
  return (
    <>
      <li>
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          className={cn(
            "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-row px-3 py-2.5 text-start transition-colors hover:bg-subtle sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,8rem)_3rem_auto]",
            selected ? "bg-scope-soft/50 inset-ring-[1.5px] inset-ring-scope-deep" : "inset-ring inset-ring-line",
          )}
          style={{ marginInlineStart: `${depth * 1.25}rem`, width: `calc(100% - ${depth * 1.25}rem)` }}
        >
          <span
            aria-hidden="true"
            className={cn("inline-flex size-8 items-center justify-center rounded-full", goal.level === "company" ? "bg-scope-soft text-scope-deep" : "bg-subtle text-fg-secondary")}
          >
            <Icon icon={Target} size={15} />
          </span>
          <span className="flex min-w-0 flex-col">
            <bdi className="truncate text-sm font-bold text-fg">{goal.title}</bdi>
            <span className="truncate text-xs text-fg-secondary">
              {goal.level === "company" ? t("companyLine", { owner: goal.ownerName }) : <bdi>{goal.departmentName}</bdi>}
            </span>
          </span>
          <Progress value={goal.progress} label={goal.title} size="sm" className="max-sm:hidden" />
          <span className="text-xs font-bold tabular text-fg max-sm:hidden">{format.percent(goal.progress)}</span>
          <StatusChip tone={goal.onPace ? "success" : "warning"}>{goal.onPace ? t("onTrack") : t("atRisk")}</StatusChip>
        </button>
      </li>
      {goal.links.map((link) => (
        <li key={link.id}>
          <Link
            href={link.href}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-row px-3 py-2 text-start hover:bg-subtle sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,8rem)_3rem]"
            style={{ marginInlineStart: `${(depth + 1) * 1.25}rem` }}
          >
            <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-full bg-subtle text-fg-secondary">
              <Icon icon={Link2} size={13} />
            </span>
            <span className="flex min-w-0 flex-col">
              <bdi className="truncate text-sm font-semibold text-fg">{link.name}</bdi>
              <span className="text-xs text-fg-secondary">{link.kind === "project" ? t("linkedProject") : t("linkedTeamGoal")}</span>
            </span>
            <Progress value={link.progress} label={link.name} size="sm" className="max-sm:hidden" indicatorClassName="bg-fg-muted" />
            <span className="text-xs font-bold tabular text-fg-secondary max-sm:hidden">{format.percent(link.progress)}</span>
          </Link>
        </li>
      ))}
    </>
  );
}

function KrSource({ kr }: { kr: CompanyKeyResult }) {
  const t = useTranslations("Company.goals.source");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  return (
    <span className="text-xs text-fg-secondary">
      {kr.source.kind === "auto"
        ? t("auto", { onPace: format.number(kr.source.onPace), children: format.number(kr.source.children) })
        : t("manual", { by: kr.source.by, date: format.day(kr.source.at) })}
    </span>
  );
}

function GoalCard({ goal, childGoals }: { goal: CompanyGoal; childGoals: CompanyGoal[] }) {
  const t = useTranslations("Company.goals");
  const { company, me } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const owner = goal.ownerId === me.id && writable;
  const manual = goal.keyResults.filter((kr) => kr.source.kind === "manual");
  const action =
    owner && manual.length > 0 ? (
      <SignatureCardAction icon={RefreshCw} label={t("update")} onClick={() => setUpdating(true)} />
    ) : (
      <SignatureCardAction
        icon={ArrowRight}
        mirror
        variant="neutral"
        label={t("openLinked")}
        onClick={() => router.push(goal.links[0]?.href ?? companyHref(company.id, "work"))}
      />
    );
  return (
    <SignatureCard as="section" aria-labelledby="goal-title" action={action} contentClassName="gap-3" className="self-start">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">
          {goal.level === "company" ? t("kickerCompany", { quarter: goal.quarter.split(" ")[0] ?? "" }) : t("kickerDepartment", { department: goal.departmentName ?? "" })}
        </p>
        <h2 id="goal-title" className="type-title text-fg">
          <bdi>{goal.title}</bdi>
        </h2>
        <p className="text-xs font-semibold text-fg-secondary">
          {t("owner", { owner: goal.ownerName })}
          {goal.level === "company" ? ` · ${t("children", { n: format.number(childGoals.length) })}` : null}
        </p>
      </div>
      <p className="flex items-center gap-3">
        <span className="text-4xl font-semibold tabular text-fg">{format.percent(goal.progress)}</span>
        <span className={cn("rounded-pill px-2.5 py-1 text-xs font-bold", goal.onPace ? "bg-scope-soft text-scope-deep" : "bg-warning-soft text-warning-text")}>
          {goal.onPace ? t("onPace") : t("behind")}
        </span>
      </p>
      <ul className="flex flex-col gap-2">
        {goal.keyResults.map((kr) => (
          <li key={kr.id} className="flex flex-col gap-1.5 rounded-row px-3 py-2.5 inset-ring inset-ring-line">
            <div className="flex items-center justify-between gap-2">
              <bdi className="text-xs font-bold text-fg">{kr.title}</bdi>
              <span className="text-xs font-bold tabular text-fg">
                {format.number(kr.current)}
                {kr.unit} / {format.number(kr.target)}
                {kr.unit}
              </span>
            </div>
            <Progress value={Math.min(100, (kr.current / kr.target) * 100)} label={kr.title} size="sm" />
            <KrSource kr={kr} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("noScore")}</p>
      {updating ? <UpdateProgressDialog goal={goal} manual={manual} onClose={() => setUpdating(false)} /> : null}
    </SignatureCard>
  );
}

function UpdateProgressDialog({ goal, manual, onClose }: { goal: CompanyGoal; manual: CompanyKeyResult[]; onClose: () => void }) {
  const t = useTranslations("Company.goals.updateDialog");
  const { company } = useCompany();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(manual.map((kr) => [kr.id, String(kr.current)])));
  const update = useCompanyMutation(company.id, (repo, id, vars: { krId: string; current: number }) => repo.updateKeyResult(id, goal.id, vars.krId, vars.current));
  const parsed = Object.fromEntries(manual.map((kr) => [kr.id, parseLocalizedNumber(values[kr.id] ?? "")]));
  const invalid = manual.some((kr) => parsed[kr.id] === null || parsed[kr.id]! < 0);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (invalid) return;
            for (const kr of manual) {
              if (parsed[kr.id] !== kr.current) await update.mutateAsync({ krId: kr.id, current: parsed[kr.id]! });
            }
            toast({ title: t("saved") });
            onClose();
          }}
        >
          {manual.map((kr) => (
            <Field key={kr.id} invalid={parsed[kr.id] === null}>
              <FieldLabel>{t("kr", { title: kr.title, target: kr.target })}</FieldLabel>
              <Input dir="ltr" inputMode="decimal" value={values[kr.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [kr.id]: event.target.value }))} />
              {parsed[kr.id] === null ? <FieldError>{t("invalid")}</FieldError> : null}
            </Field>
          ))}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={invalid || update.isPending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateGoalDialog({ companyGoals, onClose }: { companyGoals: CompanyGoal[]; onClose: () => void }) {
  const t = useTranslations("Company.goals.create");
  const { company, capabilities } = useCompany();
  const departments = useDepartments(company.id);
  const [level, setLevel] = useState<"company" | "department">(capabilities.createCompanyGoal ? "company" : "department");
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState(capabilities.managedDepartmentIds[0] ?? "");
  const [parentId, setParentId] = useState(companyGoals[0]?.id ?? "none");
  const [krTitle, setKrTitle] = useState("");
  const [krTarget, setKrTarget] = useState("");
  const [touched, setTouched] = useState(false);
  const target = parseLocalizedNumber(krTarget);
  const create = useCompanyMutation(
    company.id,
    (repo, id, vars: { level: "company" | "department"; title: string; departmentId: string | null; parentId: string | null; krTitle: string; krTarget: number }) =>
      repo.createGoal(id, vars),
  );
  const errors = {
    title: touched && !title.trim(),
    department: touched && level === "department" && !departmentId,
    kr: touched && (!krTitle.trim() || target === null || target <= 0),
  };
  const deptOptions = (departments.data ?? []).filter((dept) => capabilities.allDepartments || capabilities.managedDepartmentIds.includes(dept.id));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!title.trim() || (level === "department" && !departmentId) || !krTitle.trim() || target === null || target <= 0) return;
            create.mutate(
              { level, title, departmentId: level === "department" ? departmentId : null, parentId: parentId === "none" ? null : parentId, krTitle, krTarget: target },
              {
                onSuccess: () => {
                  toast({ title: t("created") });
                  onClose();
                },
              },
            );
          }}
        >
          {capabilities.createCompanyGoal ? (
            <Segmented
              label={t("level")}
              value={level}
              onValueChange={setLevel}
              options={[
                { value: "company", label: t("company") },
                { value: "department", label: t("department") },
              ]}
            />
          ) : null}
          <Field invalid={errors.title}>
            <FieldLabel>{t("goal")}</FieldLabel>
            <Input dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
            {errors.title ? <FieldError>{t("goalRequired")}</FieldError> : null}
          </Field>
          {level === "department" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field invalid={errors.department}>
                <FieldLabel>{t("department")}</FieldLabel>
                <Select value={departmentId} onValueChange={setDepartmentId} placeholder={t("choose")}>
                  {deptOptions.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </Select>
                {errors.department ? <FieldError>{t("departmentRequired")}</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel>{t("parent")}</FieldLabel>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectItem value="none">{t("noParent")}</SelectItem>
                  {companyGoals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <Field invalid={errors.kr}>
              <FieldLabel>{t("kr")}</FieldLabel>
              <Input dir="auto" value={krTitle} onChange={(event) => setKrTitle(event.target.value)} />
              {errors.kr ? <FieldError>{t("krRequired")}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel>{t("target")}</FieldLabel>
              <Input dir="ltr" inputMode="decimal" value={krTarget} onChange={(event) => setKrTarget(event.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
