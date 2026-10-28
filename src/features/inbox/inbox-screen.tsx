"use client";

import { Archive, CheckSquare, ChevronDown, Clock, ListChecks, Mic, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Direction } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button, IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PillGroup } from "@/components/ui/pills";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { InboxItem, InboxSource } from "@/data/domain";
import { useCaptureInbox, useInboxCount, useInboxItems } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { isModuleVisible } from "@/features/planner-settings/planner-settings";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { TaskCheck } from "@/features/tasks/list/task-parts";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { cn } from "@/lib/cn";
import { groupInbox, oldestAgeDays, suggestFor, summarize, TARGET_KEYS, type InboxTarget, type ProcessOutcome } from "./domain/inbox";
import { InboxRow } from "./inbox-row";
import { InboxDone, ProcessCard } from "./process-card";
import { SnoozeMenu } from "./snooze-menu";
import { useInboxActions } from "./use-inbox-actions";

/*
 * P07 · Inbox: captured items waiting for a decision. Desktop shows both
 * modes side by side — the triage list (row actions, multi-select, capture
 * field) and the Process card walking items 1 of N. Phones stack the
 * Process card above the list. Tabs (filled pills, a local view filter):
 * Triage · Snoozed · Archived, in ?tab=. Keyboard on the triage view:
 * T E N J R B destinations · S snooze · A archive · ⌫ drop · ↵ accept the
 * suggestion · → skip (← in RTL).
 */

type Tab = "untriaged" | "snoozed" | "archived";
const TABS: readonly Tab[] = ["untriaged", "snoozed", "archived"];
const SOURCES: readonly InboxSource[] = ["quick-add", "voice", "share", "note", "brain-dump"];

function isTab(value: string | null): value is Tab {
  return value !== null && (TABS as readonly string[]).includes(value);
}

/** Keys from a text field, a menu, a dialog or a radio group are theirs, not the inbox's. */
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  return target.closest('[role="dialog"],[role="menu"],[role="listbox"],[role="radiogroup"],[role="tablist"],[role="toolbar"]') !== null;
}

