"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { getApiClient } from "@/api/runtime";
import { newIdempotencyKey } from "@/api/client";
import { saveBlob } from "@/data/personal-services-queries";
import {
  confirmDeletion,
  downloadExport,
  erasurePolicyVersion,
  exportStatus,
  requestDeletion,
  revisionFromEtag,
  startExport,
  type DeletionStart,
  type ExportJob,
} from "@/features/auth/account-lifecycle-api";
import { getSettings } from "@/features/auth/auth-api";
import { leaveToSignIn } from "@/features/auth/session";
import { UtilityField } from "@/design-system/surfaces/utility-card";
import { useServiceError } from "./service-error";
import { useServiceFormat } from "./use-service-format";

/*
 * Settings · Data & account (live accounts): the complete private export
 * (password → job → poll → download with a fresh proof) and the staged
 * account deletion (consequences + password + retention acknowledgement →
 * request → save the recovery code → separate final confirmation → every
 * session ends). Finance's own CSV / JSON export lives in Finance · Reports.
 * Proofs and the recovery code stay in this component's memory only.
 */

const POLL_MS = 7_000;
const ACTIVE: ExportJob["state"][] = ["QUEUED", "RUNNING"];

export function AccountExportRow() {
  const t = useTranslations("Services.account");
  const format = useServiceFormat();
  const message = useServiceError();
  const passwordId = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!job || !ACTIVE.includes(job.state)) return;
    const timer = window.setTimeout(() => {
      exportStatus(getApiClient(), job.id).then(setJob, (error) => toast({ tone: "danger", title: message(error) }));
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [job, message]);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    try {
      setJob(await startExport(getApiClient(), password, key.current));
      setPassword("");
    } catch (error) {
      toast({ tone: "danger", title: message(error) });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!job) return;
    setBusy(true);
    try {
      // A fresh status carries a fresh proof (proofs last ≤ 10 minutes).
      const fresh = await exportStatus(getApiClient(), job.id);
      setJob(fresh);
      if (fresh.state !== "READY" || !fresh.downloadProof) {
        toast({ tone: "warning", title: t("export.notReady") });
        return;
      }
      saveBlob(await downloadExport(getApiClient(), fresh.id, fresh.downloadProof), `mehran-planner-account-${fresh.createdAt.slice(0, 10)}.json`);
    } catch (error) {
      toast({ tone: "danger", title: message(error) });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setJob(null);
    key.current = newIdempotencyKey();
  };

  return (
    <UtilityField className="flex-wrap justify-between gap-x-4 gap-y-2 py-2">
      <div className="flex min-w-0 flex-col">
        <span>{t("export.title")}</span>
        <span className="text-xs font-normal text-fg-muted">{t("export.hint")}</span>
      </div>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {job && job.state === "READY" ? t("export.ready") : job && ACTIVE.includes(job.state) ? t("export.preparing") : t("export.open")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("export.title")} description={t("export.description")} size="md">
          {!job ? (
            <form onSubmit={(event) => void start(event)} className="flex flex-col gap-3">
              <label htmlFor={passwordId} className="text-sm font-bold text-fg">
                {t("password")}
              </label>
              <Input id={passwordId} type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} />
              <p className="text-xs text-fg-muted">{t("export.sensitive")}</p>
              <DialogFooter>
                <Button type="submit" loading={busy} disabled={!password}>
                  {t("export.start")}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex flex-col gap-3" aria-live="polite">
              <p className="text-sm text-fg">{t(`export.state.${job.state}`)}</p>
              {job.state === "READY" ? (
                <p className="text-xs text-fg-muted">
                  {job.size !== null ? t("export.size", { size: format.number(Math.max(1, Math.round(job.size / 1024))) }) : null}
                  {job.expiresAt ? ` · ${t("export.expires", { at: format.instant(job.expiresAt) })}` : null}
                </p>
              ) : null}
              {job.state === "FAILED" && job.failureCode ? (
                <p className="text-xs text-danger-text">
                  <bdi dir="ltr">{job.failureCode}</bdi>
                </p>
              ) : null}
              <DialogFooter>
                {ACTIVE.includes(job.state) ? null : (
                  <Button variant="secondary" onClick={reset}>
                    {t("export.again")}
                  </Button>
                )}
                {job.state === "READY" ? (
                  <Button loading={busy} onClick={() => void download()}>
                    <Download aria-hidden="true" size={16} />
                    {t("export.download")}
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </UtilityField>
  );
}

type Step = { kind: "request" } | { kind: "confirm"; start: DeletionStart };

export function AccountDeletionRow() {
  const t = useTranslations("Services.account");
  const policy = erasurePolicyVersion();
  const [open, setOpen] = useState(false);
  return (
    <UtilityField className="flex-wrap justify-between gap-x-4 gap-y-2 py-2">
      <div className="flex min-w-0 flex-col">
        <span>{t("delete.title")}</span>
        <span className="text-xs font-normal text-fg-muted">{policy ? t("delete.hint") : t("delete.unavailable")}</span>
      </div>
      <Button size="sm" variant="outline" className="text-danger-text" disabled={!policy} onClick={() => setOpen(true)}>
        {t("delete.open")}
      </Button>
      {policy ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title={t("delete.title")} description={t("delete.description")} size="md">
            {open ? <DeletionFlow policy={policy} onCancel={() => setOpen(false)} /> : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </UtilityField>
  );
}

function DeletionFlow({ policy, onCancel }: { policy: string; onCancel(): void }) {
  const t = useTranslations("Services.account");
  const format = useServiceFormat();
  const message = useServiceError();
  const queryClient = useQueryClient();
  const ids = { password: useId(), typed: useId() };
  const [step, setStep] = useState<Step>({ kind: "request" });
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [typed, setTyped] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());

  const request = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const client = getApiClient();
      const accountRevision = revisionFromEtag((await getSettings(client)).etag);
      if (accountRevision === null) throw new Error("No account revision");
      const start = await requestDeletion(client, { password, accountRevision, policyVersion: policy }, key.current);
      setPassword("");
      setStep({ kind: "confirm", start });
    } catch (error) {
      toast({ tone: "danger", title: message(error) });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (step.kind !== "confirm") return;
    setBusy(true);
    try {
      await confirmDeletion(getApiClient(), step.start.job, step.start.confirmationProof);
      // Every session is revoked: clear private caches and leave to sign-in.
      leaveToSignIn(queryClient, "signed-out");
    } catch (error) {
      toast({ tone: "danger", title: message(error) });
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ tone: "neutral", title: t("delete.copied") }),
      () => toast({ tone: "warning", title: t("delete.copyFailed") }),
    );
  };

  if (step.kind === "request") {
    return (
      <form onSubmit={(event) => void request(event)} className="flex flex-col gap-3">
        <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-fg-secondary">
          <li>{t("delete.consequence1")}</li>
          <li>{t("delete.consequence2")}</li>
          <li>{t("delete.consequence3")}</li>
          <li>{t("delete.consequence4")}</li>
        </ul>
        <label htmlFor={ids.password} className="text-sm font-bold text-fg">
          {t("password")}
        </label>
        <Input id={ids.password} type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} />
        <Checkbox label={t("delete.acknowledge")} checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} />
        <label htmlFor={ids.typed} className="text-sm font-bold text-fg">
          {t("delete.typeLabel")}
        </label>
        <Input id={ids.typed} dir="ltr" autoComplete="off" spellCheck={false} value={typed} onChange={(event) => setTyped(event.target.value)} />
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="destructive" loading={busy} disabled={!password || !acknowledged || typed.trim() !== "DELETE"}>
            {t("delete.request")}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  const { start } = step;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg">{t("delete.pending", { at: format.instant(start.confirmationExpiresAt) })}</p>
      <div className="flex flex-col gap-2 rounded-tile bg-subtle p-3">
        <span className="text-xs font-bold text-fg">{t("delete.recoveryTitle")}</span>
        <p className="text-xs text-fg-secondary">{t("delete.recoveryHint")}</p>
        {[
          { label: t("delete.jobId"), value: start.job.id },
          { label: t("delete.recoveryCode"), value: start.recoveryCapability },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs text-fg-muted">{item.label}</span>
            <code dir="ltr" className="min-w-0 flex-1 break-all rounded-row bg-surface px-2 py-1 text-xs">
              {item.value}
            </code>
            <Button size="sm" variant="ghost" onClick={() => copy(item.value)} aria-label={t("delete.copy", { what: item.label })}>
              <Copy aria-hidden="true" size={14} />
            </Button>
          </div>
        ))}
      </div>
      <Checkbox label={t("delete.savedCode")} checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
      <p className="text-xs text-fg-muted">{t("delete.leaveNote")}</p>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {t("delete.notNow")}
        </Button>
        <Button variant="destructive" loading={busy} disabled={!saved} onClick={() => void confirm()}>
          {t("delete.confirm")}
        </Button>
      </DialogFooter>
    </div>
  );
}
