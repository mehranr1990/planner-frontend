"use client";

import { Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { CompanyCurrency, CompanyRole, CompanySummary } from "@/data/company-domain";
import { useCompanyMutation, useCreateCompany, useDepartments, useEffectivePolicies, useStaff } from "@/data/company-queries";
import { companyHref } from "@/features/navigation/contexts";
import { useCompanyLabels } from "../labels";

/*
 * CO-90 sheets. company-new: creator = Owner; currency and fiscal year are
 * set once (currency locks after the first approved expense); optional first
 * departments. company-invite: verified work email, role (Org Admin · Dept
 * Manager · Team Lead · Member · Viewer), department, position, supervisor;
 * never reveals whether an account exists. department-new: parent, manager
 * and the inherited-policies summary line.
 */

const CURRENCIES: readonly CompanyCurrency[] = ["toman", "rial", "usd", "eur"];
const INVITE_ROLES: readonly Exclude<CompanyRole, "owner">[] = ["admin", "manager", "lead", "member", "viewer"];
const MONTHS = [1, 4, 7, 10] as const;

function Actions({ onCancel, submit, pending }: { onCancel: () => void; submit: ReactNode; pending: boolean }) {
  const t = useTranslations("Company.sheets");
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="secondary" onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button type="submit" disabled={pending}>
        {submit}
      </Button>
    </div>
  );
}

