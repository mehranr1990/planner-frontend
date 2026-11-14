"use client";

import { LockKeyhole, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState, UnavailableState } from "@/components/feedback/state-views";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PillGroup } from "@/components/ui/pills";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import { isLiveApi } from "@/api/runtime";
import type { ApprovalChain, ApprovalSubject, ChainStep, CompanyCurrency, CompanyGrantKind, CompanySettings, PolicyLevel } from "@/data/company-domain";
import { useApprovals, useChains, useCompanyMutation, useCompanySettings, useStaff } from "@/data/company-queries";
import { RepositoryError } from "@/data/repositories";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { parseLocalizedNumber } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";
import { useCompanyLabels } from "../labels";

/*
 * CO-14 · Company settings (/companies/[id]/settings?tab=general · policies ·
 * chains · roles · lifecycle), FolderTabs. General: name, legal name,
 * currency (locked after the first approved expense), fiscal year start.
 * Policies: Mandatory / Default / Optional per policy (mandatory security
 * can never be relaxed). Approval chains: sequential steps per subject with
 * amount conditions and escalation, draft → publish (new requests only).
 * Roles & access: roles + special grants (Finance / HR / Security reviewer —
 * explicit, time-limited, not roles). Lifecycle (Owner): transfer ownership
 * (acceptance + re-auth, ≥1 eligible custodian), archive, delete with
 * retention holds. Policies and the chain editor are read-only on phones.
 */

type Tab = "general" | "policies" | "chains" | "roles" | "lifecycle";
const TABS: readonly Tab[] = ["general", "policies", "chains", "roles", "lifecycle"];
const SUBJECTS: readonly ApprovalSubject[] = ["expenses", "resources", "headcount", "budget"];
const CURRENCIES: readonly CompanyCurrency[] = ["toman", "rial", "usd", "eur"];
const GRANTS: readonly CompanyGrantKind[] = ["finance", "hr", "security"];

export function CompanySettingsScreen() {
  const t = useTranslations("Company.settings");
  const { company, capabilities } = useCompany();
  const settings = useCompanySettings(company.id, capabilities.openSettings);
  const chains = useChains(company.id);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "general";
  const setTab = (next: string) => {
    const search = new URLSearchParams(params.toString());
    search.set("tab", next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };

  const header = (
    <CompanyPageHeader
      module="settings"
      title={t("title")}
      actions={
        isLiveApi() ? null : (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-warning-soft px-3 py-1.5 text-xs font-bold text-warning-text">
            <Icon icon={Zap} size={13} />
            {t("mock")}
          </span>
        )
      }
    />
  );

  if (!capabilities.openSettings) {
    return (
      <>
        {header}
        <UnavailableState title={t("noAccess.title")} description={t("noAccess.body")} titleAs="h2" />
      </>
    );
  }
  if (settings.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void settings.refetch()} />
      </>
    );
  }
  if (!settings.data || !chains.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }
  const data = settings.data;
  return (
    <>
      {header}
      <FolderTabsCard
        label={t("tabs.label")}
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "general", label: t("tabs.general"), content: <General key={data.name} settings={data} /> },
          { value: "policies", label: t("tabs.policies"), count: data.policies.length, content: <Policies settings={data} /> },
          { value: "chains", label: t("tabs.chains"), count: SUBJECTS.length, content: <Chains chains={chains.data} /> },
          { value: "roles", label: t("tabs.roles"), content: <Roles settings={data} /> },
          { value: "lifecycle", label: t("tabs.lifecycle"), content: <Lifecycle settings={data} /> },
        ]}
      />
    </>
  );
}

