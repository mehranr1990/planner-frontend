import { parseDay } from "@/lib/dates/clock-time";
import type { BrainDumpLine, BrainDumpPage, BrainDumpPageSummary, InboxItem } from "../domain";
import { RepositoryError, type BrainDumpRepository, type BrainDumpSnapshot } from "../repositories";

/*
 * The Brain Dump part of the mock adapter: one page per day in memory.
 * "Send to Inbox" and its Undo reach the Inbox store through the two
 * callbacks the main adapter passes, so both stores stay one source.
 */

export interface MockBrainDumpOptions {
  pages: readonly BrainDumpPage[];
  today: string;
  now: string;
  /** Captures an untriaged Inbox item (source "brain-dump") in the Inbox store. */
  captureInbox(text: string): InboxItem;
  /** Drops an Inbox item (Undo of a send). Unknown ids are ignored. */
  dropInbox(id: string): void;
  respond<T>(value: T): Promise<T>;
}

const SORT_FIELDS = ["sortedTo", "sortedDay", "taskId", "inboxItemId", "struck"] as const;

function isBlank(line: BrainDumpLine): boolean {
  return line.text.trim() === "";
}

function isUnsorted(line: BrainDumpLine): boolean {
  return !isBlank(line) && !line.sortedTo && !line.struck;
}

function clearSort(line: BrainDumpLine): void {
  for (const field of SORT_FIELDS) delete line[field];
}

