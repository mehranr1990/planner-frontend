"use client";

import { ArrowRight, BookOpen, CalendarDays, CheckSquare, FileText, Inbox, X, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import type { BrainDumpDestination, BrainDumpLine } from "@/data/domain";
import { TaskCheck } from "@/features/tasks/list/task-parts";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { diffDays } from "@/lib/dates/clock-time";
import { lineKind, toggleTodo } from "./domain/brain-dump";

/*
 * One line of the page. Unsorted: a plain auto-growing textarea (no rich
 * text) whose action row shows on hover or focus. Sorted: muted text with
 * its "→ destination" tag (a link to it; a struck line's tag un-strikes).
 */

export type LineAction = "task" | "note" | "journal" | "event" | "inbox" | "strike";

export const LINE_ACTION_ICON: Record<LineAction, LucideIcon> = {
  task: CheckSquare,
  note: FileText,
  journal: BookOpen,
  event: CalendarDays,
  inbox: Inbox,
  strike: X,
};

/** The destination a tag opens; null when that module has no screen yet (notes). */
function tagHref(line: BrainDumpLine): string | null {
  switch (line.sortedTo) {
    case "task":
      return line.taskId ? `/personal/tasks/${line.taskId}` : "/personal/tasks";
    case "event":
      return line.sortedDay ? `/personal/calendar?date=${line.sortedDay}` : "/personal/calendar";
    case "journal":
      return line.sortedDay ? `/personal/journal/${line.sortedDay}` : "/personal/journal";
    case "inbox":
      return "/personal/inbox";
    default:
      return null;
  }
}

function useTagText() {
  const t = useTranslations("BrainDump");
  const format = useTasksFormat();
  return (line: BrainDumpLine, today: string) => {
    if (line.struck) return t("tag.struck");
    const name = t(`tag.${line.sortedTo as BrainDumpDestination}`);
    if (!line.sortedDay) return name;
    const offset = diffDays(today, line.sortedDay);
    const when = offset === 0 ? t("tag.today") : Math.abs(offset) < 7 ? format.weekdayShort(line.sortedDay) : format.dayMonth(line.sortedDay);
    return `${name} · ${when}`;
  };
}

const textClass = "text-[19px] leading-[1.5] text-fg";

export interface LineRowProps {
  line: BrainDumpLine;
  index: number;
  today: string;
  placeholder?: string;
  actions: readonly LineAction[];
  selecting: boolean;
  selected: boolean;
  textareaRef(element: HTMLTextAreaElement | null): void;
  onToggleSelect(): void;
  onChange(text: string): void;
  onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void;
  onPaste(event: ClipboardEvent<HTMLTextAreaElement>): void;
  onAction(action: LineAction): void;
  onUnstrike(): void;
}

export function LineRow({
  line,
  index,
  today,
  placeholder,
  actions,
  selecting,
  selected,
  textareaRef,
  onToggleSelect,
  onChange,
  onKeyDown,
  onPaste,
  onAction,
  onUnstrike,
}: LineRowProps) {
  const t = useTranslations("BrainDump");
  const reduce = useReducedMotion();
  const tagText = useTagText();
  const sorted = Boolean(line.sortedTo || line.struck);
  const blank = line.text.trim() === "";
  const kind = lineKind(line.text);
  const own = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow: one row per wrapped line, no scrollbar.
  useLayoutEffect(() => {
    const element = own.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [line.text, sorted]);

  const setRef = (element: HTMLTextAreaElement | null) => {
    own.current = element;
    textareaRef(element);
  };

  const select = selecting && !blank && (
    <TaskCheck
      look={selected ? "selected" : "unselected"}
      role="checkbox"
      aria-checked={selected}
      aria-label={`${t("footer.selectLine")} · ${line.text}`}
      onClick={onToggleSelect}
      className="mt-1.5"
    />
  );

  if (sorted) {
    const href = tagHref(line);
    const label = tagText(line, today);
    const tagClass = "inline-flex min-h-7 items-center gap-1 rounded-pill bg-scope-soft px-2.5 align-middle text-xs font-bold text-scope-deep";
    const tagBody = (
      <>
        {!line.struck && <Icon icon={ArrowRight} mirror size={12} />}
        {label}
      </>
    );
    return (
      <div data-line={line.id} data-sorted={line.sortedTo ?? "struck"} className="flex items-start gap-2 rounded-[20px] px-3 py-1">
        {select}
        <p dir="auto" className={cn(textClass, "min-w-0 flex-1 text-fg-muted", line.struck && "line-through")}>
          <span className="me-2">{line.text}</span>
          <motion.span
            key={label}
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="inline-block no-underline [text-decoration:none]"
          >
            {line.struck ? (
              <button type="button" className={cn(tagClass, "bg-subtle text-fg-secondary")} aria-label={t("tag.unstrike")} onClick={onUnstrike}>
                {tagBody}
              </button>
            ) : href ? (
              <Link href={href} className={tagClass} aria-label={t("tag.open", { target: label })}>
                {tagBody}
              </Link>
            ) : (
              <span className={tagClass}>{tagBody}</span>
            )}
          </motion.span>
        </p>
      </div>
    );
  }

  return (
    <div
      data-line={line.id}
      className={cn(
        "group flex flex-col gap-2 rounded-[20px] px-3 py-1 ring-primary transition-shadow duration-150 motion-reduce:transition-none",
        !blank && "focus-within:ring-[1.5px] focus-within:py-2.5",
      )}
    >
      <div className="flex items-start gap-2">
        {select}
        {kind === "todo" || kind === "done" ? (
          <TaskCheck
            look={kind === "done" ? "done" : "open"}
            role="checkbox"
            aria-checked={kind === "done"}
            aria-label={kind === "done" ? t("todo.uncheck") : t("todo.check")}
            onClick={() => onChange(toggleTodo(line.text))}
            className="mt-1.5"
          />
        ) : null}
        <textarea
          ref={setRef}
          rows={1}
          dir="auto"
          value={line.text}
          placeholder={placeholder}
          aria-label={t("page.line", { index: index + 1 })}
          spellCheck
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className={cn(
            textClass,
            "min-w-0 flex-1 resize-none overflow-hidden bg-transparent outline-none focus-visible:outline-none placeholder:text-fg-muted",
            kind === "bullet" && "ps-1",
            kind === "done" && "text-fg-muted line-through",
          )}
        />
      </div>
      {!blank && !selecting ? (
        <div role="toolbar" aria-label={t("actions.label")} className="hidden flex-wrap items-center gap-1.5 group-hover:flex group-focus-within:flex">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(action)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border-[1.5px] border-outline px-3 text-xs font-bold text-fg hover:bg-subtle"
            >
              <Icon icon={LINE_ACTION_ICON[action]} size={14} />
              {t(`actions.${action}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
