import { newIdempotencyKey, typedAs, type ApiClient, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-personal";
import { parseDay } from "@/lib/dates/clock-time";
import type { BrainDumpDestination, BrainDumpLine, BrainDumpPage, BrainDumpPageSummary } from "../domain";
import type { BrainDumpRepository, BrainDumpSnapshot, InboxRepository } from "../repositories";
import { invalid, mapErrors } from "./api-shared";

/*
 * Brain Dump (P08) over /brain-dump/pages/{day} (B3): one persisted page per day,
 * ordered lines, sort tags, strike, send to Inbox, remove / restore.
 * - The server keeps a line's destination as `targetId`: a TASK sort's task, an
 *   INBOX send's capture. Note / journal / event sorts are tags only (the UI's
 *   own later step), exactly as in Mock Mode.
 * - "Send to Inbox" creates the real capture server-side. Unsort and restore do
 *   not drop it there, so the adapter drops it through the live Inbox (archive),
 *   which is what the seam promises.
 * - Clear page has no single operation: send (when asked) + remove, one snapshot.
 * Never served from mock data.
 */

type Api = ResponseDataIn<paths, "/api/v1/brain-dump/pages/{period}", "get">;
type ApiLine = Api["lines"][number];
type ApiRemoved = ResponseDataIn<paths, "/api/v1/brain-dump/pages/{period}/remove", "post">["removed"][number];

const MAX_TEXT = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORT_TO = { task: "TASK", note: "NOTE", journal: "JOURNAL", event: "EVENT" } as const;

const isBlank = (line: { text: string }) => line.text.trim() === "";
const isUnsorted = (line: BrainDumpLine) => !isBlank(line) && !line.sortedTo && !line.struck;

function toLine(dto: ApiLine): BrainDumpLine {
  const line: BrainDumpLine = { id: dto.id, text: dto.text };
  if (dto.sortedTo) line.sortedTo = dto.sortedTo.toLowerCase() as BrainDumpDestination;
  if (dto.sortedDay) line.sortedDay = dto.sortedDay;
  if (dto.targetId && dto.sortedTo === "TASK") line.taskId = dto.targetId;
  if (dto.targetId && dto.sortedTo === "INBOX") line.inboxItemId = dto.targetId;
  if (dto.struck) line.struck = true;
  return line;
}

function toApiLine(line: BrainDumpLine, position: number): ApiRemoved {
  return {
    id: line.id,
    text: line.text,
    sortedTo: line.sortedTo ? (line.sortedTo.toUpperCase() as NonNullable<ApiLine["sortedTo"]>) : null,
    sortedDay: line.sortedDay ?? null,
    targetId: line.taskId ?? line.inboxItemId ?? null,
    struck: line.struck ?? false,
    position,
  };
}

const toPage = (dto: Api): BrainDumpPage => ({ day: dto.day, lines: dto.lines.map(toLine), savedAt: dto.savedAt });

export function createApiBrainDumpRepository(client: ApiClient, deps: { today: () => string; inbox: Pick<InboxRepository, "drop"> }): BrainDumpRepository {
  const api = typedAs<paths>(client);

  function checkDay(day: string): { period: string } {
    if (parseDay(day) === null) invalid(`Bad day "${day}"`);
    return { period: day };
  }

  function checkIds(ids: readonly string[]): string[] {
    for (const id of ids) if (!UUID.test(id)) invalid(`Line id "${id}" is not a server id`);
    return [...ids];
  }

  const read = async (day: string) => (await api.request("get", "/api/v1/brain-dump/pages/{period}", { path: checkDay(day) })).data;

  /** Drops the captures that sends created (archived in the live Inbox); a capture already gone is fine. */
  async function dropCaptures(ids: readonly string[]): Promise<void> {
    for (const id of ids) await deps.inbox.drop(id).catch(() => undefined);
  }

  async function removeLines(day: string, ids: readonly string[], inboxItemIds: string[]) {
    if (ids.length === 0) return { page: toPage(await read(day)), restore: { day, lines: [], positions: [], inboxItemIds } satisfies BrainDumpSnapshot };
    const { data } = await api.request("post", "/api/v1/brain-dump/pages/{period}/remove", { path: checkDay(day), body: { ids: checkIds(ids) } });
    const removed = [...data.removed].sort((a, b) => a.position - b.position);
    const restore: BrainDumpSnapshot = { day, lines: removed.map(toLine), positions: removed.map((line) => line.position), inboxItemIds };
    return { page: toPage(data.page), restore };
  }

  return {
    pages: () =>
      mapErrors(async () => {
        const { data } = await api.request("get", "/api/v1/brain-dump/pages");
        const pages: BrainDumpPageSummary[] = data.items.map((page) => ({ day: page.day, lineCount: page.lineCount, unsortedCount: page.unsortedCount }));
        const today = deps.today();
        if (!pages.some((page) => page.day === today)) pages.push({ day: today, lineCount: 0, unsortedCount: 0 });
        return pages.sort((a, b) => b.day.localeCompare(a.day));
      }),

    page: (day) => mapErrors(async () => toPage(await read(day))),

    save: (day, lines) =>
      mapErrors(async () => {
        const kept = [...lines];
        while (kept.length > 0 && isBlank(kept[kept.length - 1]!)) kept.pop();
        for (const line of kept) if (line.text.length > MAX_TEXT) invalid(`A line holds at most ${MAX_TEXT} characters`);
        checkIds(kept.map((line) => line.id));
        const body = { lines: kept.map((line) => ({ id: line.id, text: line.text })) };
        return toPage((await api.request("put", "/api/v1/brain-dump/pages/{period}", { path: checkDay(day), body })).data);
      }),

    add: (day, text) =>
      mapErrors(async () => {
        const value = text.trim();
        if (!value) invalid("A thought needs text");
        if (value.length > MAX_TEXT) invalid(`A line holds at most ${MAX_TEXT} characters`);
        const { data } = await api.request("post", "/api/v1/brain-dump/pages/{period}/lines", { path: checkDay(day), body: { id: newIdempotencyKey(), text: value } });
        return toLine(data);
      }),

    sort: (day, ids, outcome) =>
      mapErrors(async () => {
        if (outcome.to === "inbox") {
          return toPage((await api.request("post", "/api/v1/brain-dump/pages/{period}/send-to-inbox", { path: checkDay(day), body: { ids: checkIds(ids) } })).data);
        }
        const body = { ids: checkIds(ids), to: SORT_TO[outcome.to], day: outcome.day ?? null, targetId: outcome.taskId ?? null };
        return toPage((await api.request("post", "/api/v1/brain-dump/pages/{period}/sort", { path: checkDay(day), body })).data);
      }),

    strike: (day, ids, struck) =>
      mapErrors(async () => toPage((await api.request("post", "/api/v1/brain-dump/pages/{period}/strike", { path: checkDay(day), body: { ids: checkIds(ids), struck } })).data)),

    unsort: (day, ids) =>
      mapErrors(async () => {
        const before = await read(day);
        const captures = before.lines.filter((line) => ids.includes(line.id) && line.sortedTo === "INBOX" && line.targetId).map((line) => line.targetId!);
        const { data } = await api.request("post", "/api/v1/brain-dump/pages/{period}/unsort", { path: checkDay(day), body: { ids: checkIds(ids) } });
        await dropCaptures(captures);
        return toPage(data);
      }),

    sendToInbox: (day, ids) =>
      mapErrors(async () => toPage((await api.request("post", "/api/v1/brain-dump/pages/{period}/send-to-inbox", { path: checkDay(day), body: { ids: checkIds(ids) } })).data)),

    remove: (day, ids) => mapErrors(() => removeLines(day, ids, [])),

    clear: (day, unsorted) =>
      mapErrors(async () => {
        let page = toPage(await read(day));
        const rest = page.lines.filter(isUnsorted).map((line) => line.id);
        let created: string[] = [];
        if (unsorted === "inbox" && rest.length > 0) {
          page = toPage((await api.request("post", "/api/v1/brain-dump/pages/{period}/send-to-inbox", { path: checkDay(day), body: { ids: checkIds(rest) } })).data);
          created = page.lines.filter((line) => rest.includes(line.id) && line.inboxItemId).map((line) => line.inboxItemId!);
        }
        // "keep" leaves the unsorted lines; the others leave the page (blank lines too).
        const leaving = page.lines.filter((line) => unsorted !== "keep" || !isUnsorted(line)).map((line) => line.id);
        return removeLines(day, leaving, created);
      }),

    restore: (snapshot) =>
      mapErrors(async () => {
        await dropCaptures(snapshot.inboxItemIds);
        const dropped = new Set(snapshot.inboxItemIds);
        const lines = snapshot.lines.map((line, index) => {
          const back: BrainDumpLine = line.inboxItemId && dropped.has(line.inboxItemId) ? { id: line.id, text: line.text } : line;
          return toApiLine(back, snapshot.positions[index] ?? 999);
        });
        checkIds(lines.map((line) => line.id));
        return toPage((await api.request("post", "/api/v1/brain-dump/pages/{period}/restore", { path: checkDay(snapshot.day), body: { lines } })).data);
      }),
  };
}
