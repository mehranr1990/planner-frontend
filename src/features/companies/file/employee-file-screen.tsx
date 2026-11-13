"use client";

import { Download, Eye, FileText, LockKeyhole, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useIsDesktop } from "@/components/ui/use-is-desktop";
import type { CorrectiveAction, EmployeeFileAccess, FileAccessLogRow } from "@/data/company-domain";
import { useCompanyMutation, useEmployeeFile, useStaff } from "@/data/company-queries";
import { StatusChip } from "@/design-system/feedback/status-chip";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { companyHref } from "@/features/navigation/contexts";
import { useCompany, useCompanyWritable } from "../company-gate";
import { CompanyPageHeader } from "../company-page-header";
import { useCompanyFormat } from "../format";
import { ReasonDialog } from "../resources/resources-screen";

/*
 * CO-12 · Employee file (sealed) (/companies/[id]/people/[personId]/file).
 * Separate from the work profile. Without an explicit, time-limited grant
 * the file is sealed — Owner and Org Admin get NO access by role — and only
 * Request access is offered (logged; the employee is told who asked). With a
 * grant: grant banner, documents with per-document grants, the access log
 * (the employee sees it too), corrective actions (reason + evidence
 * required, employee response, appeal, close with an outcome; confidential;
 * no monetary punishment). Every open is audited. Notch: Add document (HR
 * grant), otherwise Download file pack (logged). Read-only on phones.
 */

export function EmployeeFileScreen() {
  const t = useTranslations("Company.file");
  const { company } = useCompany();
  const pathname = usePathname();
  const personId = /\/people\/([^/]+)\/file/.exec(pathname)?.[1] ?? "";
  const file = useEmployeeFile(company.id, personId);
  const staff = useStaff(company.id, company.role);
  const person = staff.data?.find((item) => item.id === personId);
  const [logOpen, setLogOpen] = useState(false);
  const format = useCompanyFormat(company.currency);
  const data = file.data;

  const header = (
    <CompanyPageHeader
      module="people"
      trail={person ? [{ label: person.name, href: companyHref(company.id, "people") }] : []}
      resource={t("title")}
      title={t("title")}
      titleExtra={
        data ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-secondary">
            <Icon icon={LockKeyhole} size={13} />
            {data.status === "sealed"
              ? t("sealedLine")
              : data.own
                ? t("ownLine")
                : data.grant.until
                  ? t("grantedUntil", { date: format.day(data.grant.until) })
                  : t("granted")}
          </span>
        ) : null
      }
      actions={
        data?.status === "open" ? (
          <Button variant="secondary" className="gap-2" onClick={() => setLogOpen(true)}>
            <Icon icon={Eye} size={16} />
            {t("accessLog")}
          </Button>
        ) : null
      }
    />
  );

  if (file.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void file.refetch()} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }
  if (data.status === "sealed") {
    return (
      <>
        {header}
        <Sealed access={data} />
      </>
    );
  }
  return (
    <>
      {header}
      <div className="grid gap-4 xl:grid-cols-2">
        <FileCard access={data} position={person?.position ?? ""} startedOn={person?.startedOn ?? null} />
        <Corrective access={data} />
      </div>
      {logOpen ? <AccessLogDialog log={data.log} onClose={() => setLogOpen(false)} /> : null}
    </>
  );
}

function Sealed({ access }: { access: Extract<EmployeeFileAccess, { status: "sealed" }> }) {
  const t = useTranslations("Company.file");
  const { company, capabilities } = useCompany();
  const writable = useCompanyWritable();
  const request = useCompanyMutation(company.id, (repo, id) => repo.requestFileAccess(id, access.person.id));
  return (
    <ProductCard as="section" aria-label={t("withoutGrant")} className="mx-auto w-full max-w-xl gap-3">
      <AccessState
        kind="company-sealed"
        titleAs="h2"
        primaryAction={
          capabilities.requestFileAccess && writable ? (
            access.requested ? (
              <span className="text-sm font-bold text-scope-deep">{t("requested")}</span>
            ) : (
              <Button
                disabled={request.isPending}
                onClick={() => request.mutate(undefined, { onSuccess: () => toast({ title: t("requestSent"), description: t("requestSentBody", { name: access.person.name }) }) })}
              >
                {t("request")}
              </Button>
            )
          ) : undefined
        }
      />
      <p className="text-xs text-fg-secondary">{t("noRoleAccess")}</p>
    </ProductCard>
  );
}

