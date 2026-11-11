"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { RepositoryError } from "@/data/repositories";
import type { CheckinSchedule, TeamEstimateUnit, TeamPlanningMode, TeamRole, TeamSettings } from "@/data/team-domain";
import type { TeamSettingsPatch } from "@/data/team-repositories";
import {
  useCheckinActions,
  useCheckinSchedule,
  useRestoreTeam,
  useTeamMemberRows,
  useTeamSettingsActions,
  useTeamTransfer,
} from "@/data/team-queries";
import type { Weekday } from "@/lib/dates/week";
import { teamHref } from "@/features/navigation/contexts";
import { TINTS } from "@/features/projects/settings/settings-general";
import { ReauthDialog } from "@/features/projects/settings/settings-lifecycle";
import { DirtyBar, SettingRow, useReportDirty } from "@/features/projects/settings/settings-shared";
import { useProjectFormat } from "@/features/projects/format";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { useTeamLabels } from "../labels";
import { useWeekdayName, WEEK_ORDER } from "../people/member-dialogs";
import { useTeam } from "../team-gate";

/*
 * TM-14 tabs. General (Owner/Admin; dirty bar), Planning (Lead+: mode switch
 * rules, week start, estimate unit, check-in schedule, check-ins on/off,
 * manual status on/off), Access (Owner/Admin), Lifecycle (transfer with
 * successor accept + reauth, archive / restore, Join a company disabled
 * until Phase 4, delete with name + reauth; projects stay with their owners).
 */

/** Indigo first for teams (the same swatches as PJ-14). */
const TEAM_TINTS = [...TINTS].sort((a, b) => (a.tint === "indigo" ? -1 : b.tint === "indigo" ? 1 : 0));

function useSave(revision: number) {
  const t = useTranslations("TeamSettings");
  const tConflict = useTranslations("Access.states.conflict");
  const { team } = useTeam();
  const actions = useTeamSettingsActions(team.id);
  const onError = (error: unknown) =>
    toast({
      tone: "danger",
      title: error instanceof RepositoryError && error.code === "conflict" ? tConflict("title") : t("error"),
    });
  return {
    actions,
    onError,
    save: (patch: TeamSettingsPatch, onDone?: () => void) =>
      actions.update.mutate(
        { patch, revision },
        {
          onSuccess: () => {
            toast({ title: t("saved") });
            onDone?.();
          },
          onError,
        },
      ),
  };
}

// ── General ──────────────────────────────────────────────────────────────

type Draft = Pick<TeamSettings, "name" | "initials" | "description" | "tint">;

