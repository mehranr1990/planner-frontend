"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlannerToday } from "@/data/clock";
import { useCreateTask, useTasks } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useFocusFormat } from "./use-focus-format";

/*
 * No task chosen (P09): Focus opened from the rail or Quick Add with no
 * current block. Name a new task, pick one of today's open tasks, or run
 * just a timer.
 */
export function FocusPick({ onStart }: { onStart: (taskId: string | null) => void }) {
  const t = useTranslations("Focus.pick");
  const format = useFocusFormat();
  const id = useId();
  const today = getPlannerToday();
  const query = useTasks({ view: "today", day: today });
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const open = (query.data ?? []).filter((task) => task.status === "open");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), date: today }, { onSuccess: (task) => onStart(task.id) });
  };

  return (
    <ProductCard as="section" aria-labelledby={`${id}-title`} className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>
        <h2 id={`${id}-title`} className="type-title">
          {t("title")}
        </h2>
        <p className="text-sm text-fg-secondary">{t("description")}</p>
      </div>
      <form onSubmit={submit}>
        <label htmlFor={`${id}-input`} className="sr-only">
          {t("description")}
        </label>
        <Input
          id={`${id}-input`}
          dir="auto"
          value={title}
          placeholder={t("description")}
          loading={create.isPending}
          onChange={(event) => setTitle(event.target.value)}
        />
      </form>
      {query.isPending ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton shape="row" className="h-10 w-full" />
          <Skeleton shape="row" className="h-10 w-full" />
        </div>
      ) : open.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul aria-label={t("list")} className="flex flex-col gap-1.5">
          {open.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onStart(task.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-field bg-subtle px-3.5 text-start text-sm font-semibold hover:bg-raised"
              >
                <bdi dir="auto" className="min-w-0 flex-1 truncate">
                  {task.title}
                </bdi>
                {task.durationMinutes ? (
                  <span className="shrink-0 text-xs font-normal text-fg-muted">
                    {t("minutes", { minutes: format.digits(task.durationMinutes) })}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="outline" size="sm" onClick={() => onStart(null)}>
          {t("justTimer")}
        </Button>
      </div>
    </ProductCard>
  );
}