function FileCard({ access, position, startedOn }: { access: Extract<EmployeeFileAccess, { status: "open" }>; position: string; startedOn: string | null }) {
  const t = useTranslations("Company.file");
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const desktop = useIsDesktop();
  const format = useCompanyFormat(company.currency);
  const [adding, setAdding] = useState(false);
  const download = useCompanyMutation(company.id, (repo, id) => repo.downloadPack(id, access.person.id));
  const action =
    access.canAddDocument && writable && desktop ? (
      <SignatureCardAction icon={Plus} label={t("addDocument")} onClick={() => setAdding(true)} />
    ) : (
      <SignatureCardAction
        icon={Download}
        variant="neutral"
        label={t("downloadPack")}
        disabled={download.isPending}
        onClick={() => download.mutate(undefined, { onSuccess: (result) => toast({ title: t("downloaded"), description: result.name }) })}
      />
    );
  const grantLabel =
    access.grant.kind === "self"
      ? t("grantSelf")
      : `${t(`grant.${access.grant.kind}`)}${access.grant.until ? ` · ${t("until", { date: format.day(access.grant.until) })}` : ""}`;
  return (
    <SignatureCard as="section" aria-labelledby="file-person" action={action} contentClassName="gap-3" className="self-start">
      <div className="flex items-center gap-3 pe-14">
        <Avatar name={access.person.name} initials={access.person.initials} size={48} tone="company" decorative />
        <div className="flex min-w-0 flex-col">
          <h2 id="file-person" className="type-title text-fg">
            <bdi>{access.person.name}</bdi>
          </h2>
          <p className="text-xs font-semibold text-fg-secondary">
            <bdi>{position}</bdi>
            {startedOn ? ` · ${t("since", { date: format.day(startedOn, "full") })}` : null}
          </p>
        </div>
      </div>
      <dl className="flex flex-col gap-1.5">
        {[
          [t("retention"), t("retentionValue")],
          [t("yourGrant"), grantLabel],
          [t("lastOpened"), t("lastOpenedValue")],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 rounded-row px-3 py-2 inset-ring inset-ring-line">
            <dt className="text-xs text-fg-secondary">{label}</dt>
            <dd className="text-xs font-bold text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="pt-1 text-xs font-bold tracking-wide text-fg-secondary uppercase">{t("documents")}</h3>
      {access.documents.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("noDocuments")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {access.documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2.5">
              <Icon icon={FileText} size={15} className="shrink-0 text-fg-secondary" />
              <div className="flex min-w-0 flex-1 flex-col">
                <bdi className="truncate text-sm font-bold text-fg">{doc.name}</bdi>
                <span className="text-xs text-fg-secondary">{format.day(doc.addedAt)}</span>
              </div>
              <span className="shrink-0 rounded-pill bg-surface px-2.5 py-1 text-xs font-bold text-fg inset-ring inset-ring-outline">
                {doc.grantedTo.length ? t("hrPlus", { who: doc.grantedTo.join(", ") }) : t("hrOnly")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding ? <AddDocumentDialog personId={access.person.id} onClose={() => setAdding(false)} /> : null}
    </SignatureCard>
  );
}

function Corrective({ access }: { access: Extract<EmployeeFileAccess, { status: "open" }> }) {
  const t = useTranslations("Company.file.corrective");
  const { company } = useCompany();
  const writable = useCompanyWritable();
  const desktop = useIsDesktop();
  const format = useCompanyFormat(company.currency);
  const [opening, setOpening] = useState(false);
  const canWrite = writable && desktop;
  return (
    <ProductCard as="section" aria-labelledby="corrective-title" className="gap-3 self-start">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="corrective-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <span className="text-xs font-semibold text-fg-secondary">{t("confidential", { n: format.number(access.corrective.length) })}</span>
      </div>
      {access.corrective.length === 0 ? <p className="text-sm text-fg-muted">{t("none")}</p> : null}
      <ul className="flex flex-col gap-2">
        {access.corrective.map((action) => (
          <CorrectiveItem key={action.id} access={access} action={action} canWrite={canWrite} />
        ))}
      </ul>
      {access.canOpenCorrective && canWrite ? (
        <Button variant="secondary" className="gap-2 self-start" onClick={() => setOpening(true)}>
          <Icon icon={Plus} size={16} />
          {t("open")}
        </Button>
      ) : null}
      {!desktop ? <p className="text-xs text-fg-secondary">{t("readOnlyPhone")}</p> : null}
      <p className="text-xs text-fg-muted">{t("noPenalties")}</p>
      {opening ? <OpenCorrectiveDialog personId={access.person.id} onClose={() => setOpening(false)} /> : null}
    </ProductCard>
  );
}

function CorrectiveItem({ access, action, canWrite }: { access: Extract<EmployeeFileAccess, { status: "open" }>; action: CorrectiveAction; canWrite: boolean }) {
  const t = useTranslations("Company.file.corrective");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  const [dialog, setDialog] = useState<"respond" | "appeal" | "close" | null>(null);
  const run = useCompanyMutation(company.id, (repo, id, vars: { kind: "respond" | "appeal" | "close"; text: string }) =>
    vars.kind === "respond"
      ? repo.respondCorrective(id, access.person.id, action.id, vars.text)
      : vars.kind === "appeal"
        ? repo.appealCorrective(id, access.person.id, action.id, vars.text)
        : repo.closeCorrective(id, access.person.id, action.id, vars.text),
  );
  const tone = action.status === "closed" ? "neutral" : action.status === "responded" ? "warning" : action.status === "appealed" ? "info" : "danger";
  return (
    <li className="flex flex-col gap-2 rounded-row bg-subtle px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <bdi className="text-sm font-bold text-fg">{action.reason}</bdi>
        <StatusChip tone={tone}>{t(`status.${action.status}`)}</StatusChip>
      </div>
      <p className="text-xs text-fg-secondary">
        {t("meta", { date: format.day(action.openedAt.slice(0, 10)), by: action.openedBy, evidence: action.evidence, visible: action.visibleTo })}
      </p>
      {action.response ? (
        <p className="rounded-row bg-surface px-3 py-2 text-sm text-fg">
          “<bdi>{action.response}</bdi>” — <bdi>{access.person.name}</bdi>
        </p>
      ) : null}
      {action.appeal ? (
        <p className="rounded-row bg-surface px-3 py-2 text-sm text-fg">
          {t("appealed")}: “<bdi>{action.appeal}</bdi>”
        </p>
      ) : null}
      {action.outcome ? <p className="text-xs font-semibold text-fg">{t("outcome", { outcome: action.outcome })}</p> : null}
      {canWrite && action.status !== "closed" ? (
        <div className="flex flex-wrap gap-2">
          {access.own && action.status === "open" ? (
            <Button size="sm" variant="secondary" className="bg-surface" onClick={() => setDialog("respond")}>
              {t("respond")}
            </Button>
          ) : null}
          {access.own && (action.status === "open" || action.status === "responded") ? (
            <Button size="sm" variant="secondary" className="bg-surface" onClick={() => setDialog("appeal")}>
              {t("appeal")}
            </Button>
          ) : null}
          {!access.own && access.grant.kind === "hr" ? (
            <Button size="sm" variant="secondary" className="bg-surface" onClick={() => setDialog("close")}>
              {t("close")}
            </Button>
          ) : null}
          {!access.own ? <span className="self-center text-xs font-semibold text-fg-secondary">{t("appealStatus", { status: action.appeal ? t("appealYes") : t("appealNone") })}</span> : null}
        </div>
      ) : null}
      {dialog ? (
        <ReasonDialog
          title={t(`${dialog}Title`)}
          label={t(`${dialog}Label`)}
          submit={t(dialog)}
          pending={run.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(text) =>
            run.mutate(
              { kind: dialog, text },
              {
                onSuccess: () => {
                  toast({ title: t(`${dialog}Done`) });
                  setDialog(null);
                },
              },
            )
          }
        />
      ) : null}
    </li>
  );
}

function AccessLogDialog({ log, onClose }: { log: FileAccessLogRow[]; onClose: () => void }) {
  const t = useTranslations("Company.file.log");
  const { company } = useCompany();
  const format = useCompanyFormat(company.currency);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description")} size="lg">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="text-xs font-semibold text-fg-muted">
            <tr>
              <th scope="col" className="pb-2 text-start font-semibold">
                {t("when")}
              </th>
              <th scope="col" className="pb-2 text-start font-semibold">
                {t("who")}
              </th>
              <th scope="col" className="pb-2 text-start font-semibold">
                {t("what")}
              </th>
            </tr>
          </thead>
          <tbody>
            {log.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="py-2 pe-3 text-xs text-fg-secondary">{format.day(row.at.slice(0, 10))}</td>
                <td className="py-2 pe-3 text-fg">
                  <bdi>{row.who}</bdi>
                </td>
                <td className="py-2 text-fg">
                  <bdi>{row.what}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}

function AddDocumentDialog({ personId, onClose }: { personId: string; onClose: () => void }) {
  const t = useTranslations("Company.file.add");
  const { company } = useCompany();
  const fileId = useId();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const add = useCompanyMutation(company.id, (repo, id, fileName: string) => repo.addDocument(id, personId, fileName));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!name) return;
            add.mutate(name, {
              onSuccess: () => {
                toast({ title: t("added") });
                onClose();
              },
            });
          }}
        >
          <Field invalid={touched && !name}>
            <FieldLabel htmlFor={fileId}>{t("file")}</FieldLabel>
            <input
              id={fileId}
              type="file"
              className="text-sm text-fg file:me-3 file:rounded-pill file:border-0 file:bg-subtle file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              onChange={(event) => setName(event.target.files?.[0]?.name ?? "")}
            />
            {touched && !name ? <FieldError>{t("required")}</FieldError> : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenCorrectiveDialog({ personId, onClose }: { personId: string; onClose: () => void }) {
  const t = useTranslations("Company.file.open");
  const { company } = useCompany();
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [touched, setTouched] = useState(false);
  const open = useCompanyMutation(company.id, (repo, id, vars: { reason: string; evidence: string }) => repo.openCorrective(id, personId, vars));
  return (
    <Dialog open onOpenChange={(value) => (value ? undefined : onClose())}>
      <DialogContent title={t("title")} description={t("description")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!reason.trim() || !evidence.trim()) return;
            open.mutate(
              { reason, evidence },
              {
                onSuccess: () => {
                  toast({ title: t("opened") });
                  onClose();
                },
              },
            );
          }}
        >
          <Field invalid={touched && !reason.trim()}>
            <FieldLabel>{t("reason")}</FieldLabel>
            <Textarea dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />
            {touched && !reason.trim() ? <FieldError>{t("reasonRequired")}</FieldError> : null}
          </Field>
          <Field invalid={touched && !evidence.trim()}>
            <FieldLabel>{t("evidence")}</FieldLabel>
            <Input dir="auto" value={evidence} placeholder="training-log.csv" onChange={(event) => setEvidence(event.target.value)} />
            {touched && !evidence.trim() ? <FieldError>{t("evidenceRequired")}</FieldError> : null}
          </Field>
          <p className="rounded-row bg-subtle px-3 py-2 text-xs text-fg">{t("visibleTo")}</p>
          <p className="text-xs text-fg-secondary">{t("note")}</p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={open.isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