export function NewCompanySheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Company.sheets.new");
  const tCurrency = useTranslations("Company.currencyName");
  const tUnit = useTranslations("Company.currency");
  const tMonths = useTranslations("Company.months");
  const router = useRouter();
  const create = useCreateCompany();
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [currency, setCurrency] = useState<CompanyCurrency>("toman");
  const [fiscal, setFiscal] = useState("1");
  const [departments, setDepartments] = useState("");
  const [touched, setTouched] = useState(false);
  const nameError = touched && !name.trim() ? t("nameRequired") : null;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!name.trim()) return;
        create.mutate(
          { name, legalName, currency, fiscalStartMonth: Number(fiscal), departments: departments.split(/[,،]/) },
          {
            onSuccess: (company: CompanySummary) => {
              toast({ title: t("created", { company: company.name }) });
              onDone();
              router.push(companyHref(company.id));
            },
          },
        );
      }}
    >
      <Field invalid={nameError !== null}>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input dir="auto" value={name} maxLength={60} autoFocus onChange={(event) => setName(event.target.value)} onBlur={() => setTouched(true)} />
        {nameError ? <FieldError>{nameError}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel>{t("legalName")}</FieldLabel>
        <Input dir="auto" value={legalName} maxLength={120} placeholder={t("legalPlaceholder")} onChange={(event) => setLegalName(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("currency")}</FieldLabel>
          <Select value={currency} onValueChange={(value) => setCurrency(value as CompanyCurrency)}>
            {CURRENCIES.map((value) => (
              <SelectItem key={value} value={value}>
                {`${tCurrency(value)} (${tUnit(value)})`}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("fiscal")}</FieldLabel>
          <Select value={fiscal} onValueChange={setFiscal}>
            {MONTHS.map((month) => (
              <SelectItem key={month} value={String(month)}>
                {t("fiscalDay", { month: tMonths(String(month) as "1") })}
              </SelectItem>
            ))}
          </Select>
        </Field>
      </div>
      <p className="-mt-2 text-xs text-fg-secondary">{t("currencyNote")}</p>
      <Field>
        <FieldLabel>{t("departments")}</FieldLabel>
        <Input dir="auto" value={departments} placeholder={t("departmentsPlaceholder")} onChange={(event) => setDepartments(event.target.value)} />
        <FieldDescription>{t("ownerNote")}</FieldDescription>
      </Field>
      {create.isError ? <InlineAlert tone="danger" title={t("failed")} /> : null}
      <Actions onCancel={onDone} submit={t("submit")} pending={create.isPending} />
    </form>
  );
}

export function CompanyInviteSheet({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const t = useTranslations("Company.sheets.invite");
  const labels = useCompanyLabels();
  const departments = useDepartments(companyId);
  const staff = useStaff(companyId, "admin");
  const invite = useCompanyMutation(
    companyId,
    (repo, id, vars: { email: string; role: Exclude<CompanyRole, "owner">; departmentId: string; position: string; supervisorId: string | null }) =>
      repo.invite(id, vars),
  );
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<CompanyRole, "owner">>("member");
  const [departmentId, setDepartmentId] = useState("");
  const [position, setPosition] = useState("");
  const [supervisorId, setSupervisorId] = useState("none");
  const [touched, setTouched] = useState(false);
  const emailError = touched && !/^\S+@\S+\.\S+$/.test(email) ? t("emailInvalid") : null;
  const deptError = touched && !departmentId ? t("departmentRequired") : null;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!/^\S+@\S+\.\S+$/.test(email) || !departmentId) return;
        invite.mutate(
          { email, role, departmentId, position, supervisorId: supervisorId === "none" ? null : supervisorId },
          {
            onSuccess: () => {
              // Same message whether or not an account exists.
              toast({ title: t("sent"), description: t("sentBody") });
              onDone();
            },
          },
        );
      }}
    >
      <Field invalid={emailError !== null}>
        <FieldLabel>{t("email")}</FieldLabel>
        <Input dir="ltr" type="email" autoComplete="off" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} onBlur={() => setTouched(true)} />
        {emailError ? <FieldError>{emailError}</FieldError> : null}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("role")}</FieldLabel>
          <Select value={role} onValueChange={(value) => setRole(value as Exclude<CompanyRole, "owner">)}>
            {INVITE_ROLES.map((value) => (
              <SelectItem key={value} value={value}>
                {labels.role(value)}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field invalid={deptError !== null}>
          <FieldLabel>{t("department")}</FieldLabel>
          <Select value={departmentId} onValueChange={setDepartmentId} placeholder={t("choose")}>
            {(departments.data ?? []).map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </Select>
          {deptError ? <FieldError>{deptError}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel>{t("position")}</FieldLabel>
          <Input dir="auto" value={position} onChange={(event) => setPosition(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{t("supervisor")}</FieldLabel>
          <Select value={supervisorId} onValueChange={setSupervisorId}>
            <SelectItem value="none">{t("noSupervisor")}</SelectItem>
            {(staff.data ?? [])
              .filter((person) => !person.limited && (departmentId === "" || person.departmentIds.includes(departmentId)))
              .map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
          </Select>
        </Field>
      </div>
      <p className="text-xs text-fg-secondary">{t("verifiedOnly")}</p>
      {invite.isError ? <InlineAlert tone="danger" title={t("failed")} /> : null}
      <Actions onCancel={onDone} submit={t("submit")} pending={invite.isPending} />
    </form>
  );
}

export function NewDepartmentSheet({ companyId, companyName, onDone }: { companyId: string; companyName: string; onDone: () => void }) {
  const t = useTranslations("Company.sheets.department");
  const departments = useDepartments(companyId);
  const staff = useStaff(companyId, "admin");
  const anyDept = departments.data?.[0]?.id;
  const policies = useEffectivePolicies(companyId, anyDept);
  const create = useCompanyMutation(companyId, (repo, id, vars: { name: string; parentId: string | null; managerId: string | null }) =>
    repo.createDepartment(id, vars),
  );
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("root");
  const [managerId, setManagerId] = useState("none");
  const [touched, setTouched] = useState(false);
  const nameError = touched && !name.trim() ? t("nameRequired") : null;
  const all = policies.data ?? [];
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!name.trim()) return;
        create.mutate(
          { name, parentId: parentId === "root" ? null : parentId, managerId: managerId === "none" ? null : managerId },
          {
            onSuccess: (dept) => {
              toast({ title: t("created", { name: dept.name }) });
              onDone();
            },
          },
        );
      }}
    >
      <Field invalid={nameError !== null}>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input dir="auto" value={name} maxLength={60} autoFocus onChange={(event) => setName(event.target.value)} onBlur={() => setTouched(true)} />
        {nameError ? <FieldError>{nameError}</FieldError> : null}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("parent")}</FieldLabel>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectItem value="root">{companyName}</SelectItem>
            {(departments.data ?? []).map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel>{t("manager")}</FieldLabel>
          <Select value={managerId} onValueChange={setManagerId}>
            <SelectItem value="none">{t("noManager")}</SelectItem>
            {(staff.data ?? []).map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name}
              </SelectItem>
            ))}
          </Select>
        </Field>
      </div>
      {all.length > 0 ? (
        <p className="flex items-center gap-2 rounded-pill bg-subtle px-3 py-2 text-xs font-semibold text-fg">
          <Icon icon={Shield} size={14} className="text-scope-deep" />
          {t("inherits", { n: all.length, mandatory: all.filter((policy) => policy.level === "mandatory").length })}
        </p>
      ) : null}
      {create.isError ? <InlineAlert tone="danger" title={t("failed")} /> : null}
      <Actions onCancel={onDone} submit={t("submit")} pending={create.isPending} />
    </form>
  );
}
