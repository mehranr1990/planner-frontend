"use client";

import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { WorkflowCategory, WorkflowDraft, WorkflowStatus } from "@/data/project-domain";
import { useProjectWorkflow, useSettingsActions, useWorkflowDraft, useWorkflowPreview } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { useWorkflowStatusLabel, WorkflowStatusChip } from "../workflow-status-chip";
import { useSettingsError } from "./settings-shared";

/*
 * PJ-14 › Workflow (D16): published vN vs draft vN+1. Admin+ edit the draft
 * (status list: rename, category, order, add, remove; allowed-transitions
 * matrix from × to); tasks stay on the published version. Publish shows the
 * migration preview (removed statuses need a target, renamed, added, new
 * transitions) → Keep draft / Publish. Read-only for Managers and on phones
 * (D18).
 */

type SimpleCategory = "todo" | "active" | "done";
const simple = (category: WorkflowCategory): SimpleCategory =>
  category === "todo" ? "todo" : category === "done" ? "done" : "active";

export function WorkflowTab({ readOnly }: { readOnly: boolean }) {
  const t = useTranslations("ProjectSettings");
  const format = useProjectFormat();
  const label = useWorkflowStatusLabel();
  const { project, capabilities } = useProject();
  const published = useProjectWorkflow(project.id);
  const draft = useWorkflowDraft(project.id);
  const actions = useSettingsActions(project.id);
  const onError = useSettingsError();
  const canEdit = capabilities.editWorkflow && !readOnly;
  const preview = useWorkflowPreview(project.id, !!draft.data);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // "Keep draft" hides the preview for this draft version only.
  const [hiddenFor, setHiddenFor] = useState<number | null>(null);
  const showPreview = hiddenFor !== (draft.data?.version ?? null);

  if (!published.data || draft.isPending) return <AccessLoading />;
  const live = published.data;
  const current: Pick<WorkflowDraft, "statuses" | "transitions"> = draft.data ?? live;
  const newIds = new Set(draft.data ? draft.data.statuses.filter((s) => !live.statuses.some((p) => p.id === s.id)).map((s) => s.id) : []);
  const editable = canEdit && !!draft.data;

  const save = (statuses: readonly WorkflowStatus[], transitions = current.transitions) =>
    actions.saveDraft.mutate(
      { statuses, transitions },
      {
        onError: (error) => {
          if (error instanceof RepositoryError && error.message === "needs-done") toast({ tone: "danger", title: t("workflow.needsDone") });
          else if (error instanceof RepositoryError && error.message === "status-names") toast({ tone: "danger", title: t("workflow.names") });
          else onError(error);
        },
      },
    );

  const statuses = current.statuses;
  const name = (status: WorkflowStatus) => label(status);
  const move = (index: number, delta: number) => {
    const next = [...statuses];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    save(next);
  };
  const toggle = (from: string, to: string) => {
    const list = current.transitions[from] ?? [];
    const next = list.includes(to) ? list.filter((id) => id !== to) : [...list, to];
    save(statuses, { ...current.transitions, [from]: next });
  };

  return (
    <div className="flex flex-col gap-4">
      {!capabilities.editWorkflow ? <InlineAlert tone="info" title={t("readOnly")} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex min-h-7 items-center rounded-pill bg-raised px-3 text-xs font-semibold text-fg">
            {t("workflow.published", {
              n: format.number(live.version),
              date: live.publishedAt ? format.day(live.publishedAt.slice(0, 10)) : "",
            })}
          </span>
          {draft.data ? (
            <span className="inline-flex min-h-7 items-center rounded-pill bg-scope-soft px-3 text-xs font-semibold text-scope-deep">
              {t("workflow.draft", { n: format.number(draft.data.version) })}
            </span>
          ) : null}
        </div>
        {draft.data ? (
          <span className="text-xs font-medium text-fg-secondary">{t("workflow.hint", { n: format.number(draft.data.version) })}</span>
        ) : canEdit ? (
          <Button size="sm" onClick={() => save(live.statuses, live.transitions)}>
            {t("workflow.startDraft", { n: format.number(live.version + 1) })}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section aria-labelledby="wf-statuses" className="flex flex-col gap-2">
          <h3 id="wf-statuses" className="text-xs font-bold tracking-[0.08em] text-fg-secondary uppercase">
            {t("workflow.statuses")}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {statuses.map((status, index) => (
              <li
                key={status.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-[18px] bg-subtle px-3 py-2",
                  newIds.has(status.id) && "bg-surface inset-ring-[1.5px] inset-ring-scope-deep",
                )}
              >
                {editable ? (
                  <Input
                    aria-label={t("workflow.rename", { name: name(status) })}
                    dir="auto"
                    defaultValue={name(status)}
                    className="h-9 w-36"
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value && value !== name(status))
                        save(statuses.map((candidate) => (candidate.id === status.id ? { id: candidate.id, name: value, category: candidate.category } : candidate)));
                    }}
                  />
                ) : (
                  <WorkflowStatusChip status={status} />
                )}
                {editable ? (
                  <Select
                    aria-label={t("workflow.categoryOf", { name: name(status) })}
                    value={simple(status.category)}
                    onValueChange={(value) =>
                      save(
                        statuses.map((candidate) =>
                          candidate.id === status.id
                            ? { ...candidate, category: value === simple(candidate.category) ? candidate.category : (value as WorkflowCategory) }
                            : candidate,
                        ),
                      )
                    }
                    className="h-9 w-36"
                  >
                    {(["todo", "active", "done"] as const).map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`workflow.categories.${value}`)}
                      </SelectItem>
                    ))}
                  </Select>
                ) : (
                  <span className="text-xs font-medium text-fg-secondary">
                    {t("workflow.category", { name: t(`workflow.categories.${simple(status.category)}`) })}
                  </span>
                )}
                {newIds.has(status.id) ? (
                  <span className="rounded-pill bg-scope-soft px-2 text-[0.6875rem] font-bold text-scope-deep">{t("workflow.newBadge")}</span>
                ) : null}
                {editable ? (
                  <span className="ms-auto flex">
                    <IconButton size="sm" variant="ghost" label={t("workflow.moveUp", { name: name(status) })} disabled={index === 0} onClick={() => move(index, -1)}>
                      <Icon icon={ArrowUp} size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={t("workflow.moveDown", { name: name(status) })}
                      disabled={index === statuses.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <Icon icon={ArrowDown} size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={t("workflow.remove", { name: name(status) })}
                      onClick={() => save(statuses.filter((candidate) => candidate.id !== status.id))}
                    >
                      <Icon icon={Trash2} size={14} />
                    </IconButton>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {editable ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 self-start"
              onClick={() => {
                let n = 1;
                while (statuses.some((status) => status.id === `status-${n}`)) n += 1;
                save([...statuses, { id: `status-${n}`, name: `${t("workflow.newName")} ${n}`, category: "active" }]);
              }}
            >
              <Icon icon={Plus} size={16} />
              {t("workflow.add")}
            </Button>
          ) : null}
        </section>
        <section aria-labelledby="wf-matrix" className="flex min-w-0 flex-col gap-2">
          <h3 id="wf-matrix" className="text-xs font-bold tracking-[0.08em] text-fg-secondary uppercase">
            {t("workflow.transitions")}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-xs">
              <caption className="sr-only">{t("workflow.transitions")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-start font-medium text-fg-secondary">
                    {t("workflow.fromTo")}
                  </th>
                  {statuses.map((status) => (
                    <th key={status.id} scope="col" className="min-w-16 text-center font-semibold text-fg">
                      <bdi>{name(status)}</bdi>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statuses.map((from) => (
                  <tr key={from.id}>
                    <th scope="row" className="text-start font-semibold text-fg">
                      <bdi>{name(from)}</bdi>
                    </th>
                    {statuses.map((to) => {
                      if (to.id === from.id) return <td key={to.id} />;
                      const allowed = (current.transitions[from.id] ?? []).includes(to.id);
                      const cellLabel = t("workflow.cell", { from: name(from), to: name(to) });
                      return (
                        <td key={to.id} className="p-0">
                          {editable ? (
                            <button
                              type="button"
                              aria-pressed={allowed}
                              aria-label={cellLabel}
                              onClick={() => toggle(from.id, to.id)}
                              className={cn(
                                "flex h-8 w-full items-center justify-center rounded-[10px] focus-visible:focus-ring",
                                allowed ? "bg-scope-soft text-scope-deep" : "bg-subtle",
                              )}
                            >
                              {allowed ? <Icon icon={Check} size={14} /> : null}
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "flex h-8 items-center justify-center rounded-[10px]",
                                allowed ? "bg-scope-soft text-scope-deep" : "bg-subtle",
                              )}
                            >
                              {allowed ? <Icon icon={Check} size={14} label={cellLabel} /> : <span className="sr-only">—</span>}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {draft.data && preview.data && showPreview && canEdit ? (
            <section aria-labelledby="wf-preview" className="flex flex-col gap-2 rounded-[20px] bg-warning-soft p-4">
              <h4 id="wf-preview" className="text-sm font-bold text-warning-text">
                {t("workflow.previewTitle", { n: format.number(preview.data.version) })}
              </h4>
              <ul className="flex flex-col gap-1 text-sm text-fg">
                {preview.data.staying
                  .filter((entry) => entry.tasks > 0)
                  .slice(0, 3)
                  .map((entry) => (
                    <li key={entry.statusId}>
                      {t("workflow.staying", {
                        n: entry.tasks,
                        status: name(statuses.find((status) => status.id === entry.statusId)!),
                      })}
                    </li>
                  ))}
                {preview.data.removed.length === 0 ? <li>{t("workflow.noRemoved")}</li> : null}
                {preview.data.removed.map((entry) => (
                  <li key={entry.status.id} className="flex flex-wrap items-center gap-2">
                    <span>{t("workflow.removed", { status: name(entry.status), n: entry.tasks })}</span>
                    {entry.tasks > 0 ? (
                      <Select
                        aria-label={t("workflow.removed", { status: name(entry.status), n: entry.tasks })}
                        value={mapping[entry.status.id]}
                        onValueChange={(value) => setMapping((current) => ({ ...current, [entry.status.id]: value }))}
                        className="h-9 w-40 bg-surface"
                      >
                        {statuses.map((status) => (
                          <SelectItem key={status.id} value={status.id}>
                            {name(status)}
                          </SelectItem>
                        ))}
                      </Select>
                    ) : null}
                  </li>
                ))}
                {preview.data.renamed.map((entry) => (
                  <li key={entry.statusId}>{t("workflow.renamed", { from: entry.from, to: entry.to })}</li>
                ))}
                {preview.data.added.map((status) => (
                  <li key={status.id}>{t("workflow.added", { status: status.name })}</li>
                ))}
                {preview.data.addedTransitions.map(([from, to]) => (
                  <li key={`${from}>${to}`}>
                    {t("workflow.newTransition", {
                      from: name(statuses.find((status) => status.id === from)!),
                      to: name(statuses.find((status) => status.id === to)!),
                    })}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="bg-surface" onClick={() => setHiddenFor(draft.data?.version ?? null)}>
                  {t("workflow.keepDraft")}
                </Button>
                <Button
                  disabled={
                    actions.publish.isPending ||
                    preview.data.removed.some((entry) => entry.tasks > 0 && !mapping[entry.status.id])
                  }
                  onClick={() =>
                    // Publishing removes the draft (this box unmounts): toast from the promise.
                    actions.publish.mutateAsync(mapping).then(
                      (workflow) => {
                        setMapping({});
                        toast({ title: t("workflow.publishedToast", { n: format.number(workflow.version) }) });
                      },
                      (error: unknown) => {
                        if (error instanceof RepositoryError && error.message === "mapping")
                          toast({ tone: "danger", title: t("workflow.mapping") });
                        else onError(error);
                      },
                    )
                  }
                >
                  {t("workflow.publish", { n: format.number(preview.data.version) })}
                </Button>
                <Button variant="ghost" onClick={() => actions.discardDraft.mutate(undefined, { onError })}>
                  {t("workflow.discard")}
                </Button>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </div>
  );
}
