"use client";

import { Archive, Check, Inbox, Mic } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { BrainDumpLine, BrainDumpPage, BrainDumpPageSummary } from "@/data/domain";
import { useBrainDumpPage, useBrainDumpPages } from "@/data/queries";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { dayFromParam, usePlannerNow } from "@/features/my-day/my-day-context";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { diffDays, minutesOfInstant } from "@/lib/dates/clock-time";
import { LINE_ACTION_ICON, LineRow, type LineAction } from "./brain-dump-line";
import { ClearPageDialog, ConvertPopover } from "./brain-dump-overlays";
import { isSorted, isUnsorted, lineKind, PAGE_START_MINUTES, pageDayOf, pageStats, parseLine, splitLines } from "./domain/brain-dump";
import { useBrainDumpActions } from "./use-brain-dump-actions";
import { newLineId, useBrainDumpDraft, useOnline } from "./use-brain-dump-draft";

/*
 * P08 · Brain Dump: one continuous page per day (a new one at 04:00), the
 * cursor already in it. No title, type, date or destination fields — ever.
 * Lines are sorted one at a time (hover / focus → action row) or by
 * selection; sorted lines stay, muted, tagged "→ destination". The page is
 * the screen's one signature sheet; its notch holds Voice capture.
 */

const BASE = "/personal/brain-dump";
const ALL_ACTIONS: readonly LineAction[] = ["task", "note", "journal", "event", "inbox", "strike"];