function General({ settings }: { settings: CompanySettings }) {
  const t = useTranslations("Company.settings.general");
  const tCurrency = useTranslations("Company.currencyName");
  const tMonths = useTranslations("Company.months");
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const [name, setName] = useState(settings.name);
  const [legalName, setLegalName] = useState(settings.legalName);
  const [currency, setCurrency] = useState(settings.currency);
  const [fiscal, setFiscal] = useState(settings.fiscalStartMonth === null ? "" : String(settings.fiscalStartMonth));
  const save = useCompanyMutation(company.id, (repo, id, vars: { name: string; legalName: string; currency: CompanyCurrency | null; fiscalStartMonth: number | null }) =>
    repo.updateGeneral(id, vars),
  );
  return (
    <form
      className="flex max-w-2xl flex-col gap-4 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        save.mutate({ name, legalName, currency, fiscalStartMonth: fiscal ? Number(fiscal) : null }, { onSuccess: () => toast({ title: t("saved") }) });
      }}
    >
      <Field invalid={!name.trim()}>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input dir="auto" value={name} disabled={!writable} onChange={(event) => setName(event.target.value)} />
        {!name.trim() ? <FieldError>{t("nameRequired")}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel>{t("legalName")}</FieldLabel>
        <Input dir="auto" value={legalName} disabled={!writable} onChange={(event) => setLegalName(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>{t("currency")}</FieldLabel>
          <Select value={currency ?? ""} disabled={!writable || settings.currencyLocked} onValueChange={(value) => setCurrency(value as CompanyCurrency)}>
            {CURRENCIES.map((value) => (
              <SelectItem key={value} value={value}>
                {tCurrency(value)}
              </SelectItem>
            ))}
          </Select>
          <FieldDescription>
            {settings.currencyLocked ? (
              <span className="inline-flex items-center gap-1">
                <Icon icon={LockKeyhole} size={12} />
                {t("currencyLocked")}
              </span>
            ) : (
              t("currencyOpen")
            )}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>{t("fiscal")}</FieldLabel>
          <Select value={fiscal} disabled={!writable} onValueChange={setFiscal}>
            {[1, 4, 7, 10].map((month) => (
              <SelectItem key={month} value={String(month)}>
                {t("fiscalDay", { month: tMonths(String(month) as "1") })}
              </SelectItem>
            ))}
          </Select>
        </Field>
      </div>
      {save.isError ? <InlineAlert tone="danger" title={t("failed")} /> : null}
      {writable ? (
        <Button type="submit" className="self-start" disabled={save.isPending}>
          {t("save")}
        </Button>
      ) : null}
    </form>
  );
}

function Policies({ settings }: { settings: CompanySettings }) {
  const t = useTranslations("Company.settings.policies");
  const tLevel = useTranslations("Company.policy");
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const desktop = useIsDesktop();
  const set = useCompanyMutation(company.id, (repo, id, vars: { policyId: string; level: PolicyLevel }) => repo.setPolicyLevel(id, vars.policyId, vars.level));
  const editable = writable && desktop;
  return (
    <div className="flex flex-col gap-2 p-1">
      <ul className="flex flex-col gap-2">
        {settings.policies.map((policy) => (
          <li key={policy.id} className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <bdi className="text-sm font-bold text-fg">{policy.name}</bdi>
              <span className="text-xs text-fg-secondary">
                <bdi>{policy.value}</bdi>
                {policy.security ? ` · ${t("security")}` : null}
              </span>
            </div>
            {editable ? (
              <Segmented<PolicyLevel>
                label={t("level", { policy: policy.name })}
                size="sm"
                value={policy.level}
                onValueChange={(level) =>
                  set.mutate(
                    { policyId: policy.id, level },
                    {
                      onSuccess: () => toast({ title: t("saved", { policy: policy.name, level: tLevel(level) }) }),
                      onError: (error) => {
                        if (error instanceof RepositoryError && error.code === "forbidden") toast({ title: t("securityLocked") });
                      },
                    },
                  )
                }
                options={(["mandatory", "default", "optional"] as const).map((level) => ({
                  value: level,
                  label: tLevel(level),
                }))}
              />
            ) : (
              <span className="rounded-pill bg-scope-soft px-2.5 py-1 text-xs font-bold text-scope-deep">{tLevel(policy.level)}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-secondary">{desktop ? t("rule") : t("readOnlyPhone")}</p>
    </div>
  );
}

function Chains({ chains }: { chains: ApprovalChain[] }) {
  const t = useTranslations("Company.settings.chains");
  const tSubject = useTranslations("Company.approvals.subject");
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const desktop = useIsDesktop();
  const format = useCompanyFormat(company.currency);
  const approvals = useApprovals(company.id);
  const [subject, setSubject] = useState<ApprovalSubject>("expenses");
  const published = chains.find((chain) => chain.subject === subject && chain.status === "published");
  const draft = chains.find((chain) => chain.subject === subject && chain.status === "draft");
  const [editing, setEditing] = useState<{ index: number; step: ChainStep } | null>(null);
  const save = useCompanyMutation(company.id, (repo, id, steps: ChainStep[]) => repo.saveChainDraft(id, subject, steps));
  const publish = useCompanyMutation(company.id, (repo, id) => repo.publishChain(id, subject));
  const steps = draft?.steps ?? published?.steps ?? [];
  const editable = writable && desktop;
  const pending = (approvals.data ?? []).filter((item) => item.subject === subject && item.status === "pending" && item.chainVersion === published?.version).length;
  const approverLabel = (step: ChainStep) => t(`approver.${step.approver}`);
  const escalateLabel = (to: ChainStep["escalateTo"]) => t(`approver.${to}`);
  const condition = (step: ChainStep) =>
    `${step.minAmount === null ? t("always") : t("ifAmount", { amount: format.money(step.minAmount) })} · ${t("escalation", { days: step.escalateAfterDays, to: escalateLabel(step.escalateTo) })}`;

  const commit = (next: ChainStep[]) => save.mutate(next, { onSuccess: () => toast({ title: t("draftSaved", { v: (published?.version ?? 0) + 1 }) }) });

  return (
    <div className="flex flex-col gap-3 p-1">
      <PillGroup<ApprovalSubject>
        label={t("subjects")}
        value={subject}
        onValueChange={setSubject}
        options={SUBJECTS.map((value) => {
          const chain = chains.find((item) => item.subject === value && item.status === "published");
          return { value, label: `${tSubject(value)} v${chain?.version ?? 1}` };
        })}
      />
      <p className="flex flex-wrap gap-2 text-xs font-bold">
        {published ? (
          <span className="rounded-pill bg-subtle px-3 py-1 text-fg">
            {t("published", { v: published.version, date: published.publishedAt ? format.day(published.publishedAt.slice(0, 10)) : "" })}
          </span>
        ) : null}
        {draft ? <span className="rounded-pill bg-info-soft px-3 py-1 text-info-text">{t("draft", { v: draft.version })}</span> : null}
      </p>
      <ol className="flex flex-col gap-2" aria-label={t("steps")}>
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold tabular text-fg">{format.number(index + 1)}</span>
            <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <bdi className="text-sm font-bold text-fg">
                {step.label} <span className="font-medium text-fg-secondary">· {approverLabel(step)}</span>
              </bdi>
              <span className="text-xs text-fg-secondary">{condition(step)}</span>
            </div>
            {editable ? (
              <>
                <IconButton icon={Pencil} size="sm" variant="ghost" label={t("editStep", { n: index + 1 })} onClick={() => setEditing({ index, step })} />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  variant="ghost"
                  label={t("removeStep", { n: index + 1 })}
                  disabled={steps.length === 1}
                  onClick={() => commit(steps.filter((_, other) => other !== index))}
                />
              </>
            ) : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <Button
          variant="ghost"
          className="gap-2 self-start"
          onClick={() =>
            setEditing({
              index: steps.length,
              step: { id: `s-${Date.now()}`, label: "", approver: "dept-manager", minAmount: null, escalateAfterDays: 3, escalateTo: "admin" },
            })
          }
        >
          <Icon icon={Plus} size={16} />
          {t("addStep")}
        </Button>
      ) : (
        <p className="text-xs text-fg-secondary">{t("readOnlyPhone")}</p>
      )}
      {draft && editable ? (
        <div className="flex flex-wrap items-center gap-3 rounded-row bg-warning-soft px-4 py-3">
          <p className="min-w-0 flex-1 text-xs font-semibold text-warning-text">
            {t("publishNote", { v: draft.version, n: pending, old: published?.version ?? 1 })}
          </p>
          <Button disabled={publish.isPending} onClick={() => publish.mutate(undefined, { onSuccess: () => toast({ title: t("publishedToast", { v: draft.version }) }) })}>
            {t("publish", { v: draft.version })}
          </Button>
        </div>
      ) : null}
      {editing ? (
        <StepDialog
          step={editing.step}
          onClose={() => setEditing(null)}
          onSave={(step) => {
            const next = [...steps];
            next[editing.index] = step;
            commit(next);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function StepDialog({ step, onClose, onSave }: { step: ChainStep; onClose: () => void; onSave: (step: ChainStep) => void }) {
  const t = useTranslations("Company.settings.chains");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const [label, setLabel] = useState(step.label);
  const [approver, setApprover] = useState(step.approver);
  const [minAmount, setMinAmount] = useState(step.minAmount === null ? "" : format.amount(step.minAmount));
  const [days, setDays] = useState(String(step.escalateAfterDays));
  const [escalateTo, setEscalateTo] = useState(step.escalateTo);
  const [touched, setTouched] = useState(false);
  const amount = minAmount.trim() ? parseLocalizedNumber(minAmount.replace(/[\s٬,]/g, "")) : null;
  const dayCount = parseLocalizedNumber(days);
  const invalid = !label.trim() || (minAmount.trim() !== "" && (amount === null || amount < 0)) || dayCount === null || dayCount < 1;
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={step.label ? t("editTitle", { label: step.label }) : t("addTitle")} description={t("stepDescription")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (invalid) return;
            onSave({ ...step, label: label.trim(), approver, minAmount: amount, escalateAfterDays: dayCount!, escalateTo });
          }}
        >
          <Field invalid={touched && !label.trim()}>
            <FieldLabel>{t("stepLabel")}</FieldLabel>
            <Input dir="auto" value={label} onChange={(event) => setLabel(event.target.value)} />
            {touched && !label.trim() ? <FieldError>{t("labelRequired")}</FieldError> : null}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("approverLabel")}</FieldLabel>
              <Select value={approver} onValueChange={(value) => setApprover(value as ChainStep["approver"])}>
                {(["dept-manager", "finance", "hr", "admin", "owner"] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`approver.${value}`)}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            <Field invalid={touched && minAmount.trim() !== "" && amount === null}>
              <FieldLabel>{t("minAmount", { unit: format.unit })}</FieldLabel>
              <Input dir="ltr" inputMode="numeric" className="tabular" placeholder={t("always")} value={minAmount} onChange={(event) => setMinAmount(event.target.value)} />
            </Field>
            <Field invalid={touched && (dayCount === null || dayCount < 1)}>
              <FieldLabel>{t("escalateDays")}</FieldLabel>
              <Input dir="ltr" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{t("escalateTo")}</FieldLabel>
              <Select value={escalateTo} onValueChange={(value) => setEscalateTo(value as ChainStep["escalateTo"])}>
                <SelectItem value="admin">{t("approver.admin")}</SelectItem>
                <SelectItem value="owner">{t("approver.owner")}</SelectItem>
              </Select>
            </Field>
          </div>
          <p className="text-xs text-fg-secondary">{t("requesterRule")}</p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("saveStep")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Roles({ settings }: { settings: CompanySettings }) {
  const t = useTranslations("Company.settings.roles");
  const labels = useCompanyLabels();
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const format = useCompanyFormat(company.currency);
  const staff = useStaff(company.id, "admin");
  const [adding, setAdding] = useState(false);
  const setGrant = useCompanyMutation(company.id, (repo, id, vars: { personId: string; kind: CompanyGrantKind; until: string | null; on: boolean }) =>
    repo.setGrant(id, vars.personId, vars.kind, vars.until, vars.on),
  );
  const counts = (["owner", "admin", "manager", "lead", "member", "viewer"] as const).map((role) => ({
    role,
    n: (staff.data ?? []).filter((person) => person.role === role).length,
  }));
  return (
    <div className="grid gap-4 p-1 lg:grid-cols-2">
      <section aria-labelledby="roles-title" className="flex flex-col gap-2">
        <h3 id="roles-title" className="text-sm font-bold text-fg">
          {t("roles")}
        </h3>
        <ul className="flex flex-col gap-1.5">
          {counts.map(({ role, n }) => (
            <li key={role} className="flex items-center justify-between rounded-row bg-subtle px-3 py-2 text-sm">
              <span className="font-semibold text-fg">{labels.role(role)}</span>
              <span className="text-xs text-fg-secondary">{t(`roleNote.${role}`)}</span>
              <span className="text-xs font-bold tabular text-fg">{format.number(n)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="grants-title" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id="grants-title" className="text-sm font-bold text-fg">
            {t("grants")}
          </h3>
          {writable ? (
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setAdding(true)}>
              <Icon icon={Plus} size={14} />
              {t("addGrant")}
            </Button>
          ) : null}
        </div>
        <ul className="flex flex-col gap-1.5">
          {settings.grants.map((grant) => (
            <li key={`${grant.kind}-${grant.personId}`} className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2 text-sm">
              <span className="rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep">{t(`grant.${grant.kind}`)}</span>
              <bdi className="min-w-0 flex-1 font-semibold text-fg">{grant.personName}</bdi>
              <span className="text-xs text-fg-secondary">{grant.until ? t("until", { date: format.day(grant.until) }) : t("noEnd")}</span>
              {writable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={setGrant.isPending}
                  onClick={() => setGrant.mutate({ personId: grant.personId, kind: grant.kind, until: null, on: false }, { onSuccess: () => toast({ title: t("revoked") }) })}
                >
                  {t("revoke")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-secondary">{t("grantsNote")}</p>
      </section>
      {adding ? (
        <GrantDialog
          people={(staff.data ?? []).map((person) => ({ id: person.id, name: person.name }))}
          onClose={() => setAdding(false)}
          onSave={(vars) =>
            setGrant.mutate(
              { ...vars, on: true },
              {
                onSuccess: () => {
                  toast({ title: t("granted") });
                  setAdding(false);
                },
              },
            )
          }
        />
      ) : null}
    </div>
  );
}

function GrantDialog({
  people,
  onClose,
  onSave,
}: {
  people: { id: string; name: string }[];
  onClose: () => void;
  onSave: (vars: { personId: string; kind: CompanyGrantKind; until: string | null }) => void;
}) {
  const t = useTranslations("Company.settings.roles");
  const [personId, setPersonId] = useState("");
  const [kind, setKind] = useState<CompanyGrantKind>("hr");
  const [until, setUntil] = useState("2026-12-31");
  const [touched, setTouched] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("addGrant")} description={t("grantsNote")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!personId) return;
            onSave({ personId, kind, until: until || null });
          }}
        >
          <Field invalid={touched && !personId}>
            <FieldLabel>{t("person")}</FieldLabel>
            <Select value={personId} onValueChange={setPersonId} placeholder={t("choose")}>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </Select>
            {touched && !personId ? <FieldError>{t("personRequired")}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel>{t("kind")}</FieldLabel>
            <Select value={kind} onValueChange={(value) => setKind(value as CompanyGrantKind)}>
              {GRANTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`grant.${value}`)}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t("untilLabel")}</FieldLabel>
            <Input type="date" dir="ltr" value={until} onChange={(event) => setUntil(event.target.value)} />
            <FieldDescription>{t("untilHint")}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("grantSubmit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Lifecycle({ settings }: { settings: CompanySettings }) {
  const t = useTranslations("Company.settings.lifecycle");
  const { company, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const router = useRouter();
  const [toPersonId, setToPersonId] = useState("");
  const [password, setPassword] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const transfer = useCompanyMutation(company.id, (repo, id, vars: { toPersonId: string; password: string }) => repo.requestTransfer(id, vars.toPersonId, vars.password));
  const archive = useCompanyMutation(company.id, (repo, id) => repo.archive(id));
  const remove = useCompanyMutation(company.id, (repo, id, vars: { confirmName: string; password: string }) => repo.remove(id, vars.confirmName, vars.password));
  if (!capabilities.lifecycle) {
    return (
      <div className="p-1">
        <InlineAlert tone="info" title={t("ownerOnly")} description={t("ownerOnlyBody")} />
      </div>
    );
  }
  const eligible = settings.eligibleOwners;
  return (
    <div className="flex max-w-2xl flex-col gap-5 p-1">
      <section aria-labelledby="transfer-title" className="flex flex-col gap-3">
        <h3 id="transfer-title" className="text-sm font-bold text-fg">
          {t("transfer")}
        </h3>
        {settings.transfer ? (
          <InlineAlert tone="info" title={t("transferPending", { name: settings.transfer.toName })} />
        ) : eligible.length === 0 ? (
          <InlineAlert tone="warning" title={t("noEligible")} />
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!toPersonId) return;
              transfer.mutate({ toPersonId, password }, { onSuccess: () => toast({ title: t("transferSent") }) });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("to")}</FieldLabel>
                <Select value={toPersonId} onValueChange={setToPersonId} placeholder={t("choose")}>
                  {eligible.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
              {settings.transferReauth ? (
                <Field invalid={transfer.isError}>
                  <FieldLabel>{t("password")}</FieldLabel>
                  <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  {transfer.isError ? <FieldError>{t("reauthFailed")}</FieldError> : null}
                </Field>
              ) : null}
            </div>
            {transfer.isError && !settings.transferReauth ? <InlineAlert tone="danger" title={t("transferFailed")} /> : null}
            <p className="text-xs text-fg-secondary">{t("transferNote")}</p>
            <Button type="submit" variant="secondary" className="self-start" disabled={!writable || !toPersonId || transfer.isPending}>
              {t("transferSubmit")}
            </Button>
          </form>
        )}
      </section>
      <section aria-labelledby="archive-title" className="flex flex-col gap-2">
        <h3 id="archive-title" className="text-sm font-bold text-fg">
          {t("archive")}
        </h3>
        <p className="text-xs text-fg-secondary">{t("archiveNote")}</p>
        <Button variant="secondary" className="self-start" disabled={!writable} onClick={() => setArchiving(true)}>
          {t("archiveSubmit")}
        </Button>
      </section>
      <section aria-labelledby="delete-title" className={cn("flex flex-col gap-3 rounded-row px-4 py-3 inset-ring inset-ring-danger/40")}>
        <h3 id="delete-title" className="text-sm font-bold text-danger-text">
          {t("delete")}
        </h3>
        <p className="text-xs text-fg-secondary">{settings.retentionYears === null ? t("deleteNoteNoPolicy") : t("deleteNote", { years: settings.retentionYears })}</p>
        <Button variant="destructive" className="self-start" disabled={!writable} onClick={() => setDeleting(true)}>
          {t("deleteSubmit")}
        </Button>
      </section>
      {archiving ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => (open ? undefined : setArchiving(false))}
          title={t("archiveTitle", { company: company.name })}
          description={t("archiveNote")}
          confirmLabel={t("archiveSubmit")}
          onConfirm={async () => {
            await archive.mutateAsync();
            toast({ title: t("archived") });
            setArchiving(false);
          }}
        />
      ) : null}
      {deleting ? (
        <Dialog open onOpenChange={(open) => (open ? undefined : setDeleting(false))}>
          <DialogContent title={t("deleteTitle", { company: company.name })} description={settings.retentionYears === null ? t("deleteNoteNoPolicy") : t("deleteNote", { years: settings.retentionYears })}>
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                remove.mutate(
                  { confirmName, password: deletePassword },
                  {
                    onSuccess: () => {
                      toast({ title: t("deleted") });
                      router.push("/companies");
                    },
                  },
                );
              }}
            >
              <Field>
                <FieldLabel>{t("typeName", { company: company.name })}</FieldLabel>
                <Input dir="auto" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} />
              </Field>
              <Field invalid={remove.isError}>
                <FieldLabel>{t("password")}</FieldLabel>
                <Input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
                {remove.isError ? <FieldError>{t("deleteFailed")}</FieldError> : null}
              </Field>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setDeleting(false)}>
                  {t("cancel")}
                </Button>
                <Button type="submit" variant="destructive" disabled={confirmName.trim() !== company.name || remove.isPending}>
                  {t("deleteSubmit")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
