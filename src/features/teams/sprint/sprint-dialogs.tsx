"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { TeamSprint, TeamSprintState } from "@/data/team-domain";
import { useSprintActions } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { useEstimate } from "./use-estimate";

/*
 * TM-05 Start / Complete sprint dialogs (Lead+). Start: goal, dates (the two
 * weeks after the last sprint) and committed vs capacity (People capacity ×
 * days). Complete: points done and, per unfinished item, next sprint or
 * backlog; completing opens the sprint review under Reviews.
 */

export function StartSprintDialog({
  teamId,
  state,
  open,
  onOpenChange,
}: {
  teamId: string;
  state: TeamSprintState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Sprint");
  const format = useProjectFormat();
  const estimate = useEstimate();
  const { start } = useSprintActions(teamId);
  const [goal, setGoal] = useState("");
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);
  const { next } = state;
  const error = touched && !goal.trim() ? t("startDialog.goalRequired") : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("startDialog.title", { n: format.number(next.number) })}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!goal.trim()) return;
            setFailed(false);
            start.mutate(goal, {
              onSuccess: () => {
                toast({ title: t("toast.started", { n: format.number(next.number) }) });
                setGoal("");
                setTouched(false);
                onOpenChange(false);
              },
              onError: () => setFailed(true),
            });
          }}
        >
          <Field invalid={error !== null}>
            <FieldLabel>{t("goal")}</FieldLabel>
            <Input dir="auto" value={goal} maxLength={80} onChange={(event) => setGoal(event.target.value)} autoFocus />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold text-fg">{t("startDialog.dates")}</p>
            <p className="rounded-row bg-subtle px-3 py-2.5 text-sm font-semibold text-fg">
              {t("startDialog.datesValue", { range: format.range(next.start, next.end) })}
            </p>
          </div>
          <p className="text-xs text-fg-secondary">
            {t("startDialog.capacity", {
              committed: estimate(next.committed, state.unit),
              capacity: estimate(next.capacity, state.unit),
            })}
          </p>
          {failed ? <InlineAlert tone="danger" title={t("toast.failed")} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t("completeDialog.cancel")}
            </Button>
            <Button type="submit" disabled={start.isPending}>
              {t("start")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteSprintDialog({
  teamId,
  sprint,
  nextNumber,
  open,
  onOpenChange,
  onCompleted,
}: {
  teamId: string;
  sprint: TeamSprint;
  nextNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const t = useTranslations("Sprint");
  const format = useProjectFormat();
  const { complete } = useSprintActions(teamId);
  const unfinished = sprint.items.filter((item) => item.status !== "done");
  const [moves, setMoves] = useState<Record<string, "next" | "backlog">>({});
  const [failed, setFailed] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("completeDialog.title", { n: format.number(sprint.number) })}>
        <p className="flex items-baseline gap-2 text-fg">
          <span className="text-3xl font-bold tabular">
            {format.number(sprint.done)}/{format.number(sprint.committed)}
          </span>
          <span className="text-sm font-medium text-fg-secondary">{t("completeDialog.done")}</span>
        </p>
        {unfinished.length ? (
          <>
            <p className="text-sm font-bold text-fg">
              {t("completeDialog.unfinished", { n: format.number(unfinished.length) })}
            </p>
            <ul className="flex flex-col gap-1.5">
              {unfinished.map((item) => (
                <li key={item.taskId} className="flex min-h-12 items-center gap-3 rounded-row bg-subtle px-3">
                  <bdi className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{item.title}</bdi>
                  <Select
                    aria-label={t("completeDialog.moveLabel", { title: item.title })}
                    value={moves[item.taskId] ?? "next"}
                    onValueChange={(value) =>
                      setMoves((current) => ({ ...current, [item.taskId]: value as "next" | "backlog" }))
                    }
                    className="w-36"
                  >
                    <SelectItem value="next">{t("completeDialog.next", { n: format.number(nextNumber) })}</SelectItem>
                    <SelectItem value="backlog">{t("completeDialog.backlog")}</SelectItem>
                  </Select>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {failed ? <InlineAlert tone="danger" title={t("toast.failed")} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("completeDialog.cancel")}
          </Button>
          <Button
            disabled={complete.isPending}
            onClick={() =>
              complete.mutate(
                { sprintId: sprint.id, moves },
                {
                  onSuccess: () => {
                    toast({ title: t("toast.completed", { n: format.number(sprint.number) }) });
                    onOpenChange(false);
                    onCompleted();
                  },
                  onError: () => setFailed(true),
                },
              )
            }
          >
            {t("completeDialog.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
