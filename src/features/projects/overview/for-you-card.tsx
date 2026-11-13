"use client";

import { Circle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { ProductCard } from "@/design-system/surfaces/product-card";
import type { ProjectTask, ProjectWorkflow } from "@/data/project-domain";
import { useAssignmentActions, useMyProjectWork } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { projectHref } from "@/features/navigation/contexts";
import { AssignmentDecline } from "../assignments/assignment-decline";
import { useProjectFormat } from "../format";
import { WorkflowStatusChip } from "../workflow-status-chip";

/*
 * PJ-01 "For you" (product card): my pending assignments with Accept /
 * Decline (decline opens the assignment-decline popover; a reason is
 * required) and my accepted open tasks. Hidden when both are empty, and for
 * roles that cannot hold assignments (capability). Accepting projects the
 * task into Personal Tasks / My Calendar (server side; never a copy).
 */
export function ForYouCard({
  projectId,
  workflow,
  canAccept,
  shared = false,
}: {
  projectId: string;
  workflow: ProjectWorkflow;
  canAccept: boolean;
  /** Verified guest: the card is "Your shared tasks". */
  shared?: boolean;
}) {
  const t = useTranslations("Project");
  const format = useProjectFormat();
  const work = useMyProjectWork(projectId);
  const { accept, decline } = useAssignmentActions(projectId);
  const pending = work.data?.pending ?? [];
  const open = work.data?.open ?? [];
  if (!canAccept || (pending.length === 0 && open.length === 0)) return null;

  const conflict = [accept.error, decline.error].some(
    (error) => error instanceof RepositoryError && error.code === "conflict",
  );
  const statusOf = (task: ProjectTask) => workflow.statuses.find((status) => status.id === task.statusId);
  const busy = accept.isPending || decline.isPending;

  return (
    <ProductCard as="section" aria-labelledby="for-you-title" className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="for-you-title" className="flex items-baseline gap-2 type-title text-fg">
          {shared ? t("forYou.shared") : t("forYou.title")}
          {pending.length > 0 ? (
            <span className="text-xs font-semibold text-fg-secondary">
              {t("forYou.waiting", { n: format.number(pending.length) })}
            </span>
          ) : null}
        </h2>
        <Link
          href={`${projectHref(projectId, "tasks")}?view=mine`}
          className="shrink-0 rounded-pill text-xs font-bold text-fg underline underline-offset-2 hover:text-scope-deep"
        >
          {t("forYou.myTasks")}
        </Link>
      </div>

      {conflict ? <InlineAlert tone="warning" title={t("assign.conflict")} /> : null}

      {pending.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[0.6875rem] font-bold tracking-wide text-fg-secondary uppercase">{t("forYou.toAccept")}</p>
          <ul className="flex flex-col gap-2">
            {pending.map((task) => {
              const mine = task.assignees.find((assignee) => assignee.person.id === "me");
              const by = mine?.by;
              return (
                <li
                  key={task.id}
                  className="flex flex-col gap-2.5 rounded-row bg-scope-soft/60 p-3 inset-ring inset-ring-scope-soft"
                >
                  <div className="flex items-start gap-2.5">
                    {by ? (
                      <Avatar name={by.name} initials={by.initials} size={32} className="size-7 text-[0.625rem]" />
                    ) : null}
                    <div className="flex min-w-0 flex-col leading-snug">
                      <Link
                        href={projectHref(projectId, "tasks") + `/${task.id}`}
                        className="truncate text-sm font-bold text-fg hover:underline"
                      >
                        <bdi>{task.title}</bdi>
                      </Link>
                      <span className="truncate text-xs font-medium text-fg-secondary">
                        {task.due
                          ? t("forYou.assignedBy", { name: by?.name ?? "", date: format.day(task.due) })
                          : t("forYou.assignedByNoDue", { name: by?.name ?? "" })}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <AssignmentDecline
                      assignerName={by?.name ?? ""}
                      busy={busy}
                      trigger={
                        <Button variant="secondary" size="sm" className="bg-surface" disabled={busy}>
                          {t("assign.decline")}
                        </Button>
                      }
                      onDecline={(reason, note) =>
                        decline.mutate(
                          { taskId: task.id, reason, note: note || undefined, revision: task.revision },
                          { onSuccess: () => toast({ title: t("forYou.declined") }) },
                        )
                      }
                    />
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        accept.mutate(
                          { taskId: task.id, revision: task.revision },
                          { onSuccess: () => toast({ title: t("forYou.accepted"), tone: "success" }) },
                        )
                      }
                    >
                      {t("assign.accept")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {open.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-[0.6875rem] font-bold tracking-wide text-fg-secondary uppercase">
            {t("forYou.myOpen", { n: format.number(open.length) })}
          </p>
          <ul className="flex flex-col">
            {open.map((task) => (
              <li key={task.id} className="flex min-h-11 items-center gap-2.5 border-b border-line last:border-b-0">
                <Icon icon={Circle} size={18} className="shrink-0 text-icon-muted" />
                <Link
                  href={projectHref(projectId, "tasks") + `/${task.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-fg hover:underline"
                >
                  <bdi>{task.title}</bdi>
                </Link>
                <WorkflowStatusChip status={statusOf(task)} />
                {task.due ? (
                  <span className="w-14 shrink-0 text-end text-xs font-medium text-fg-secondary">
                    {format.day(task.due)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-fg-muted">{t("forYou.projection")}</p>
    </ProductCard>
  );
}
