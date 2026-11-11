"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useMemberList, useOwnershipTransfer, useSettingsActions } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { useProject } from "../project-gate";
import { SettingRow, useSettingsError } from "./settings-shared";

/*
 * PJ-14 › Lifecycle: Save as template, Archive / Restore (Admin+), Transfer
 * ownership (D17: successor Admin/Manager accepts, then the owner confirms
 * with the password; pending state with Cancel request), Delete (Owner:
 * type the project name + password). Others then see the SH-02 states.
 */

export function LifecycleTab() {
  const t = useTranslations("ProjectSettings");
  const router = useRouter();
  const { project, capabilities } = useProject();
  const actions = useSettingsActions(project.id);
  const transfer = useOwnershipTransfer(project.id);
  const members = useMemberList(project.id);
  const onError = useSettingsError();
  const [successor, setSuccessor] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const archived = project.lifecycle === "archived";
  const candidates = (members.data ?? []).filter((member) => member.role === "admin" || member.role === "manager");

  return (
    <div className="flex flex-col gap-2">
      {capabilities.archiveProject ? (
        <SettingRow title={t("lifecycle.template")} hint={t("lifecycle.templateHint")}>
          <Button
            variant="secondary"
            className="bg-surface"
            onClick={() => actions.saveTemplate.mutate(undefined, { onSuccess: () => toast({ title: t("lifecycle.templateSaved") }), onError })}
          >
            {t("lifecycle.templateAction")}
          </Button>
        </SettingRow>
      ) : null}
      {archived && capabilities.restore ? (
        <SettingRow title={t("lifecycle.restore")}>
          <Button variant="secondary" className="bg-surface" onClick={() => actions.restore.mutate(undefined, { onError })}>
            {t("lifecycle.restoreAction")}
          </Button>
        </SettingRow>
      ) : capabilities.archiveProject ? (
        <SettingRow title={t("lifecycle.archive")} hint={t("lifecycle.archiveHint")}>
          <Button
            variant="secondary"
            className="bg-surface"
            onClick={() => actions.archive.mutate(undefined, { onSuccess: () => toast({ title: t("lifecycle.archived") }), onError })}
          >
            {t("lifecycle.archiveAction")}
          </Button>
        </SettingRow>
      ) : null}
      <SettingRow title={t("lifecycle.transfer")} hint={capabilities.ownProject ? t("lifecycle.transferHint") : t("ownerOnly")}>
        {capabilities.ownProject && !archived ? (
          transfer.data ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Avatar name={transfer.data.successor.name} initials={transfer.data.successor.initials} size={32} decorative className="size-6 text-[0.5625rem]" />
                <bdi>
                  {transfer.data.accepted
                    ? t("lifecycle.accepted", { name: transfer.data.successor.name })
                    : t("lifecycle.waiting", { name: transfer.data.successor.name })}
                </bdi>
              </span>
              <span className="flex gap-2">
                {transfer.data.accepted ? <Button onClick={() => setConfirming(true)}>{t("lifecycle.confirm")}</Button> : null}
                <Button variant="secondary" className="bg-surface" onClick={() => actions.cancelTransfer.mutate(undefined, { onError })}>
                  {t("lifecycle.cancelRequest")}
                </Button>
              </span>
            </div>
          ) : candidates.length === 0 ? (
            <span className="text-xs font-medium text-fg-secondary">{t("lifecycle.noSuccessor")}</span>
          ) : (
            <span className="flex flex-wrap gap-2">
              <Select aria-label={t("lifecycle.successor")} value={successor} onValueChange={setSuccessor} placeholder={t("lifecycle.successor")} className="h-9 w-44">
                {candidates.map((member) => (
                  <SelectItem key={member.person.id} value={member.person.id}>
                    {member.person.name}
                  </SelectItem>
                ))}
              </Select>
              <Button
                variant="secondary"
                className="bg-surface"
                disabled={!successor}
                onClick={() => actions.requestTransfer.mutate(successor, { onError })}
              >
                {t("lifecycle.request")}
              </Button>
            </span>
          )
        ) : null}
      </SettingRow>
      {capabilities.ownProject ? (
        <SettingRow danger title={t("lifecycle.delete")} hint={t("lifecycle.deleteHint")}>
          <Button variant="destructive" onClick={() => setDeleting(true)}>
            {t("lifecycle.deleteAction")}
          </Button>
        </SettingRow>
      ) : null}
      {confirming ? (
        <ReauthDialog
          title={t("lifecycle.confirm")}
          action={t("lifecycle.confirm")}
          onClose={() => setConfirming(false)}
          onSubmit={(password) =>
            actions.confirmTransfer.mutateAsync(password).then(() => toast({ title: t("lifecycle.transferred") }))
          }
        />
      ) : null}
      {deleting ? (
        <ReauthDialog
          title={t("lifecycle.deleteTitle", { name: project.name })}
          action={t("lifecycle.delete")}
          destructive
          confirmName={project.name}
          onClose={() => setDeleting(false)}
          onSubmit={(password, name) => {
            // The project leaves every list: navigate even though this view unmounts.
            return actions.remove.mutateAsync({ name: name ?? "", password }).then(() => {
              toast({ title: t("lifecycle.deleted") });
              router.push("/projects");
            });
          }}
        />
      ) : null}
    </div>
  );
}

/** Reauth (+ optional type-the-name) dialog; shared with TM-14 Team settings. */
export function ReauthDialog({
  title,
  action,
  destructive,
  confirmName,
  scope = "project",
  nameLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  scope?: "project" | "team";
  /** Label of the type-the-name field (default: the project wording). */
  nameLabel?: string;
  action: string;
  destructive?: boolean;
  confirmName?: string;
  onClose: () => void;
  onSubmit: (password: string, name?: string) => Promise<unknown>;
}) {
  const t = useTranslations("ProjectSettings.lifecycle");
  const onError = useSettingsError();
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [failed, setFailed] = useState<"reauth" | "name" | null>(null);
  const ids = { name: useId(), password: useId() };
  const nameOk = confirmName === undefined || name.trim() === confirmName;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} size="sm" data-scope={scope}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setFailed(null);
            onSubmit(password, confirmName === undefined ? undefined : name).then(onClose, (error: unknown) => {
              if (error instanceof RepositoryError && error.message === "reauth") setFailed("reauth");
              else if (error instanceof RepositoryError && error.message === "name-mismatch") setFailed("name");
              else onError(error);
            });
          }}
        >
          {confirmName !== undefined ? (
            <Field invalid={failed === "name"}>
              <FieldLabel htmlFor={ids.name}>{nameLabel ?? t("typeName")}</FieldLabel>
              <Input id={ids.name} dir="auto" value={name} onChange={(event) => setName(event.target.value)} />
              {failed === "name" ? <FieldError>{t("nameMismatch")}</FieldError> : null}
            </Field>
          ) : null}
          <Field invalid={failed === "reauth"}>
            <FieldLabel htmlFor={ids.password}>{t("password")}</FieldLabel>
            <Input id={ids.password} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {failed === "reauth" ? <FieldError>{t("reauthFailed")}</FieldError> : null}
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "primary"} disabled={!password || !nameOk}>
              {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