export function GeneralTab({ settings }: { settings: TeamSettings }) {
  const t = useTranslations("TeamSettings");
  const { capabilities } = useTeam();
  const { save, actions } = useSave(settings.revision);
  const base: Draft = { name: settings.name, initials: settings.initials, description: settings.description, tint: settings.tint };
  const [draft, setDraft] = useState<Draft>(base);
  const ids = { name: useId(), initials: useId(), description: useId() };
  const dirty = (Object.keys(base) as (keyof Draft)[]).some((key) => base[key] !== draft[key]);
  const canEdit = capabilities.editGeneral;
  useReportDirty(dirty && canEdit);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const invalid = !draft.name.trim() || !draft.initials.trim();

  return (
    <div className="flex flex-col gap-4">
      {!canEdit ? <InlineAlert tone="info" title={t("readOnly")} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field invalid={!draft.name.trim()}>
          <FieldLabel htmlFor={ids.name}>{t("general.name")}</FieldLabel>
          <Input id={ids.name} dir="auto" value={draft.name} disabled={!canEdit} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field invalid={!draft.initials.trim()}>
          <FieldLabel htmlFor={ids.initials}>{t("general.initials")}</FieldLabel>
          <Input
            id={ids.initials}
            dir="auto"
            maxLength={3}
            value={draft.initials}
            disabled={!canEdit}
            onChange={(event) => set("initials", event.target.value.toLocaleUpperCase())}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={ids.description}>{t("general.description")}</FieldLabel>
          <Textarea
            id={ids.description}
            dir="auto"
            rows={2}
            value={draft.description}
            disabled={!canEdit}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
        <div role="radiogroup" aria-label={t("general.colour")} className="flex gap-2">
          {TEAM_TINTS.map((option, index) => (
            <button
              key={option.tint}
              type="button"
              role="radio"
              aria-checked={draft.tint === option.tint}
              aria-label={t("general.colourOption", { n: index + 1 })}
              disabled={!canEdit}
              onClick={() => set("tint", option.tint)}
              className={cn(
                "size-9 rounded-[12px] focus-visible:focus-ring disabled:opacity-60",
                option.className,
                draft.tint === option.tint && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
              )}
            />
          ))}
        </div>
      </div>
      {dirty && canEdit ? (
        <DirtyBar
          onDiscard={() => setDraft(base)}
          onSave={() => save({ ...draft, name: draft.name.trim(), initials: draft.initials.trim() })}
          saving={actions.update.isPending}
          saveDisabled={invalid}
        />
      ) : null}
    </div>
  );
}

// ── Planning ─────────────────────────────────────────────────────────────

export function PlanningTab({ settings, phone }: { settings: TeamSettings; phone: boolean }) {
  const t = useTranslations("TeamSettings");
  const weekday = useWeekdayName();
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const { save, actions, onError } = useSave(settings.revision);
  const schedule = useCheckinSchedule(team.id);
  const [confirmSprints, setConfirmSprints] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const canEdit = capabilities.editPlanning;
  const time = (value: string) => convertDigits(value, format.digits);

  const setMode = (mode: TeamPlanningMode) => {
    if (mode === settings.planningMode) return;
    if (mode === "sprints") {
      setConfirmSprints(true);
      return;
    }
    actions.setPlanningMode.mutate("weekly", {
      onSuccess: () => toast({ title: t("planning.toWeekly") }),
      onError: (error) => (error instanceof RepositoryError && error.code === "conflict" ? setBlocked(true) : onError(error)),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {!canEdit ? <InlineAlert tone="info" title={t("readOnly")} /> : null}
      <SettingRow title={t("mode")} hint={t("planning.modeHint")}>
        <Segmented<TeamPlanningMode>
          label={t("mode")}
          variant="neutral"
          value={settings.planningMode}
          onValueChange={canEdit ? setMode : () => undefined}
          options={[
            { value: "weekly", label: t("planning.weekly") },
            { value: "sprints", label: t("planning.sprints") },
          ]}
        />
      </SettingRow>
      <SettingRow title={t("planning.weekStart")} hint={t("planning.weekStartHint")}>
        <Select
          aria-label={t("planning.weekStart")}
          value={settings.weekStart === null ? "user" : String(settings.weekStart)}
          disabled={!canEdit}
          className="h-9 w-48"
          onValueChange={(value) => save({ weekStart: value === "user" ? null : (Number(value) as Weekday) })}
        >
          <SelectItem value="user">{t("planning.followUser")}</SelectItem>
          {([6, 0, 1] as const).map((day) => (
            <SelectItem key={day} value={String(day)}>
              {weekday(day, "weekday")}
            </SelectItem>
          ))}
        </Select>
      </SettingRow>
      <SettingRow title={t("planning.estimate")} hint={t("planning.estimateHint")}>
        <Segmented<TeamEstimateUnit>
          label={t("planning.estimate")}
          variant="neutral"
          value={settings.estimateUnit}
          onValueChange={(value) => canEdit && save({ estimateUnit: value })}
          options={[
            { value: "hours", label: t("planning.hours") },
            { value: "points", label: t("planning.points") },
          ]}
        />
      </SettingRow>
      <SettingRow
        title={t("checkin")}
        hint={
          schedule.data
            ? t("planning.checkinHint", {
                openDay: weekday(schedule.data.opensDay, "weekday"),
                openTime: time(schedule.data.opensTime),
                closeDay: weekday(schedule.data.closesDay, "weekday"),
                closeTime: time(schedule.data.closesTime),
              })
            : undefined
        }
      >
        {/* Not on phones: check-in schedule editing (TMM01). */}
        {canEdit && !phone && schedule.data ? (
          <Button variant="secondary" className="bg-surface" onClick={() => setEditing(true)}>
            {t("planning.editSchedule")}
          </Button>
        ) : null}
      </SettingRow>
      <SettingRow title={t("planning.checkinsOn")} hint={t("planning.checkinsOnHint")}>
        <Switch
          aria-label={t("planning.checkinsOn")}
          checked={settings.checkinsOn}
          disabled={!canEdit}
          onCheckedChange={(on) => save({ checkinsOn: on })}
        />
      </SettingRow>
      <SettingRow title={t("planning.status")} hint={t("planning.statusHint")}>
        <Switch
          aria-label={t("planning.status")}
          checked={settings.statusOn}
          disabled={!canEdit}
          onCheckedChange={(on) => save({ statusOn: on })}
        />
      </SettingRow>

      {confirmSprints ? (
        <Dialog open onOpenChange={(open) => !open && setConfirmSprints(false)}>
          <DialogContent title={t("planning.toSprintsTitle")} description={t("planning.toSprintsBody")} size="sm" data-scope="team">
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmSprints(false)}>
                {t("planning.cancel")}
              </Button>
              <Button
                disabled={actions.setPlanningMode.isPending}
                onClick={() =>
                  actions.setPlanningMode.mutate("sprints", {
                    onSuccess: () => {
                      toast({ title: t("planning.switchedSprints") });
                      setConfirmSprints(false);
                    },
                    onError,
                  })
                }
              >
                {t("planning.toSprints")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {blocked ? (
        <Dialog open onOpenChange={(open) => !open && setBlocked(false)}>
          <DialogContent title={t("planning.toWeeklyTitle")} description={t("planning.toWeeklyBody")} size="sm" data-scope="team">
            <DialogFooter>
              <Button variant="secondary" onClick={() => setBlocked(false)}>
                {t("planning.cancel")}
              </Button>
              <Link href={`${teamHref(team.id, "planning")}?tab=sprint`} className={buttonVariants()}>
                {t("planning.openSprint")}
              </Link>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {editing && schedule.data ? <ScheduleDialog schedule={schedule.data} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function ScheduleDialog({ schedule, onClose }: { schedule: CheckinSchedule; onClose: () => void }) {
  const t = useTranslations("TeamSettings.planning.schedule");
  const weekday = useWeekdayName();
  const { team } = useTeam();
  const actions = useCheckinActions(team.id);
  const [draft, setDraft] = useState<CheckinSchedule>(schedule);
  const ids = { opens: useId(), closes: useId() };
  const row = (key: "opens" | "closes") => {
    const dayKey = key === "opens" ? "opensDay" : "closesDay";
    const timeKey = key === "opens" ? "opensTime" : "closesTime";
    return (
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-1.5 text-sm font-bold text-fg">{t(key)}</legend>
        <Field>
          <FieldLabel>{t("day")}</FieldLabel>
          <Select value={String(draft[dayKey])} onValueChange={(value) => setDraft((current) => ({ ...current, [dayKey]: Number(value) as Weekday }))}>
            {WEEK_ORDER.map((day) => (
              <SelectItem key={day} value={String(day)}>
                {weekday(day, "weekday")}
              </SelectItem>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={ids[key]}>{t("time")}</FieldLabel>
          <Input
            id={ids[key]}
            type="time"
            dir="ltr"
            value={draft[timeKey]}
            onChange={(event) => setDraft((current) => ({ ...current, [timeKey]: event.target.value }))}
          />
        </Field>
      </fieldset>
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t("title")} description={t("questions")} size="sm" data-scope="team">
        <div className="flex flex-col gap-4">
          {row("opens")}
          {row("closes")}
        </div>
        <DialogFooter>
          <Button
            disabled={actions.setSchedule.isPending}
            onClick={() =>
              actions.setSchedule.mutate(draft, {
                onSuccess: () => {
                  toast({ title: t("saved") });
                  onClose();
                },
              })
            }
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Access ───────────────────────────────────────────────────────────────

const INVITE_ROLES: readonly Exclude<TeamRole, "owner">[] = ["admin", "lead", "member", "viewer"];

export function AccessTab({ settings }: { settings: TeamSettings }) {
  const t = useTranslations("TeamSettings");
  const labels = useTeamLabels();
  const { capabilities } = useTeam();
  const { save } = useSave(settings.revision);
  const canEdit = capabilities.editGeneral;
  return (
    <div className="flex flex-col gap-2">
      {!canEdit ? <InlineAlert tone="info" title={t("readOnly")} /> : null}
      <SettingRow title={t("access.defaultRole")} hint={t("access.defaultRoleHint")}>
        <Select
          aria-label={t("access.defaultRole")}
          value={settings.defaultInviteRole}
          disabled={!canEdit}
          className="h-9 w-36"
          onValueChange={(value) => save({ defaultInviteRole: value as Exclude<TeamRole, "owner"> })}
        >
          {INVITE_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {labels.role(role)}
            </SelectItem>
          ))}
        </Select>
      </SettingRow>
      <SettingRow title={t("access.membersInvite")} hint={t("access.membersInviteHint")}>
        <Switch
          aria-label={t("access.membersInvite")}
          checked={settings.membersMayInvite}
          disabled={!canEdit}
          onCheckedChange={(on) => save({ membersMayInvite: on })}
        />
      </SettingRow>
      {/* OPEN(DECISIONS): whether Viewers may see this-week booking — design default off. */}
      <SettingRow title={t("access.viewersBooking")} hint={t("access.viewersBookingHint")}>
        <Switch
          aria-label={t("access.viewersBooking")}
          checked={settings.viewersSeeBooking}
          disabled={!canEdit}
          onCheckedChange={(on) => save({ viewersSeeBooking: on })}
        />
      </SettingRow>
    </div>
  );
}

// ── Lifecycle ────────────────────────────────────────────────────────────

export function LifecycleTab() {
  const t = useTranslations("TeamSettings");
  const router = useRouter();
  const { team, capabilities } = useTeam();
  const actions = useTeamSettingsActions(team.id);
  const restore = useRestoreTeam();
  const transfer = useTeamTransfer(team.id, capabilities.ownTeam);
  const rows = useTeamMemberRows(team.id);
  const tConflict = useTranslations("Access.states.conflict");
  const tTeams = useTranslations("Teams");
  const onError = (error: unknown) =>
    toast({ tone: "danger", title: error instanceof RepositoryError && error.code === "conflict" ? tConflict("title") : t("error") });
  const [successor, setSuccessor] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const archived = team.lifecycle === "archived";
  // OPEN(DECISIONS): exactly one Owner — the successor is one Admin or Lead.
  const candidates = (rows.data ?? []).filter((row) => row.person.id !== "me" && (row.role === "admin" || row.role === "lead"));

  return (
    <div className="flex flex-col gap-2">
      <SettingRow title={t("lifecycle.transfer")} hint={capabilities.ownTeam ? t("lifecycle.transferHint") : t("ownerOnly")}>
        {capabilities.ownTeam ? (
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
            <span className="flex w-full flex-wrap gap-2">
              <Select
                aria-label={t("lifecycle.chooseSuccessor")}
                value={successor}
                onValueChange={setSuccessor}
                placeholder={t("lifecycle.chooseSuccessor")}
                className="h-9 w-48 bg-surface"
              >
                {candidates.map((row) => (
                  <SelectItem key={row.person.id} value={row.person.id}>
                    {row.person.name}
                  </SelectItem>
                ))}
              </Select>
              <Button variant="secondary" className="bg-surface" disabled={!successor} onClick={() => actions.requestTransfer.mutate(successor, { onError })}>
                {t("lifecycle.request")}
              </Button>
            </span>
          )
        ) : null}
      </SettingRow>
      {archived && capabilities.restore ? (
        <SettingRow title={t("lifecycle.archive")} hint={t("lifecycle.archiveHint")}>
          <Button variant="secondary" className="bg-surface" onClick={() => restore.mutate(team.id, { onError })}>
            {tTeams("archived.restore")}
          </Button>
        </SettingRow>
      ) : (
        <SettingRow title={t("lifecycle.archive")} hint={capabilities.archive ? t("lifecycle.archiveHint") : t("readOnly")}>
          {capabilities.archive ? (
            <Button
              variant="secondary"
              className="bg-surface"
              onClick={() => actions.archive.mutate(undefined, { onSuccess: () => toast({ title: t("lifecycle.archived") }), onError })}
            >
              {t("lifecycle.archiveAction")}
            </Button>
          ) : null}
        </SettingRow>
      )}
      {/* Phase 4: company association is shown, never offered. */}
      <div aria-disabled="true" className="opacity-60">
        <SettingRow title={t("joinCompany")} hint={t("lifecycle.joinCompanyHint")}>
          <span className="inline-flex min-h-7 items-center rounded-pill px-3 text-xs font-semibold text-fg-secondary inset-ring inset-ring-outline">
            {t("lifecycle.notYet")}
          </span>
        </SettingRow>
      </div>
      {capabilities.ownTeam ? (
        <SettingRow danger title={t("delete")} hint={t("lifecycle.deleteHint")}>
          <Button variant="destructive" onClick={() => setDeleting(true)}>
            {t("lifecycle.deleteAction")}
          </Button>
        </SettingRow>
      ) : null}
      {confirming ? (
        <ReauthDialog
          scope="team"
          title={t("lifecycle.confirm")}
          action={t("lifecycle.confirm")}
          onClose={() => setConfirming(false)}
          onSubmit={(password) => actions.confirmTransfer.mutateAsync(password).then(() => toast({ title: t("lifecycle.transferred") }))}
        />
      ) : null}
      {deleting ? (
        <ReauthDialog
          scope="team"
          title={t("lifecycle.deleteTitle", { name: team.name })}
          action={t("delete")}
          destructive
          confirmName={team.name}
          nameLabel={t("lifecycle.typeName")}
          onClose={() => setDeleting(false)}
          onSubmit={(password, name) =>
            // OPEN(DECISIONS): delete-team retention period — backend policy pending.
            actions.remove.mutateAsync({ name: name ?? "", password }).then(() => {
              toast({ title: t("lifecycle.deleted") });
              router.push("/teams");
            })
          }
        />
      ) : null}
    </div>
  );
}
