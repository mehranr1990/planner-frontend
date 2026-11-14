"use client";

import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { Habit } from "@/data/domain";
import type { Routine } from "@/data/personal-services";
import { useRoutines, useRoutineWrite } from "@/data/personal-services-queries";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { cn } from "@/lib/cn";
import { useServiceError } from "./service-error";
import { useServiceFormat } from "./use-service-format";

/*
 * Habits · Routines: a saved, ordered group of habits (the contract's
 * Routine: title + habits, no schedule or check-in of its own). Habits are
 * still checked in one by one; deleting archives the routine and never
 * touches habits or their history.
 */

export function RoutinesCard({ habits }: { habits: Habit[] }) {
  const t = useTranslations("Services.routines");
  const query = useRoutines();
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const done = new Set(habits.map((habit) => habit.id));

  return (
    <UtilityCard as="section" aria-labelledby="routines-title" className="flex flex-col gap-3" data-routines>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 id="routines-title" className="type-title">
            {t("title")}
          </h2>
          <p className="text-xs text-fg-muted">{t("hint")}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")} disabled={habits.length === 0}>
          <Plus aria-hidden="true" size={16} />
          {t("new")}
        </Button>
      </div>
      {query.isPending ? (
        <LoadingState>
          <Skeleton className="h-14 rounded-row" />
        </LoadingState>
      ) : query.isError ? (
        <ErrorState variant="bare" title={t("loadError")} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState variant="bare" icon={ListChecks} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {query.data.map((routine) => (
            <RoutineRow key={routine.id} routine={routine} active={done} onEdit={() => setEditing(routine)} />
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent title={editing === "new" ? t("newTitle") : t("editTitle")} description={t("hint")} size="md">
          {editing !== null ? <RoutineForm routine={editing === "new" ? undefined : editing} habits={habits} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </UtilityCard>
  );
}

function RoutineRow({ routine, active, onEdit }: { routine: Routine; active: Set<string>; onEdit(): void }) {
  const t = useTranslations("Services.routines");
  const write = useRoutineWrite();
  const message = useServiceError();
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-row bg-surface p-3 inset-ring inset-ring-line">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <bdi dir="auto" className="text-sm font-bold text-fg">
          {routine.title}
        </bdi>
        <ol className="flex flex-wrap gap-1.5" aria-label={t("habitsOf", { title: routine.title })}>
          {routine.habits.map((habit) => {
            const gone = habit.archived || !active.has(habit.id);
            return (
              <li key={habit.id} className={cn("rounded-pill bg-subtle px-2.5 py-1 text-xs font-semibold", gone ? "text-fg-muted line-through" : "text-fg-secondary")}>
                <bdi dir="auto">{habit.title}</bdi>
                {gone ? <span className="sr-only"> ({t("inactive")})</span> : null}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton size="sm" variant="ghost" icon={Pencil} label={t("edit", { title: routine.title })} onClick={onEdit} />
        <IconButton size="sm" variant="ghost" icon={Trash2} label={t("delete", { title: routine.title })} disabled={write.isPending} onClick={() => setConfirm(true)} />
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="destructive"
        title={t("deleteTitle")}
        description={t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        onConfirm={() =>
          write.mutate(
            { kind: "remove", routine },
            { onSuccess: () => toast({ tone: "neutral", title: t("deleted") }), onError: (error) => toast({ tone: "danger", title: message(error) }) },
          )
        }
      />
    </li>
  );
}

function RoutineForm({ routine, habits, onDone }: { routine?: Routine; habits: Habit[]; onDone(): void }) {
  const t = useTranslations("Services.routines");
  const titleId = useId();
  const format = useServiceFormat();
  const write = useRoutineWrite();
  const message = useServiceError();
  const [title, setTitle] = useState(routine?.title ?? "");
  // Keeps habits that are no longer active in the order (the server still holds them).
  const [order, setOrder] = useState<string[]>(routine?.habits.map((habit) => habit.id) ?? []);
  const [submitted, setSubmitted] = useState(false);
  const titles = new Map([...(routine?.habits.map((habit) => [habit.id, habit.title] as const) ?? []), ...habits.map((habit) => [habit.id, habit.title] as const)]);
  const valid = title.trim().length > 0 && order.length > 0;

  const move = (index: number, delta: number) =>
    setOrder((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    const input = { title: title.trim(), habitIds: order };
    write.mutate(routine ? { kind: "update", routine, patch: input } : { kind: "create", input }, {
      onSuccess: () => {
        toast({ tone: "success", title: routine ? t("saved") : t("created") });
        onDone();
      },
      onError: (error) => toast({ tone: "danger", title: message(error) }),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="text-sm font-bold text-fg">
          {t("name")}
        </label>
        <Input id={titleId} dir="auto" maxLength={300} value={title} invalid={submitted && !title.trim()} onChange={(event) => setTitle(event.target.value)} />
        {submitted && !title.trim() ? <p className="text-xs font-semibold text-danger-text">{t("errors.title")}</p> : null}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold text-fg">{t("pick")}</legend>
        {habits.map((habit) => (
          <Checkbox
            key={habit.id}
            label={<bdi dir="auto">{habit.title}</bdi>}
            checked={order.includes(habit.id)}
            onCheckedChange={(checked) => setOrder((current) => (checked === true ? [...current, habit.id] : current.filter((id) => id !== habit.id)))}
          />
        ))}
        {submitted && order.length === 0 ? <p className="text-xs font-semibold text-danger-text">{t("errors.habits")}</p> : null}
      </fieldset>
      {order.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-fg">{t("order")}</span>
          <ol className="flex flex-col gap-1">
            {order.map((id, index) => (
              <li key={id} className="flex items-center gap-2 rounded-row bg-subtle px-3 py-1.5 text-sm">
                <span className="w-5 text-fg-muted tabular">{format.number(index + 1)}</span>
                <bdi dir="auto" className="min-w-0 flex-1 truncate">
                  {titles.get(id) ?? "—"}
                </bdi>
                <IconButton size="sm" variant="ghost" icon={ArrowUp} label={t("moveUp", { title: titles.get(id) ?? "" })} disabled={index === 0} onClick={() => move(index, -1)} />
                <IconButton size="sm" variant="ghost" icon={ArrowDown} label={t("moveDown", { title: titles.get(id) ?? "" })} disabled={index === order.length - 1} onClick={() => move(index, 1)} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={write.isPending}>
          {routine ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
