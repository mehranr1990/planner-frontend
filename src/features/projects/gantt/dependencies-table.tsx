"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { controlSurfaceClasses } from "@/components/ui/input";
import type { DependencyType, ScheduleGraph, ScheduleLink } from "@/data/project-domain";
import { useScheduleActions } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { cn } from "@/lib/cn";
import { useProjectFormat } from "../format";

/*
 * DependenciesTable (PJ-05 "Dependencies list"): the full keyboard
 * alternative to drawing on the Gantt — every link with its type (FS / SS /
 * FF / SF) and lag (+) / lead (−), Edit and Remove inline, and an add row.
 * A loop is refused inline (“A” already depends on “B”). Manager+ edits;
 * everyone else (and phones) reads.
 */

const TYPES: readonly DependencyType[] = ["FS", "SS", "FF", "SF"];

export interface DependenciesTableProps {
  projectId: string;
  graph: ScheduleGraph;
  editable: boolean;
}

export function DependenciesTable({ projectId, graph, editable }: DependenciesTableProps) {
  const t = useTranslations("Gantt");
  const format = useProjectFormat();
  const actions = useScheduleActions(projectId);
  const headingId = useId();
  const [editing, setEditing] = useState<{ id: string; type: DependencyType; lag: string } | null>(null);
  const [draft, setDraft] = useState({ successorId: "", predecessorId: "", type: "FS" as DependencyType, lag: "0" });
  const [cycle, setCycle] = useState<{ predecessor: string; successor: string } | null>(null);
  const title = (id: string) => graph.items.find((item) => item.id === id)?.title ?? id;
  const lagText = (lag: number) =>
    t("deps.lagValue", { sign: lag < 0 ? "−" : "+", n: format.number(Math.abs(lag)) });
  const options = [...graph.items].sort((a, b) => a.title.localeCompare(b.title));

  const add = () => {
    if (!draft.successorId || !draft.predecessorId) return;
    setCycle(null);
    actions.addLink.mutate(
      {
        successorId: draft.successorId,
        predecessorId: draft.predecessorId,
        type: draft.type,
        lagDays: Number.parseInt(draft.lag, 10) || 0,
      },
      {
        onSuccess: () => setDraft({ successorId: "", predecessorId: "", type: "FS", lag: "0" }),
        onError: (error) => {
          if (error instanceof RepositoryError && error.message === "cycle")
            setCycle({ predecessor: title(draft.predecessorId), successor: title(draft.successorId) });
        },
      },
    );
  };

  const select = cn(controlSurfaceClasses, "min-h-9 rounded-field px-2 text-sm");

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
      <h2 id={headingId} className="text-sm font-bold text-fg">
        {t("deps.title")} <span className="font-semibold text-fg-muted">{format.number(graph.links.length)}</span>
      </h2>
      {cycle ? (
        <InlineAlert tone="danger" title={t("cycleTitle")} description={t("cycleDetail", cycle)} />
      ) : null}
      <div className="overflow-x-auto rounded-[20px] inset-ring inset-ring-outline">
        <table className="w-full text-sm">
          <thead className="bg-subtle text-xs font-bold text-fg-secondary">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-start">{t("deps.task")}</th>
              <th scope="col" className="px-3 py-2.5 text-start">{t("deps.dependsOn")}</th>
              <th scope="col" className="px-3 py-2.5 text-start">{t("deps.type")}</th>
              <th scope="col" className="px-3 py-2.5 text-start">{t("deps.lag")}</th>
              {editable ? <td /> : null}
            </tr>
          </thead>
          <tbody>
            {graph.links.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-fg-secondary">
                  {t("deps.empty")}
                </td>
              </tr>
            ) : null}
            {graph.links.map((link: ScheduleLink) => {
              const row = editing?.id === link.id ? editing : null;
              const names = { task: title(link.successorId), predecessor: title(link.predecessorId) };
              return (
                <tr key={link.id} data-link={link.id} className="border-t border-outline">
                  <th scope="row" className="px-3 py-2 text-start font-medium text-fg">
                    <bdi>{names.task}</bdi>
                  </th>
                  <td className="px-3 py-2 text-fg-secondary">
                    <bdi>{names.predecessor}</bdi>
                  </td>
                  <td className="px-3 py-2 text-fg-secondary">
                    {row ? (
                      <select
                        aria-label={t("deps.type")}
                        value={row.type}
                        onChange={(event) => setEditing({ ...row, type: event.target.value as DependencyType })}
                        className={select}
                      >
                        {TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type} · {t(`dep.${type}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <abbr title={t(`dep.${link.type}`)} className="no-underline">
                        {link.type}
                      </abbr>
                    )}
                  </td>
                  <td className="px-3 py-2 text-fg-secondary">
                    {row ? (
                      <input
                        type="number"
                        aria-label={t("deps.lag")}
                        value={row.lag}
                        onChange={(event) => setEditing({ ...row, lag: event.target.value })}
                        className={cn(select, "w-20")}
                      />
                    ) : (
                      lagText(link.lagDays)
                    )}
                  </td>
                  {editable ? (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {row ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                actions.updateLink.mutate({
                                  linkId: link.id,
                                  type: row.type,
                                  lagDays: Number.parseInt(row.lag, 10) || 0,
                                });
                                setEditing(null);
                              }}
                            >
                              {t("deps.save")}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                              {t("deps.cancel")}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t("deps.editLabel", names)}
                              onClick={() => setEditing({ id: link.id, type: link.type, lag: String(link.lagDays) })}
                            >
                              {t("deps.edit")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t("deps.removeLabel", names)}
                              onClick={() => actions.removeLink.mutate(link.id)}
                            >
                              {t("deps.remove")}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div role="group" aria-label={t("deps.add")} className="flex flex-wrap items-end gap-2">
          <select
            aria-label={t("deps.task")}
            value={draft.successorId}
            onChange={(event) => setDraft({ ...draft, successorId: event.target.value })}
            className={select}
          >
            <option value="">{t("deps.task")}</option>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <select
            aria-label={t("deps.dependsOn")}
            value={draft.predecessorId}
            onChange={(event) => setDraft({ ...draft, predecessorId: event.target.value })}
            className={select}
          >
            <option value="">{t("deps.dependsOn")}</option>
            {options
              .filter((item) => item.id !== draft.successorId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
          <select
            aria-label={t("deps.type")}
            value={draft.type}
            onChange={(event) => setDraft({ ...draft, type: event.target.value as DependencyType })}
            className={select}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type} · {t(`dep.${type}`)}
              </option>
            ))}
          </select>
          <input
            type="number"
            aria-label={t("deps.lag")}
            value={draft.lag}
            onChange={(event) => setDraft({ ...draft, lag: event.target.value })}
            className={cn(select, "w-20")}
          />
          <Button size="sm" onClick={add} disabled={!draft.successorId || !draft.predecessorId}>
            {t("deps.add")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