export function InboxScreen() {
  const t = useTranslations("Inbox");
  const format = useTasksFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "untriaged";
  const { day: today } = usePlannerNow();
  const settings = usePlannerSettings();
  const direction = Direction.useDirection();
  const reduce = useReducedMotion();

  const items = useInboxItems(tab);
  const snoozed = useInboxItems("snoozed");
  const count = useInboxCount();

  const [source, setSource] = useState<InboxSource | "all">("all");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, ProcessOutcome>>(() => new Map());
  const [exits, setExits] = useState<ReadonlyMap<string, "collapse" | "fly">>(() => new Map());

  const onOutcome = useCallback((ids: readonly string[], outcome: ProcessOutcome) => {
    setOutcomes((current) => {
      const next = new Map(current);
      for (const id of ids) next.set(id, outcome);
      return next;
    });
  }, []);
  const onUndo = useCallback((ids: readonly string[]) => {
    setOutcomes((current) => {
      const next = new Map(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);
  const actions = useInboxActions({ today, onOutcome, onUndo });

  const all = useMemo(() => items.data ?? [], [items.data]);
  const visible = useMemo(() => (source === "all" ? all : all.filter((item) => item.source === source)), [all, source]);
  const groups = useMemo(() => groupInbox(visible, today), [visible, today]);
  const ordered = useMemo(() => [...groups.today, ...groups.earlier], [groups]);
  const current = tab === "untriaged" ? (ordered.find((item) => item.id === currentId) ?? ordered[0] ?? null) : null;
  const currentIndex = current ? ordered.indexOf(current) : -1;
  const suggestion = useMemo(() => (current ? suggestFor(current, today) : null), [current, today]);
  const selectedItems = ordered.filter((item) => selected.has(item.id));

  const setTab = (next: Tab) => {
    const query = new URLSearchParams(params.toString());
    if (next === "untriaged") query.delete("tab");
    else query.set("tab", next);
    const search = query.toString();
    setSelected(new Set());
    setSelecting(false);
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  /** Before an item leaves, point the Process card at its neighbour. */
  const advanceFrom = useCallback(
    (ids: readonly string[], how: "collapse" | "fly") => {
      setExits((currentExits) => {
        const next = new Map(currentExits);
        for (const id of ids) next.set(id, how);
        return next;
      });
      if (current && ids.includes(current.id)) {
        const rest = ordered.filter((item) => !ids.includes(item.id));
        const after = ordered.slice(currentIndex + 1).find((item) => !ids.includes(item.id));
        setCurrentId(after?.id ?? rest[0]?.id ?? null);
      }
      setSelected((currentSelected) => new Set([...currentSelected].filter((id) => !ids.includes(id))));
    },
    [current, currentIndex, ordered],
  );

  const send = useCallback(
    (list: readonly InboxItem[], target: InboxTarget) => {
      advanceFrom(list.map((item) => item.id), "fly");
      void actions.send(list, target);
    },
    [actions, advanceFrom],
  );
  const snooze = useCallback(
    (list: readonly InboxItem[], until: string) => {
      advanceFrom(list.map((item) => item.id), "fly");
      void actions.snooze(list, until);
    },
    [actions, advanceFrom],
  );
  const archive = useCallback(
    (list: readonly InboxItem[]) => {
      advanceFrom(list.map((item) => item.id), "collapse");
      void actions.archive(list);
    },
    [actions, advanceFrom],
  );
  const drop = useCallback(
    (item: InboxItem) => {
      advanceFrom([item.id], "collapse");
      void actions.drop(item);
    },
    [actions, advanceFrom],
  );
  const skip = useCallback(() => {
    if (ordered.length === 0) return;
    setCurrentId(ordered[(currentIndex + 1) % ordered.length]!.id);
  }, [ordered, currentIndex]);

  // Keyboard (P07): only on the triage view, never while typing or in a menu.
  useEffect(() => {
    if (tab !== "untriaged" || !current || !suggestion) return;
    const skipKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || ownsKeys(event.target)) return;
      const key = event.key.toLowerCase();
      const target = (Object.keys(TARGET_KEYS) as InboxTarget[]).find((name) => TARGET_KEYS[name] === key);
      const onButton = event.target instanceof HTMLElement && event.target.closest("button,a") !== null;
      if (target && !current.transcriptFailed) {
        if (target !== "brain-dump" || isModuleVisible(settings, "braindump")) send([current], target);
      }
      else if (key === "s") setSnoozeOpen(true);
      else if (key === "a") archive([current]);
      else if (event.key === "Backspace" || event.key === "Delete") drop(current);
      else if (event.key === "Enter" && !onButton && suggestion.target && !current.transcriptFailed) send([current], suggestion.target);
      else if (event.key === skipKey && !onButton) skip();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab, current, suggestion, direction, send, archive, drop, skip, settings]);

  const untriagedCount = count.data ?? 0;
  const snoozedCount = snoozed.data?.length ?? 0;
  const summary = t("summary", {
    count: untriagedCount,
    countText: format.number(untriagedCount),
    days: tab === "untriaged" ? oldestAgeDays(all, today) : 0,
    daysText: format.number(oldestAgeDays(all, today)),
  });
  const triageDone = tab === "untriaged" && items.isSuccess && all.length === 0;
  const finished = triageDone && outcomes.size > 0 ? summarize([...outcomes.values()]) : null;

  const rowProps = (item: InboxItem) => ({
    item,
    today,
    target: suggestFor(item, today).target,
    current: current?.id === item.id,
    selecting,
    selected: selected.has(item.id),
    mode: tab === "untriaged" ? ("triage" as const) : tab === "snoozed" ? ("snoozed" as const) : ("archived" as const),
    exit: exits.get(item.id),
    onOpen: () => setCurrentId(item.id),
    onToggleSelect: () =>
      setSelected((currentSelected) => {
        const next = new Set(currentSelected);
        if (!next.delete(item.id)) next.add(item.id);
        return next;
      }),
    onSend: (target: InboxTarget) => send([item], target),
    onSnooze: (until: string) => snooze([item], until),
    onArchive: () => archive([item]),
    onRestore: () => {
      advanceFrom([item.id], "collapse");
      void actions.restore([item]);
    },
  });

  const group = (label: string, list: readonly InboxItem[]) =>
    list.length > 0 ? (
      <section aria-label={label} className="flex flex-col gap-1">
        <h3 className="px-2 pt-2 text-xs font-bold text-fg-muted">{label}</h3>
        <ul className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {list.map((item) => (
              <InboxRow key={item.id} {...rowProps(item)} />
            ))}
          </AnimatePresence>
        </ul>
      </section>
    ) : null;

  const listTitle = tab === "untriaged" ? t("list.toTriage") : tab === "snoozed" ? t("list.snoozed") : t("list.archived");

  return (
    <div data-screen="inbox" className="flex min-w-0 flex-col gap-4 lg:gap-4.5">
      <PageHeader
        breadcrumb={<p className="text-sm font-semibold text-fg-muted">{t("kicker")}</p>}
        title={t("title")}
        size="display"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-touch items-center rounded-pill bg-surface px-4 text-xs font-semibold text-fg-secondary max-sm:hidden">
              {summary}
            </span>
            <PillGroup
              label={t("tabsLabel")}
              variant="filled"
              value={tab}
              onValueChange={setTab}
              options={[
                { value: "untriaged", label: t("tabs.untriaged") },
                { value: "snoozed", label: t("tabs.snoozed"), count: snoozedCount || undefined },
                { value: "archived", label: t("tabs.archived") },
              ]}
            />
          </div>
        }
      />

      <div className={cn("grid min-w-0 items-start gap-4 lg:gap-4.5", tab === "untriaged" && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        <ProductCard as="section" aria-labelledby="inbox-list-title" className="order-2 flex min-w-0 flex-col gap-2 lg:order-1">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <h2 id="inbox-list-title" className="me-auto text-lg font-bold text-fg">
              {listTitle} <span className="text-sm font-semibold text-fg-muted tabular">{format.number(visible.length)}</span>
            </h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1" aria-label={t("list.sourceFilter")}>
                  {source === "all" ? t("list.allSources") : t(`source.${source}`)}
                  <ChevronDown aria-hidden="true" size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={source} onValueChange={(value) => setSource(value as InboxSource | "all")}>
                  <DropdownMenuRadioItem value="all">{t("list.allSources")}</DropdownMenuRadioItem>
                  {SOURCES.map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {t(`source.${key}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {tab === "untriaged" ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting((on) => !on);
                  setSelected(new Set());
                }}
              >
                <ListChecks aria-hidden="true" size={14} />
                {selecting ? t("list.doneSelecting") : t("list.select")}
              </Button>
            ) : null}
          </div>

          {items.isPending ? (
            <div role="status" aria-label={t("list.loading")} className="flex flex-col gap-2 p-1">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-16 rounded-[22px]" />
              ))}
            </div>
          ) : items.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 p-3">
              <p className="text-sm text-fg">{t("list.error")}</p>
              <Button variant="secondary" size="sm" onClick={() => void items.refetch()}>
                {t("list.retry")}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <p className="px-3 py-6 text-sm text-fg-muted">
              {all.length > 0 ? t("list.emptyFiltered") : tab === "snoozed" ? t("list.emptySnoozed") : tab === "archived" ? t("list.emptyArchived") : t("zero.body")}
            </p>
          ) : tab === "untriaged" ? (
            <>
              {group(t("list.today"), groups.today)}
              {group(t("list.earlier"), groups.earlier)}
            </>
          ) : (
            group(listTitle, ordered)
          )}

          {tab === "untriaged" ? <CaptureField /> : null}
        </ProductCard>

        {tab === "untriaged" ? (
          <div className="order-1 grid min-w-0 lg:order-2 lg:sticky lg:top-4">
            {current && suggestion ? (
              <ProcessCard
                item={current}
                index={currentIndex}
                total={ordered.length}
                today={today}
                suggestion={suggestion}
                snoozeOpen={snoozeOpen}
                onSnoozeOpenChange={setSnoozeOpen}
                onSend={(target) => send([current], target)}
                onSnooze={(until) => snooze([current], until)}
                onArchive={() => archive([current])}
                onDrop={() => drop(current)}
                onSkip={skip}
                onRetry={() => void items.refetch()}
              />
            ) : triageDone ? (
              <InboxDone summary={finished} showBrainDump={isModuleVisible(settings, "braindump")} />
            ) : null}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {selecting && selectedItems.length > 0 ? (
          <motion.div
            key="inbox-bulk"
            initial={reduce ? false : { y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none fixed inset-x-4 bottom-[calc(6.75rem+var(--safe-bottom))] z-(--z-shell) flex justify-center lg:bottom-6"
          >
            <div
              role="toolbar"
              aria-label={t("bulk.toolbar")}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSelected(new Set());
              }}
              className="pointer-events-auto flex min-h-[54px] max-w-full items-center gap-2 rounded-pill bg-surface ps-3.5 pe-2 shadow-elevated ring-[1.5px] ring-primary lg:min-h-15"
            >
              <TaskCheck look="selected" tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
              <span role="status" className="text-sm font-bold whitespace-nowrap text-fg">
                {t("bulk.selected", { count: format.number(selectedItems.length) })}
              </span>
              <div className="flex items-center gap-1.5 rounded-pill bg-canvas p-1">
                <Button variant="secondary" size="sm" className="gap-1.5 bg-surface px-3" onClick={() => send(selectedItems, "task")}>
                  <CheckSquare aria-hidden="true" size={14} />
                  {t("bulk.toTasks")}
                </Button>
                <SnoozeMenu
                  onSnooze={(until) => snooze(selectedItems, until)}
                  trigger={
                    <Button variant="secondary" size="sm" className="gap-1.5 bg-surface px-3">
                      <Clock aria-hidden="true" size={14} />
                      {t("bulk.snooze")}
                    </Button>
                  }
                />
                <Button variant="secondary" size="sm" className="gap-1.5 bg-surface px-3" onClick={() => archive(selectedItems)}>
                  <Archive aria-hidden="true" size={14} />
                  {t("bulk.archive")}
                </Button>
              </div>
              <IconButton icon={X} label={t("bulk.clear")} variant="ghost" size="sm" onClick={() => setSelected(new Set())} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** "Capture anything… it lands here": a new untriaged Quick-add item; the mic opens voice capture. */
function CaptureField() {
  const t = useTranslations("Inbox.capture");
  const capture = useCaptureInbox();
  const openSheet = useOpenSheet();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    capture.mutate(
      { text: value, source: "quick-add" },
      {
        onSuccess: () => {
          setText("");
          toast({ tone: "neutral", title: t("added") });
          inputRef.current?.focus();
        },
        onError: () => toast({ tone: "danger", title: t("failed") }),
      },
    );
  };

  return (
    <form onSubmit={submit} className="mt-2 flex min-h-13 items-center gap-2 rounded-pill bg-subtle ps-4 pe-1.5">
      <Plus aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
      <input
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label={t("label")}
        placeholder={t("placeholder")}
        dir="auto"
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
      />
      {text.trim() ? (
        <Button type="submit" size="sm" loading={capture.isPending}>
          {t("add")}
        </Button>
      ) : (
        <IconButton icon={Mic} label={t("voice")} variant="ghost" size="sm" onClick={() => openSheet("voice")} />
      )}
    </form>
  );
}
