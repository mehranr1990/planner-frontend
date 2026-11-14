"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  useProjectMembers,
  useProjectTaskActions,
  useProjectTaskDetail,
  useProjectWorkload,
  useReassignTask,
} from "@/data/project-queries";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useCurrentProjectAccess } from "../use-current-project";

/*
 * ?sheet=assignment-reassign&task=<id> (PJ-90): the current assignee and
 * their decline reason, a member picker with this week's load (project
 * estimates only — never Personal data), an optional note. The new person
 * gets a pending assignment. Undo restores the previous assignees.
 */
export function AssignmentReassignSheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Projects.sheets");
  const format = useProjectFormat();
  const taskId = useSearchParams().get("task") ?? "";
  const { project, capabilities } = useCurrentProjectAccess();
  const projectId = project?.id ?? "";
  const detail = useProjectTaskDetail(projectId, taskId);
  const members = useProjectMembers(projectId);
  const workload = useProjectWorkload(projectId, capabilities?.seeTeamLoad ?? false);
  const reassign = useReassignTask(projectId);
  const taskActions = useProjectTaskActions(projectId);
  const [personId, setPersonId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const noteId = useId();
  const listLabelId = useId();

  if (!project || !capabilities) return null;
  if (detail.isError) return <InlineAlert tone="danger" title={t("reassign.missing")} />;
  if (!detail.data || !members.data) return null;

  const task = detail.data.task;
  const current = task.assignees.find((assignee) => assignee.state !== "accepted") ?? task.assignees[0];
  const candidates = members.data.filter((person) => person.id !== current?.person.id);
  const loadOf = (id: string) => workload.data?.find((entry) => entry.person.id === id);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!personId) return;
        const previous = task.assignees
          .filter((assignee) => assignee.state !== "declined")
          .map((assignee) => assignee.person.id);
        const chosen = members.data.find((person) => person.id === personId);
        reassign.mutate(
          { taskId: task.id, personId, note: note.trim() || undefined },
          {
            onSuccess: (updated) => {
              toast({
                title: t("reassign.done", { name: chosen?.name ?? "" }),
                action: {
                  label: t("reassign.undo"),
                  altText: t("reassign.undoAlt"),
                  onClick: () =>
                    taskActions.update.mutate({
                      taskId: updated.id,
                      patch: { assigneeIds: previous },
                      revision: updated.revision,
                    }),
                },
              });
              onDone();
            },
          },
        );
      }}
    >
      {current ? (
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-row px-3 py-2.5",
            current.state === "declined" ? "bg-danger-soft text-danger-text" : "bg-warning-soft text-warning-text",
          )}
        >
          <Avatar
            name={current.person.name}
            initials={current.person.initials}
            size={32}
            decorative
            className="size-8 text-[0.625rem]"
          />
          <div className="flex min-w-0 flex-col leading-snug">
            <p className="text-sm font-bold">
              {current.state === "declined"
                ? t("reassign.declined", { name: current.person.name })
                : t("reassign.pending", { name: current.person.name })}
            </p>
            {current.note ? (
              <p dir="auto" className="text-xs font-semibold">
                “{current.note}”
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div role="radiogroup" aria-labelledby={listLabelId} className="flex flex-col gap-1.5">
        <p id={listLabelId} className="text-sm font-bold text-fg">
          {t("reassign.newAssignee")}
        </p>
        {candidates.map((person) => {
          const load = loadOf(person.id);
          const over = load && load.capacity !== null ? load.hours > load.capacity : false;
          return (
            <button
              key={person.id}
              type="button"
              role="radio"
              aria-checked={personId === person.id}
              onClick={() => setPersonId(person.id)}
              className={cn(
                "flex min-h-12 items-center gap-2.5 rounded-row px-3 text-start transition-colors",
                personId === person.id ? "bg-surface ring-[1.5px] ring-primary" : "bg-subtle hover:bg-raised",
              )}
            >
              <Avatar
                name={person.name}
                initials={person.initials}
                size={32}
                decorative
                className="size-7 text-[0.625rem]"
              />
              <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{person.name}</bdi>
              <span className={cn("text-xs font-semibold", over ? "text-danger-text" : "text-fg-secondary")}>
                {!load
                  ? t("reassign.noLoad")
                  : load.capacity === null
                    ? t("reassign.loadOnly", { hours: format.number(load.hours) })
                    : over
                      ? t("reassign.over", { hours: format.number(load.hours), capacity: format.number(load.capacity) })
                      : t("reassign.load", { hours: format.number(load.hours), capacity: format.number(load.capacity) })}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-fg-secondary">{t("reassign.loadNote")}</p>
      <label htmlFor={noteId} className="sr-only">
        {t("reassign.note")}
      </label>
      <Textarea
        id={noteId}
        dir="auto"
        value={note}
        maxLength={280}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("reassign.note")}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!personId || reassign.isPending}>
          {t("reassign.submit")}
        </Button>
      </div>
    </form>
  );
}
