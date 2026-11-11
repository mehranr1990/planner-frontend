"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { TeamMemberRow } from "@/data/team-domain";
import {
  useMemberRemovalPreview,
  useTeamDirectory,
  useTeamMemberActions,
  useTeamPersonCapacity,
} from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import type { Weekday } from "@/lib/dates/week";
import { useTeam } from "../team-gate";

/*
 * TM-08 member dialogs: capacity editor (days + weekly hours for this team;
 * used by Planning, Workload and Sprints, not linked to Personal settings),
 * Move to another team and Remove previews (this team's open tasks become
 * Unassigned; project roles never change).
 */

/** Weekday names from a known Saturday (2026-10-10 … Fri 16), in Iran week order. */
const WEEKDAY_DAY: Readonly<Record<Weekday, string>> = {
  6: "2026-10-10",
  0: "2026-10-11",
  1: "2026-10-12",
  2: "2026-10-13",
  3: "2026-10-14",
  4: "2026-10-15",
  5: "2026-10-16",
};
export const WEEK_ORDER: readonly Weekday[] = [6, 0, 1, 2, 3, 4, 5];

export function useWeekdayName() {
  const format = useProjectFormat();
  return (day: Weekday, style: "weekdayShort" | "weekday" = "weekdayShort") => format.day(WEEKDAY_DAY[day], style);
}

export function CapacityDialog({ row, onClose }: { row: TeamMemberRow | null; onClose: () => void }) {
  const t = useTranslations("People.capacityDialog");
  const { team } = useTeam();
  const capacity = useTeamPersonCapacity(team.id, row?.person.id ?? null);
  return (
    <Dialog open={row !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {row ? (
        <DialogContent title={t("title", { name: row.person.name })}>
          {capacity.data ? (
            <CapacityForm
              key={row.person.id}
              row={row}
              hours={capacity.data.hours}
              days={capacity.data.days}
              onDone={onClose}
            />
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function CapacityForm({
  row,
  hours: initialHours,
  days: initialDays,
  onDone,
}: {
  row: TeamMemberRow;
  hours: number;
  days: readonly Weekday[];
  onDone: () => void;
}) {
  const t = useTranslations("People.capacityDialog");
  const weekday = useWeekdayName();
  const { team } = useTeam();
  const { setCapacity } = useTeamMemberActions(team.id);
  const [hours, setHours] = useState(String(initialHours));
  const [days, setDays] = useState<ReadonlySet<Weekday>>(new Set(initialDays));
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const value = Number(hours);
        if (!Number.isFinite(value) || value < 0 || value > 80 || days.size === 0) return setError(t("invalid"));
        setError(null);
        setCapacity.mutate(
          { personId: row.person.id, hours: value, days: WEEK_ORDER.filter((day) => days.has(day)) },
          {
            onSuccess: () => {
              toast({ title: t("saved") });
              onDone();
            },
            onError: () => setError(t("invalid")),
          },
        );
      }}
    >
      <div role="group" aria-label={t("days")} className="flex flex-col gap-2">
        <p className="text-sm font-bold text-fg">{t("days")}</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_ORDER.map((day) => (
            <ToggleChip
              key={day}
              scope="team"
              size="sm"
              selected={days.has(day)}
              onSelectedChange={() => {
                const next = new Set(days);
                if (next.has(day)) next.delete(day);
                else next.add(day);
                setDays(next);
              }}
            >
              {weekday(day)}
            </ToggleChip>
          ))}
        </div>
      </div>
      <Field invalid={error !== null}>
        <FieldLabel>{t("hours")}</FieldLabel>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={80}
          dir="ltr"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
        />
        <FieldDescription>{t("hint")}</FieldDescription>
      </Field>
      {error ? <InlineAlert tone="danger" title={error} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={setCapacity.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function MoveMemberDialog({ row, onClose }: { row: TeamMemberRow | null; onClose: () => void }) {
  const t = useTranslations("People.moveDialog");
  const tPeople = useTranslations("People");
  const { team } = useTeam();
  const preview = useMemberRemovalPreview(team.id, row?.person.id ?? null);
  const directory = useTeamDirectory();
  const { move } = useTeamMemberActions(team.id);
  const targets = (directory.data?.teams ?? []).filter((item) => item.id !== team.id && item.lifecycle === "active");
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const chosen = target ?? targets[0]?.id ?? null;
  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) {
          setFailed(false);
          setTarget(null);
          onClose();
        }
      }}
    >
      {row ? (
        <DialogContent title={t("title", { name: row.person.name })}>
          {preview.data ? (
            <p className="text-sm text-fg-secondary">
              {t("body", { name: row.person.name, n: preview.data.openTeamTasks, team: team.name })}
            </p>
          ) : null}
          {targets.length ? (
            <Field>
              <FieldLabel>{t("to")}</FieldLabel>
              <Select value={chosen ?? undefined} onValueChange={setTarget}>
                {targets.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-fg-muted">{t("noTeams")}</p>
          )}
          {failed ? <InlineAlert tone="danger" title={tPeople("failed")} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              disabled={!chosen || move.isPending}
              onClick={() => {
                if (!chosen) return;
                const name = targets.find((item) => item.id === chosen)?.name ?? "";
                move.mutate(
                  { personId: row.person.id, toTeamId: chosen },
                  {
                    onSuccess: () => {
                      toast({ title: t("done", { name: row.person.name, team: name }) });
                      onClose();
                    },
                    onError: () => setFailed(true),
                  },
                );
              }}
            >
              {t("submit")}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function RemoveMemberDialog({ row, onClose }: { row: TeamMemberRow | null; onClose: () => void }) {
  const t = useTranslations("People.removeDialog");
  const tPeople = useTranslations("People");
  const { team } = useTeam();
  const preview = useMemberRemovalPreview(team.id, row?.person.id ?? null);
  const { remove } = useTeamMemberActions(team.id);
  const [error, setError] = useState(false);
  if (!row) return null;
  return (
    <ConfirmDialog
      open
      tone="destructive"
      onOpenChange={(open) => {
        if (!open) {
          setError(false);
          onClose();
        }
      }}
      title={t("title", { name: row.person.name })}
      description={
        <>
          {t("body")}
          {preview.data ? (
            <>
              {" "}
              <strong>{t("preview", { n: preview.data.openTeamTasks })}</strong>
            </>
          ) : null}
        </>
      }
      confirmLabel={t("confirm")}
      cancelLabel={t("cancel")}
      error={error ? tPeople("failed") : undefined}
      onConfirm={() =>
        remove.mutateAsync(row.person.id).then(
          () => {
            toast({ title: t("done", { name: row.person.name }) });
            onClose();
          },
          (cause: unknown) => {
            setError(true);
            throw cause;
          },
        )
      }
    />
  );
}
