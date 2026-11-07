"use client";

import { useQuery } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import type { ScheduleChange, ScheduleMode, ScheduleMove, SchedulePreview } from "@/data/project-domain";
import { useScheduleActions } from "@/data/project-queries";
import { RepositoryError } from "@/data/repositories";
import { cn } from "@/lib/cn";
import { daysBetween, useProjectFormat } from "../format";

/*
 * SchedulePreviewDialog (PJ-05 "Preview before apply", reused by PJ-08 and
 * later by Gantt/Timeline/Calendar): any date change that moves other items
 * opens it. Ghost (old) vs new bars, the list of moved items, milestone
 * impact, the choice "Move dependent tasks too" / "Move only this task", and
 * one apply with every expected revision. Nothing is saved until Apply; a
 * stale revision shows the SH-02 conflict with Reload. Bars mirror in RTL by
 * coordinates (x → width − x), never a CSS flip.
 */

export interface SchedulePreviewDialogProps {
  projectId: string;
  /** The requested change; null = closed. */
  change: ScheduleChange | null;
  /** Title of the changed item (for "move “…” +5 days"). */
  title: string;
  /** Whether the user may apply a cascade (Manager+); otherwise only "only this task". */
  canCascade: boolean;
  onClose: () => void;
  onApplied?: (preview: SchedulePreview) => void;
}

export function SchedulePreviewDialog({ projectId, change, title, canCascade, onClose, onApplied }: SchedulePreviewDialogProps) {
  const t = useTranslations("Gantt.preview");
  const tCommon = useTranslations("Common");
  const tAccess = useTranslations("Access.states.conflict");
  const tTasks = useTranslations("ProjectTasks");
  const format = useProjectFormat();
  const actions = useScheduleActions(projectId);
  const [mode, setMode] = useState<ScheduleMode>(canCascade ? "cascade" : "only");
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);
  const preview = useQuery({
    queryKey: ["projects", "schedule-preview", projectId, change, mode],
    queryFn: () => actions.preview(change!, mode),
    enabled: change !== null,
  });

  const data = preview.data;
  const moves: readonly ScheduleMove[] = data ? (mode === "cascade" ? data.moves : data.moves.slice(0, 1)) : [];
  const delta = data?.deltaDays ?? 0;
  const deltaText = t("delta", {
    n: Math.abs(delta),
    count: format.number(Math.abs(delta)),
    sign: delta >= 0 ? "+" : "−",
  });
  const milestoneMoves = moves.slice(1).filter((move) => move.kind === "milestone");

  const apply = () => {
    setConflict(false);
    setFailed(false);
    actions.apply.mutate(moves, {
      onSuccess: () => {
        if (data) onApplied?.(data);
        onClose();
      },
      onError: (error) => {
        if (error instanceof RepositoryError && error.code === "conflict") setConflict(true);
        else setFailed(true);
      },
    });
  };

  return (
    <Dialog
      open={change !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={t("title", { change: t("move", { title, delta: deltaText }) })} size="lg" data-scope="project">
        <div className="flex flex-col gap-4">
          <span className="self-start rounded-pill bg-warning-soft px-3 py-1 text-xs font-bold text-warning-text">
            {t("notSaved")}
          </span>
          {data ? (
            <>
              <GhostBars moves={moves} />
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-bold text-fg">
                  {t("count", { n: moves.length, count: format.number(moves.length) })}
                </p>
                <ul className="flex flex-col gap-1 text-xs">
                  {moves.map((move) => (
                    <li key={move.id} data-move={move.id} className="flex items-center justify-between gap-3">
                      <bdi className="truncate font-semibold text-fg">{move.title}</bdi>
                      <span className="shrink-0 text-fg-secondary">
                        {t("range", { from: format.day(move.from.end), to: format.day(move.to.end) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {milestoneMoves.map((move) => (
                <p
                  key={move.id}
                  className="flex items-center gap-2 rounded-row bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-text"
                >
                  <Icon icon={Flag} size={14} />
                  <bdi>
                    {t("milestone", { title: move.title, from: format.day(move.from.end), to: format.day(move.to.end) })}
                  </bdi>
                </p>
              ))}
              {data.hasDependents ? (
                <div className="flex flex-col gap-2 text-sm">
                  {(["cascade", "only"] as const).map((value) => (
                    <label
                      key={value}
                      className={cn(
                        "flex items-center gap-2.5 font-medium text-fg",
                        value === "cascade" && !canCascade && "text-fg-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name="schedule-mode"
                        value={value}
                        checked={mode === value}
                        disabled={value === "cascade" && !canCascade}
                        onChange={() => setMode(value)}
                        className="size-4 accent-[var(--color-primary)]"
                      />
                      {t(value)}
                    </label>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-fg-secondary">{tCommon("loading")}</p>
          )}
          {conflict ? (
            <InlineAlert
              tone="warning"
              title={tAccess("title")}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setConflict(false);
                    void actions.refresh();
                    void preview.refetch();
                  }}
                >
                  {tAccess("reload")}
                </Button>
              }
            />
          ) : null}
          {failed ? <InlineAlert tone="danger" title={tTasks("error")} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={apply} disabled={!data || conflict || actions.apply.isPending}>
              {t("apply", { n: format.number(moves.length) })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const W = 600;
const ROW = 22;
const BAR = 12;

/** Ghost (old, dashed) vs new bars; milestones as diamonds. RTL by coordinates. */
function GhostBars({ moves }: { moves: readonly ScheduleMove[] }) {
  const rtl = Direction.useDirection() === "rtl";
  if (moves.length === 0) return null;
  const days = moves.flatMap((move) => [move.from.start, move.from.end, move.to.start, move.to.end]).sort();
  const first = days[0]!;
  const span = Math.max(1, daysBetween(first, days[days.length - 1]!) + 1);
  const x = (day: string) => {
    const value = 8 + (daysBetween(first, day) / span) * (W - 16);
    return rtl ? W - value : value;
  };
  const width = (start: string, end: string) => Math.max(6, ((daysBetween(start, end) + 1) / span) * (W - 16));
  const left = (start: string, end: string) => (rtl ? x(start) - width(start, end) : x(start));
  const height = moves.length * ROW + 8;
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }}>
      {moves.map((move, index) => {
        const y = 4 + index * ROW + (ROW - BAR) / 2;
        if (move.kind === "milestone") {
          const diamond = (day: string) => {
            const cx = x(day);
            const cy = y + BAR / 2;
            return `M ${cx} ${cy - 6} L ${cx + 6} ${cy} L ${cx} ${cy + 6} L ${cx - 6} ${cy} Z`;
          };
          return (
            <g key={move.id}>
              <path d={diamond(move.from.end)} fill="none" className="stroke-icon-muted" strokeDasharray="3 2" />
              <path d={diamond(move.to.end)} className="fill-danger" />
            </g>
          );
        }
        return (
          <g key={move.id}>
            <rect
              x={left(move.from.start, move.from.end)}
              y={y}
              width={width(move.from.start, move.from.end)}
              height={BAR}
              rx={BAR / 2}
              fill="none"
              strokeDasharray="4 3"
              className="stroke-icon-muted"
            />
            <rect
              x={left(move.to.start, move.to.end)}
              y={y}
              width={width(move.to.start, move.to.end)}
              height={BAR}
              rx={BAR / 2}
              className="fill-scope-soft stroke-scope-deep"
            />
          </g>
        );
      })}
    </svg>
  );
}