export function BrainDumpScreen() {
  const t = useTranslations("BrainDump");
  const params = useSearchParams();
  const { instant } = usePlannerNow();
  const today = pageDayOf(instant);
  const day = dayFromParam(params.get("date"), today);
  const pages = useBrainDumpPages();
  const page = useBrainDumpPage(day);

  const nav = <PagesNav pages={pages} day={day} today={today} />;

  if (page.isPending || page.isError) {
    return (
      <div data-screen="brain-dump" className="flex min-w-0 flex-col gap-4 lg:gap-4.5">
        <PageHeader breadcrumb={<p className="text-sm font-semibold text-fg-muted">{t("kicker")}</p>} title={t("title")} size="display" />
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-4.5">
          {nav}
          {page.isError ? (
            <UtilityCard role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm text-fg">{t("page.error")}</p>
              <Button size="sm" variant="secondary" onClick={() => void page.refetch()}>
                {t("page.retry")}
              </Button>
            </UtilityCard>
          ) : (
            <div role="status" aria-label={t("page.loading")} className="flex flex-col gap-3 rounded-[28px] bg-surface p-6">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className={cn("h-6 rounded-pill", index % 2 ? "w-2/3" : "w-5/6")} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <PageView key={day} page={page.data} today={today} nav={nav} />;
}

function PageView({ page, today, nav }: { page: BrainDumpPage; today: string; nav: ReactNode }) {
  const t = useTranslations("BrainDump");
  const format = useTasksFormat();
  const settings = usePlannerSettings();
  const openSheet = useOpenSheet();
  const reduce = useReducedMotion();
  const online = useOnline();
  const { day } = page;
  const draft = useBrainDumpDraft(page);
  const actions = useBrainDumpActions({ day, today, draft });
  const { lines, edit } = draft;

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [convertId, setConvertId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; caret: number | "end" } | null>(null);

  const stats = useMemo(() => pageStats(lines), [lines]);
  const lineActions = useMemo(
    () => ALL_ACTIONS.filter((action) => action !== "journal" || isModuleVisible(settings, "journal")),
    [settings],
  );
  const empty = stats.lines === 0;
  const dateText = `${format.weekday(day)} · ${format.dayMonth(day)}`;

  const focusLine = useCallback((id: string, caret: number | "end") => {
    const element = refs.current.get(id);
    if (!element) return false;
    element.focus();
    const position = caret === "end" ? element.value.length : caret;
    element.setSelectionRange(position, position);
    return true;
  }, []);

  // A line inserted or merged gets the caret once it is rendered.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target && focusLine(target.id, target.caret)) pendingFocus.current = null;
  }, [lines, focusLine]);

  // Opening today's page puts the cursor in it (P08 Zero friction).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || day !== today) return;
    opened.current = true;
    const last = [...lines].reverse().find((line) => !isSorted(line));
    if (last) focusLine(last.id, "end");
  }, [day, today, lines, focusLine]);

  const setText = (id: string, text: string) => edit((current) => current.map((line) => (line.id === id ? { ...line, text } : line)));

  const neighbour = (index: number, step: -1 | 1) => {
    for (let at = index + step; at >= 0 && at < lines.length; at += step) if (!isSorted(lines[at]!)) return lines[at]!;
    return null;
  };

  const onKeyDown = (line: BrainDumpLine, index: number, event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const element = event.currentTarget;
    const { selectionStart: start, selectionEnd: end, value } = element;
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const kind = lineKind(value);
      const prefix = kind === "bullet" ? "- " : kind === "todo" || kind === "done" ? "[] " : "";
      // Enter on an empty list item ends the list.
      if (prefix && value.trim() === prefix.trim()) {
        setText(line.id, "");
        return;
      }
      const id = newLineId();
      pendingFocus.current = { id, caret: prefix.length };
      edit((current) =>
        current.flatMap((item) => (item.id === line.id ? [{ ...item, text: value.slice(0, start) }, { id, text: prefix + value.slice(end) }] : [item])),
      );
    } else if (event.key === "Backspace" && start === 0 && end === 0 && index > 0) {
      const previous = lines[index - 1]!;
      if (!isSorted(previous)) {
        event.preventDefault();
        pendingFocus.current = { id: previous.id, caret: previous.text.length };
        edit((current) =>
          current.flatMap((item) => (item.id === previous.id ? [{ ...item, text: item.text + value }] : item.id === line.id ? [] : [item])),
        );
      } else if (value === "") {
        const before = neighbour(index, -1);
        if (!before) return;
        event.preventDefault();
        pendingFocus.current = { id: before.id, caret: "end" };
        edit((current) => current.filter((item) => item.id !== line.id));
      }
    } else if (event.key === "ArrowUp" && start === 0 && end === 0) {
      const target = neighbour(index, -1);
      if (target && focusLine(target.id, "end")) event.preventDefault();
    } else if (event.key === "ArrowDown" && start === value.length) {
      const target = neighbour(index, 1);
      if (target && focusLine(target.id, 0)) event.preventDefault();
    } else if (event.key === "Escape") {
      element.blur();
    }
  };

  const onPaste = (line: BrainDumpLine, event: ClipboardEvent<HTMLTextAreaElement>) => {
    const parts = splitLines(event.clipboardData.getData("text/plain"));
    if (parts.length < 2) return;
    event.preventDefault();
    const { selectionStart: start, selectionEnd: end, value } = event.currentTarget;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const added = parts.slice(1).map((text) => ({ id: newLineId(), text }));
    const last = added[added.length - 1]!;
    pendingFocus.current = { id: last.id, caret: last.text.length };
    last.text += after;
    edit((current) => current.flatMap((item) => (item.id === line.id ? [{ ...item, text: before + parts[0] }, ...added] : [item])));
  };

  const run = (action: LineAction, targets: readonly BrainDumpLine[]) => {
    if (action === "task") {
      if (targets[0]) setConvertId(targets[0].id);
    } else if (action === "inbox") void actions.sendToInbox(targets);
    else if (action === "strike") void actions.strike(targets, true);
    else if (action === "note") void actions.sort(targets, "note");
    else if (action === "journal") void actions.sort(targets, "journal", day);
    // An event lands on the day the line names, else today.
    else void actions.sort(targets, "event", parseLine(targets[0]?.text ?? "", today).date ?? today);
    if (selecting) {
      setSelected(new Set());
      setSelecting(false);
    }
  };

  const selectedLines = lines.filter((line) => selected.has(line.id) && isUnsorted(line));
  const convertLine = lines.find((line) => line.id === convertId) ?? null;

  const statusText = !online
    ? t("status.offline")
    : draft.status === "saving"
      ? t("status.saving")
      : draft.status === "error"
        ? t("status.error")
        : draft.status === "saved" && draft.savedAt
          ? t("status.saved", { time: format.clock(minutesOfInstant(draft.savedAt)) })
          : null;

  return (
    <div data-screen="brain-dump" className="flex min-w-0 flex-col gap-4 lg:gap-4.5">
      <PageHeader
        breadcrumb={<p className="text-sm font-semibold text-fg-muted">{t("kicker")}</p>}
        title={t("title")}
        size="display"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" aria-label={t("status.label")} className={cn("inline-flex min-h-touch items-center rounded-pill bg-surface px-4 text-xs font-semibold text-fg-secondary", !statusText && "sr-only")}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={statusText ?? "none"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex items-center gap-1.5"
                >
                  {draft.status === "saved" && online ? <Check aria-hidden="true" size={14} /> : null}
                  {statusText}
                </motion.span>
              </AnimatePresence>
            </span>
            {stats.unsorted > 0 ? (
              <Button variant="secondary" className="gap-2 bg-surface" onClick={() => void actions.sendToInbox(lines.filter(isUnsorted))}>
                <Inbox aria-hidden="true" size={16} />
                {t("sendRest")}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-4.5">
        {nav}
        <SignatureCard
          as="section"
          aria-label={t("page.label", { date: dateText })}
          action={<SignatureCardAction icon={Mic} label={t("page.voice")} variant="neutral" onClick={() => openSheet("voice")} />}
          contentClassName="flex min-h-[28rem] flex-col gap-2 lg:min-h-[32rem]"
        >
          <SignatureCardHeader>
            <p className="text-xs font-semibold text-fg-muted">{empty ? dateText : t("page.heading", { date: dateText })}</p>
          </SignatureCardHeader>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:px-2">
            <AnimatePresence initial={false}>
              {lines.map((line, index) => {
                const row = (
                  <motion.div
                    key={line.id}
                    layout={reduce ? false : "position"}
                    exit={reduce ? undefined : { opacity: 0, height: 0, transition: { duration: 0.24, ease: "easeOut" } }}
                    className="overflow-hidden"
                  >
                    <LineRow
                      line={line}
                      index={index}
                      today={today}
                      placeholder={empty && index === 0 ? t("page.placeholder") : undefined}
                      actions={lineActions}
                      selecting={selecting}
                      selected={selected.has(line.id)}
                      textareaRef={(element) => {
                        if (element) refs.current.set(line.id, element);
                        else refs.current.delete(line.id);
                      }}
                      onToggleSelect={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(line.id)) next.delete(line.id);
                          else next.add(line.id);
                          return next;
                        })
                      }
                      onChange={(text) => setText(line.id, text)}
                      onKeyDown={(event) => onKeyDown(line, index, event)}
                      onPaste={(event) => onPaste(line, event)}
                      onAction={(action) => run(action, [line])}
                      onUnstrike={() => void actions.strike([line], false)}
                    />
                  </motion.div>
                );
                return convertLine?.id === line.id ? (
                  <ConvertPopover
                    key={line.id}
                    open
                    text={line.text}
                    today={today}
                    onOpenChange={(open) => !open && setConvertId(null)}
                    onCreate={(task) => {
                      setConvertId(null);
                      void actions.convert(line, task);
                    }}
                  >
                    {row}
                  </ConvertPopover>
                ) : (
                  row
                );
              })}
            </AnimatePresence>
          </div>

          {!empty ? (
            <Footer
              selecting={selecting}
              selectedCount={selectedLines.length}
              actions={lineActions.filter((action) => action !== "task")}
              onToggleSelecting={() => {
                setSelecting((current) => !current);
                setSelected(new Set());
              }}
              onBulk={(action) => run(action, selectedLines)}
              onClear={() => setClearOpen(true)}
            />
          ) : null}
        </SignatureCard>
      </div>

      <ClearPageDialog open={clearOpen} stats={stats} onOpenChange={setClearOpen} onClear={(mode) => void actions.clear(mode)} />
    </div>
  );
}

