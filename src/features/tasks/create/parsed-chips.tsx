"use client";

import { Calendar, Clock, Flag, Hourglass, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { QuickParseResult } from "../domain/quick-parse";
import { relativeDay } from "../domain/group";
import { PRIORITY_STYLE } from "../ui/priority-style";
import { useTasksFormat, type TasksFormat } from "../ui/use-tasks-format";

/*
 * "Understood as" (P18 · H, P05 capture bar): one quiet chip per recognised
 * token, icon + text (never colour alone). Live region so screen readers hear
 * what the parser picked up without leaving the input.
 */

/** "Tomorrow" · "Wed 22 Mehr". */
export function dayLabel(format: TasksFormat, day: string, today: string): string {
  const relative = relativeDay(day, today);
  return relative ? `${format.relative(relative)} · ${format.dayMonth(day)}` : format.dateHeader(day);
}

const chip = "inline-flex min-h-7 items-center gap-1.5 rounded-pill bg-subtle px-3 text-xs font-bold text-fg-secondary";

function ParsedChip({ icon, className, children }: { icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <li className={cn(chip, className)}>
      {icon}
      {children}
    </li>
  );
}

export function ParsedChips({
  parsed,
  today,
  fallback,
  className,
}: {
  parsed: QuickParseResult;
  today: string;
  /** Shown when nothing was recognised (a hint or the default destination). */
  fallback?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("Tasks.quickAdd");
  const format = useTasksFormat();
  const icon = (Icon: typeof Calendar) => <Icon aria-hidden="true" size={13} />;
  const empty = parsed.recognized.length === 0;

  return (
    <div aria-live="polite" className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <span className="type-label text-fg-muted">{t("understood")}</span>
      {empty ? (
        <span className="text-xs text-fg-muted">{fallback ?? t("nothingYet")}</span>
      ) : (
        <ul className="flex flex-wrap items-center gap-1.5">
          {parsed.date && <ParsedChip icon={icon(Calendar)}>{dayLabel(format, parsed.date, today)}</ParsedChip>}
          {parsed.time && (
            <ParsedChip icon={icon(Clock)}>
              <bdi dir="ltr" className="tabular-nums">
                {format.clock(parsed.time)}
              </bdi>
            </ParsedChip>
          )}
          {parsed.area && (
            <ParsedChip icon={icon(Tag)} className="bg-scope-soft text-scope-deep">
              <bdi>{parsed.area.name}</bdi> · {format.scope("personal")}
            </ParsedChip>
          )}
          {parsed.priority && (
            <ParsedChip icon={icon(Flag)} className={PRIORITY_STYLE[parsed.priority].chip}>
              {format.priority(parsed.priority)}
            </ParsedChip>
          )}
          {parsed.durationMinutes && <ParsedChip icon={icon(Hourglass)}>{format.durationShort(parsed.durationMinutes)}</ParsedChip>}
        </ul>
      )}
    </div>
  );
}
