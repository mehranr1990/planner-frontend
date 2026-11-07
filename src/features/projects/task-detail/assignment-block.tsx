"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { ProjectCapabilities, ProjectTask } from "@/data/project-domain";
import { useAssignmentActions } from "@/data/project-queries";
import { AssignmentDecline } from "../assignments/assignment-decline";
import { useProjectFormat } from "../format";
import { useOpenProjectSheet } from "../sheets/project-sheet-params";

/*
 * PJ-15 AssignmentBlock. Shown only to the assignee while pending: "Sara P.
 * assigned this to you" + Accept / Decline (reason chips + note). Accepting
 * adds the task to Personal Tasks / My Calendar as a projection (toast with
 * Undo). Managers see "Pending · Kian F." with Remind / Reassign instead
 * (assignment-reassign sheet, PJ-90).
 */
export function AssignmentBlock({
  task,
  capabilities,
  assignedAt,
}: {
  task: ProjectTask;
  capabilities: ProjectCapabilities;
  assignedAt: string | null;
}) {
  const t = useTranslations("ProjectTask");
  const format = useProjectFormat();
  const { accept, decline, revertAccept, remind } = useAssignmentActions();
  const openSheet = useOpenProjectSheet();
  const mine = task.assignees.find((assignee) => assignee.person.id === "me" && assignee.state === "pending");
  const otherPending = task.assignees.find((assignee) => assignee.person.id !== "me" && assignee.state === "pending");
  const busy = accept.isPending || decline.isPending;

  if (mine && capabilities.acceptAssignments) {
    const by = mine.by;
    return (
      <section
        aria-label={t("assign.banner", { name: by?.name ?? "" })}
        data-slot="assignment-block"
        className="flex flex-col gap-3 rounded-row bg-scope-soft/50 p-3.5 ring-[1.5px] ring-primary"
      >
        <div className="flex items-start gap-2.5">
          {by ? (
            <Avatar name={by.name} initials={by.initials} size={32} decorative className="size-8 text-[0.625rem]" />
          ) : null}
          <div className="flex min-w-0 flex-col leading-snug">
            <p className="text-sm font-bold text-fg">{t("assign.banner", { name: by?.name ?? "" })}</p>
            <p className="text-xs font-medium text-fg-secondary">
              {t("assign.meta", { time: assignedAt ? format.relative(assignedAt) : "" })}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <AssignmentDecline
            copy="ProjectTask.decline"
            assignerName={by?.name ?? ""}
            busy={busy}
            trigger={
              <Button variant="secondary" disabled={busy} className="bg-surface">
                {t("assign.decline")}
              </Button>
            }
            onDecline={(reason, note) =>
              decline.mutate(
                { taskId: task.id, reason, note: note || undefined, revision: task.revision },
                { onSuccess: () => toast({ title: t("decline.done") }) },
              )
            }
          />
          <Button
            disabled={busy}
            onClick={() =>
              accept.mutate(
                { taskId: task.id, revision: task.revision },
                {
                  onSuccess: (accepted) =>
                    toast({
                      title: t("assign.accepted"),
                      tone: "success",
                      action: {
                        label: t("assign.undo"),
                        altText: t("assign.undoAlt"),
                        onClick: () => revertAccept.mutate({ taskId: accepted.id, revision: accepted.revision }),
                      },
                    }),
                },
              )
            }
          >
            {t("assign.accept")}
          </Button>
        </div>
      </section>
    );
  }

  if (otherPending && capabilities.manageAssignments) {
    return (
      <section
        data-slot="assignment-block"
        className="flex flex-wrap items-center gap-3 rounded-row bg-warning-soft px-3.5 py-3"
      >
        <Avatar
          name={otherPending.person.name}
          initials={otherPending.person.initials}
          size={32}
          decorative
          className="size-8 text-[0.625rem]"
        />
        <p className="min-w-0 flex-1 text-sm font-bold text-warning-text">
          {t("assign.managerPending", { name: otherPending.person.name })}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="bg-surface"
          disabled={remind.isPending}
          onClick={() =>
            remind.mutate(task.id, {
              onSuccess: () => toast({ title: t("assign.reminded", { name: otherPending.person.name }) }),
            })
          }
        >
          {t("assign.remind")}
        </Button>
        <Button size="sm" aria-haspopup="dialog" onClick={() => openSheet("assignment-reassign", { task: task.id })}>
          {t("assign.reassign")}
        </Button>
      </section>
    );
  }
  return null;
}