function Footer({
  selecting,
  selectedCount,
  actions,
  onToggleSelecting,
  onBulk,
  onClear,
}: {
  selecting: boolean;
  selectedCount: number;
  actions: readonly LineAction[];
  onToggleSelecting(): void;
  onBulk(action: LineAction): void;
  onClear(): void;
}) {
  const t = useTranslations("BrainDump");
  const format = useTasksFormat();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
      <Button variant="outline" size="sm" className="gap-1.5" aria-pressed={selecting} onClick={onToggleSelecting}>
        <Check aria-hidden="true" size={14} />
        {selecting ? t("footer.doneSelecting") : t("footer.select")}
      </Button>
      {selecting ? (
        <>
          <span role="status" className="text-xs font-semibold text-fg-secondary">
            {t("footer.selected", { count: selectedCount, countText: format.number(selectedCount) })}
          </span>
          <div role="toolbar" aria-label={t("actions.bulkLabel")} className="flex flex-wrap items-center gap-1.5">
            {actions.map((action) => (
              <Button key={action} variant="secondary" size="sm" className="gap-1.5" disabled={selectedCount === 0} onClick={() => onBulk(action)}>
                <Icon icon={LINE_ACTION_ICON[action]} size={14} />
                {t(`actions.${action}`)}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onClear}>
            <Archive aria-hidden="true" size={14} />
            {t("footer.clear")}
          </Button>
          <p className="ms-auto text-xs text-fg-muted max-md:hidden">{t("footer.hint")}</p>
        </>
      )}
    </div>
  );
}

function PagesNav({ pages, day, today }: { pages: ReturnType<typeof useBrainDumpPages>; day: string; today: string }) {
  const t = useTranslations("BrainDump");
  const format = useTasksFormat();
  const list: BrainDumpPageSummary[] = pages.data ?? [];

  const title = (page: BrainDumpPageSummary) => {
    const offset = diffDays(today, page.day);
    if (offset === 0) return t("pages.today");
    if (offset === -1) return t("pages.yesterday");
    return `${format.weekdayShort(page.day)} ${format.dayMonth(page.day)}`;
  };
  const detail = (page: BrainDumpPageSummary) => {
    const count = (n: number) => ({ count: n, countText: format.number(n) });
    const parts = [t("pages.lines", count(page.lineCount))];
    const sorted = page.lineCount - page.unsortedCount;
    if (page.lineCount > 0 && page.unsortedCount === 0) parts.push(t("pages.allSorted"));
    else if (page.day === today && sorted > 0) parts.push(t("pages.sorted", count(sorted)));
    else if (sorted > 0) parts.push(t("pages.left", count(page.unsortedCount)));
    return parts.join(" · ");
  };

  return (
    <nav aria-label={t("pages.label")} className="min-w-0">
    <UtilityCard className="flex min-w-0 flex-col gap-3">
      {pages.isPending ? (
        <div role="status" aria-label={t("pages.loading")} className="flex gap-2 lg:flex-col">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-40 rounded-[18px] lg:w-full" />
          ))}
        </div>
      ) : pages.isError ? (
        <p role="alert" className="px-2 text-sm text-fg">
          {t("pages.error")}
        </p>
      ) : (
        <ul className="flex gap-1.5 overflow-x-auto max-lg:-mx-1 max-lg:px-1 lg:flex-col">
          {list.map((page) => {
            const active = page.day === day;
            const badge = page.day !== today && page.unsortedCount > 0;
            return (
              <li key={page.day} className="shrink-0">
                <Link
                  href={page.day === today ? BASE : `${BASE}?date=${page.day}`}
                  aria-current={active ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "flex min-h-touch items-center gap-3 rounded-[18px] px-3 py-2 text-start transition-colors motion-reduce:transition-none",
                    active ? "bg-surface ring-[1.5px] ring-primary" : "hover:bg-subtle",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold whitespace-nowrap text-fg">{title(page)}</span>
                    <span className="block text-xs whitespace-nowrap text-fg-muted">{detail(page)}</span>
                  </span>
                  {badge ? (
                    <span className="inline-flex min-w-6 items-center justify-center rounded-pill bg-subtle px-2 text-xs font-bold text-fg-secondary tabular">
                      <span aria-hidden="true">{format.number(page.unsortedCount)}</span>
                      <span className="sr-only">{t("pages.unsortedBadge", { count: page.unsortedCount, countText: format.number(page.unsortedCount) })}</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-2 text-xs text-fg-muted max-lg:hidden">{t("pages.note", { time: format.clock(PAGE_START_MINUTES) })}</p>
    </UtilityCard>
    </nav>
  );
}
