"use client";

import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { DeclineReason, ProjectCapabilities, ProjectPerson, ProjectTask } from "@/data/project-domain";
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
 *
 * Seam (Teams TM-15): `AssignmentBlockView` is the context-neutral block;
 * the scope passes the assignees, rights and handlers. `AssignmentBlock`
 * binds it to the Project hooks.
 */

export interface AssignmentBlockViewProps {
  assignees: readonly { person: ProjectPerson; state: "pending" | "accepted" | "declined"; by?: ProjectPerson }[];
  /** The viewer may accept / decline their own pending assignment. */
  canAccept: boolean;
  /** The viewer sees Remind / Reassign on someone else's pending assignment. */
  canManage: boolean;
  assignedAt: string | null;
  busy: boolean;
  remindBusy?: boolean;
  onAccept: () => void;
  onDecline: (reason: DeclineReason, note: string) => void;
  onRemind: (name: string) => void;
  /** Omit to hide Reassign (a scope without a reassign flow yet). */
  onReassign?: () => void;
}

export function AssignmentBlockView({
  assignees,
  canAccept,
  canManage,
  assignedAt,
  busy,
  remindBusy = false,
  onAccept,
  onDecline,
  onRemind,
  onReassign,
}: AssignmentBlockViewProps) {
  const t = useTranslations("ProjectTask");
  const format = useProjectFormat();
  const mine = assignees.find((assignee) => assignee.person.id === "me" && assignee.state === "pending");
  const otherPending = assignees.find((assignee) => assignee.person.id !== "me" && assignee.state === "pending");

  if (mine && canAccept) {
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
            onDecline={onDecline}
          />
          <Button disabled={busy} onClick={onAccept}>
            {t("assign.accept")}
          </Button>
        </div>
      </section>
    );
  }

  if (otherPending && canManage) {
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
          disabled={remindBusy}
          onClick={() => onRemind(otherPending.person.name)}
        >
          {t("assign.remind")}
        </Button>
        {onReassign ? (
          <Button size="sm" aria-haspopup="dialog" onClick={onReassign}>
            {t("assign.reassign")}
          </Button>
        ) : null}
      </section>
    );
  }
  return null;
}

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
  const { accept, decline, revertAccept, remind } = useAssignmentActions(task.projectId);
  const openSheet = useOpenProjectSheet();
  return (
    <AssignmentBlockView
      assignees={task.assignees}
      canAccept={capabilities.acceptAssignments}
      canManage={capabilities.manageAssignments}
      assignedAt={assignedAt}
      busy={accept.isPending || decline.isPending}
      remindBusy={remind.isPending}
      onDecline={(reason, note) =>
        decline.mutate(
          { taskId: task.id, reason, note: note || undefined, revision: task.revision },
          { onSuccess: () => toast({ title: t("decline.done") }) },
        )
      }
      onAccept={() =>
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
      onRemind={(name) => remind.mutate(task.id, { onSuccess: () => toast({ title: t("assign.reminded", { name }) }) })}
      onReassign={() => openSheet("assignment-reassign", { task: task.id })}
    />
  );
}