export function createMockBrainDump({ pages: seed, today, now, captureInbox, dropInbox, respond }: MockBrainDumpOptions): BrainDumpRepository {
  const pages = new Map<string, BrainDumpPage>(structuredClone([...seed]).map((page) => [page.day, page]));
  let counter = 0;

  function checkDay(day: string): void {
    if (parseDay(day) === null) throw new RepositoryError("invalid", `Bad day "${day}"`);
  }

  function pageFor(day: string): BrainDumpPage {
    checkDay(day);
    let page = pages.get(day);
    if (!page) {
      page = { day, lines: [], savedAt: null };
      pages.set(day, page);
    }
    return page;
  }

  function linesOrThrow(page: BrainDumpPage, ids: readonly string[]): BrainDumpLine[] {
    return ids.map((id) => {
      const line = page.lines.find((item) => item.id === id);
      if (!line) throw new RepositoryError("not-found", `No line "${id}" on ${page.day}`);
      return line;
    });
  }

  function nextId(page: BrainDumpPage): string {
    let id: string;
    do {
      counter += 1;
      id = `bd-new-${counter}`;
    } while (page.lines.some((line) => line.id === id));
    return id;
  }

  function trimTrailing(page: BrainDumpPage): void {
    while (page.lines.length > 0 && isBlank(page.lines[page.lines.length - 1]!)) page.lines.pop();
  }

  /** Takes lines off the page, remembering where they were. */
  function take(page: BrainDumpPage, ids: ReadonlySet<string>, inboxItemIds: string[] = []): BrainDumpSnapshot {
    const snapshot: BrainDumpSnapshot = { day: page.day, lines: [], positions: [], inboxItemIds };
    page.lines.forEach((line, index) => {
      if (!ids.has(line.id)) return;
      snapshot.lines.push(structuredClone(line));
      snapshot.positions.push(index);
    });
    page.lines = page.lines.filter((line) => !ids.has(line.id));
    return snapshot;
  }

  function send(page: BrainDumpPage, lines: readonly BrainDumpLine[]): string[] {
    const created: string[] = [];
    for (const line of lines) {
      if (isBlank(line)) continue;
      const item = captureInbox(line.text);
      clearSort(line);
      line.sortedTo = "inbox";
      line.inboxItemId = item.id;
      created.push(item.id);
    }
    page.savedAt = now;
    return created;
  }

  return {
    pages() {
      const summaries: BrainDumpPageSummary[] = [...pages.values()]
        .filter((page) => page.day === today || page.lines.some((line) => !isBlank(line)))
        .map((page) => ({
          day: page.day,
          lineCount: page.lines.filter((line) => !isBlank(line)).length,
          unsortedCount: page.lines.filter(isUnsorted).length,
        }));
      if (!summaries.some((page) => page.day === today)) summaries.push({ day: today, lineCount: 0, unsortedCount: 0 });
      return respond(summaries.sort((a, b) => b.day.localeCompare(a.day)));
    },
    async page(day) {
      checkDay(day);
      return respond(pages.get(day) ?? { day, lines: [], savedAt: null });
    },
    async save(day, input) {
      const page = pageFor(day);
      const ids = new Set<string>();
      for (const line of input) {
        if (!line.id || ids.has(line.id)) throw new RepositoryError("invalid", `Line ids must be unique and set ("${line.id}")`);
        ids.add(line.id);
      }
      const known = new Map(page.lines.map((line) => [line.id, line]));
      page.lines = input.map(({ id, text }) => ({ ...(known.get(id) ?? {}), id, text }));
      trimTrailing(page);
      page.savedAt = now;
      return respond(page);
    },
    async add(day, text) {
      if (text.trim() === "") throw new RepositoryError("invalid", "A thought needs text");
      const page = pageFor(day);
      trimTrailing(page);
      const line: BrainDumpLine = { id: nextId(page), text: text.trim() };
      page.lines.push(line);
      page.savedAt = now;
      return respond(line);
    },
    async sort(day, ids, { to, day: target, taskId }) {
      const page = pageFor(day);
      if (target != null) checkDay(target);
      const lines = linesOrThrow(page, ids);
      if (to === "inbox") {
        send(page, lines);
        return respond(page);
      }
      for (const line of lines) {
        clearSort(line);
        line.sortedTo = to;
        if (target) line.sortedDay = target;
        if (taskId && to === "task") line.taskId = taskId;
      }
      page.savedAt = now;
      return respond(page);
    },
    async strike(day, ids, struck) {
      const page = pageFor(day);
      for (const line of linesOrThrow(page, ids)) {
        clearSort(line);
        if (struck) line.struck = true;
      }
      page.savedAt = now;
      return respond(page);
    },
    async unsort(day, ids) {
      const page = pageFor(day);
      for (const line of linesOrThrow(page, ids)) {
        if (line.inboxItemId) dropInbox(line.inboxItemId);
        clearSort(line);
      }
      page.savedAt = now;
      return respond(page);
    },
    async sendToInbox(day, ids) {
      const page = pageFor(day);
      send(page, linesOrThrow(page, ids));
      return respond(page);
    },
    async remove(day, ids) {
      const page = pageFor(day);
      linesOrThrow(page, ids);
      const restore = take(page, new Set(ids));
      page.savedAt = now;
      return respond({ page, restore });
    },
    async clear(day, unsorted) {
      const page = pageFor(day);
      const rest = page.lines.filter(isUnsorted);
      const created = unsorted === "inbox" ? send(page, rest) : [];
      // "keep" leaves the unsorted lines (closed up: the blank lines between go too).
      const leaving = page.lines.filter((line) => unsorted !== "keep" || !isUnsorted(line));
      const restore = take(page, new Set(leaving.map((line) => line.id)), created);
      page.savedAt = now;
      return respond({ page, restore });
    },
    async restore(snapshot) {
      const page = pageFor(snapshot.day);
      for (const id of snapshot.inboxItemIds) dropInbox(id);
      const dropped = new Set(snapshot.inboxItemIds);
      snapshot.lines.forEach((line, index) => {
        if (page.lines.some((item) => item.id === line.id)) return;
        const back = structuredClone(line);
        if (back.inboxItemId && dropped.has(back.inboxItemId)) clearSort(back);
        page.lines.splice(Math.min(snapshot.positions[index] ?? page.lines.length, page.lines.length), 0, back);
      });
      page.savedAt = now;
      return respond(page);
    },
  };
}
