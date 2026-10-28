"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import type { Task } from "@/data/domain";
import { useSetTaskDone, useTasks } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { taskWhen } from "@/features/tasks/domain/when";
import { priorityStyle } from "@/features/tasks/ui/priority-style";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { TASKS_HREF } from "@/features/personal/routes";
import { cn } from "@/lib/cn";
import { CardError, CardHead, CardLoading } from "../ui/card-parts";

/*
 * Tasks (P01 → Tasks · Today): the next three open tasks of the Today view
 * and the latest one done, checked in place (no navigation; the row strikes
 * through and the count ticks). "Add a task…" opens Quick Add, which files
 * to today by default.
 */

const OPEN_ROWS = 3;

function TaskChip({ task, today }: { task: Task; today: string }) {
  const t = useTranslations("Overview.tasks");
  const format = useTasksFormat();
  const when = taskWhen(task, { day: today });
  if (task.status === "open" && "tone" in when && when.tone === "overdue") {
    return <span className="rounded-pill bg-danger-soft px-2.5 py-1 text-[0.6875rem] font-bold text-danger-text">{t("overdue")}</span>;
  }
  if (task.priority === "urgent" || task.priority === "high") {
    return (
      <span className={cn("rounded-pill px-2.5 py-1 text-[0.6875rem] font-bold", priorityStyle(task.priority).chip)}>
        {format.priority(task.priority)}
      </span>
    );
  }
  return <span className="rounded-pill bg-subtle px-2.5 py-1 text-[0.6875rem] font-bold text-fg-secondary">{format.when(when).text}</span>;
}

export function TasksCard({ today, className }: { today: string; className?: string }) {
  const t = useTranslations("Overview.tasks");
  const format = useTasksFormat();
  const query = useTasks({ view: "today", day: today });
  const setDone = useSetTaskDone();
  const openSheet = useOpenSheet();

  const all = query.data ?? [];
  const open = all.filter((task) => task.status === "open");
  const lastDone = all
    .filter((task) => task.status === "done")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
  const rows = [...open.slice(0, OPEN_ROWS), ...(lastDone ? [lastDone] : [])];

  const toggle = (task: Task, done: boolean) =>
    setDone.mutate({ id: task.id, done }, { onError: () => toast({ tone: "danger", title: t("failed") }) });

  return (
    <ProductCard as="section" aria-labelledby="overview-tasks-title" className={cn("flex flex-col gap-2", className)}>
      <CardHead
        id="overview-tasks-title"
        title={t("title")}
        count={query.data ? t("left", { count: open.length, countText: format.number(open.length) }) : undefined}
        href={TASKS_HREF}
        linkLabel={t("all")}
      />
      {query.isPending ? (
        <CardLoading rows={4} />
      ) : query.isError ? (
        <CardError onRetry={() => void query.refetch()} />
      ) : (
        <>
          {rows.length === 0 ? (
            <p role="status" className="rounded-field bg-subtle p-4 text-sm text-fg-secondary">
              {t("empty")}
            </p>
          ) : (
            <ul aria-label={t("listLabel")} className="flex flex-col">
              {rows.map((task) => {
                const done = task.status === "done";
                return (
                  <li key={task.id} className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      checked={done}
                      onCheckedChange={(checked) => toggle(task, checked === true)}
                      aria-label={done ? t("reopen", { title: task.title }) : t("complete", { title: task.title })}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm font-medium transition-colors duration-(--motion-fast)",
                        done && "text-fg-muted line-through",
                      )}
                    >
                      <bdi dir="auto">{task.title}</bdi>
                    </span>
                    {done ? null : <TaskChip task={task} today={today} />}
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => openSheet("quick-add")}
            className="mt-auto flex min-h-11 items-center gap-2 rounded-field bg-subtle px-3.5 text-sm text-fg-muted hover:bg-raised hover:text-fg"
          >
            <Icon icon={Plus} size={16} />
            <span className="flex-1 text-start">{t("add")}</span>
          </button>
        </>
      )}
    </ProductCard>
  );
}
