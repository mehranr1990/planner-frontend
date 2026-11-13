import type { ApiClient, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import type { InboxDestination, InboxItem, InboxSource, InboxState } from "../domain";
import type { InboxRepository } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";

/*
 * Inbox (Phase 09) over /capture: untriaged = INBOX, archived = ARCHIVED,
 * processed = TRIAGED (read only: a server-side conversion).
 * - The UI creates the destination itself (a task, a journal line…) and then
 *   marks the item; the API's own triage would create a second target, so
 *   "processed" and "dropped" are stored as ARCHIVED (the API has no delete)
 *   and remembered as such for this page only: after a reload they are listed
 *   as archived. Undo restores them (archive:false).
 * - Snooze has no API state: refused, and "snoozed" is always empty.
 * - A capture's API type is a kind, not an origin: quick notes are NOTE, the
 *   rest DRAFT; other origins (voice, share, brain-dump) are remembered for
 *   this page only.
 */

type ApiCapture = ResponseData<"/api/v1/capture/{id}", "get">;
type Mark = { state: "processed" | "dropped"; processedTo?: InboxItem["processedTo"]; taskId?: string };

const PAGE = "100";
const MAX_TEXT = 50_000;
const SUGGESTED: Partial<Record<ApiCapture["type"], InboxDestination>> = { TASK: "task", NOTE: "note", JOURNAL: "journal" };

export function createApiInboxRepository(client: ApiClient): InboxRepository {
  const known = new Map<string, ApiCapture>();
  const sources = new Map<string, InboxSource>();
  const marks = new Map<string, Mark>();

  const remember = (dto: ApiCapture) => {
    known.set(dto.id, dto);
    return dto;
  };

  function toItem(dto: ApiCapture): InboxItem {
    const mark = dto.state === "ARCHIVED" ? marks.get(dto.id) : undefined;
    const item: InboxItem = {
      id: dto.id,
      text: dto.text,
      source: sources.get(dto.id) ?? (dto.type === "VOICE_MEMO" ? "voice" : dto.type === "NOTE" ? "note" : "quick-add"),
      capturedAt: dto.createdAt,
      state: dto.state === "INBOX" ? "untriaged" : dto.state === "TRIAGED" ? "processed" : (mark?.state ?? "archived"),
    };
    if (dto.state === "INBOX" && SUGGESTED[dto.type]) item.suggested = SUGGESTED[dto.type];
    if (dto.state === "TRIAGED") {
      const to = dto.targetTaskId ? "task" : dto.targetNoteId ? "note" : dto.targetJournalId ? "journal" : undefined;
      if (to) item.processedTo = to;
      if (dto.targetTaskId) item.taskId = dto.targetTaskId;
    }
    if (mark?.processedTo) item.processedTo = mark.processedTo;
    if (mark?.taskId) item.taskId = mark.taskId;
    return item;
  }

  async function fetchState(state: ApiCapture["state"]): Promise<InboxItem[]> {
    const dtos = await pageAll(async (cursor) => (await client.request("get", "/api/v1/capture", { query: { limit: PAGE, cursor, state } })).data);
    return dtos.map(remember).map(toItem);
  }

  const reload = async (id: string) => remember((await client.request("get", "/api/v1/capture/{id}", { path: { id } })).data);

  /** Archives or restores one capture; already there → no request. A converted capture is final. */
  async function setArchived(id: string, archive: boolean): Promise<ApiCapture> {
    return mapErrors(async () => {
      if (!known.has(id)) await reload(id);
      return retryOnConflict(
        async () => {
          const dto = known.get(id)!;
          if (dto.state === "TRIAGED") unsupported("A converted capture cannot change");
          if ((dto.state === "ARCHIVED") === archive) return dto;
          return remember((await client.request("patch", "/api/v1/capture/{id}", { path: { id }, header: { "If-Match": revisionTag(dto.revision) }, body: { archive } })).data);
        },
        () => reload(id),
      );
    });
  }

  async function mark(id: string, value: Mark): Promise<InboxItem> {
    const dto = await setArchived(id, true);
    marks.set(id, value);
    return toItem(dto);
  }

  return {
    async list(state?: InboxState) {
      const wanted: ApiCapture["state"][] = state === undefined ? ["INBOX", "ARCHIVED"] : state === "untriaged" ? ["INBOX"] : state === "archived" || state === "dropped" ? ["ARCHIVED"] : state === "processed" ? ["TRIAGED", "ARCHIVED"] : [];
      const items = (await Promise.all(wanted.map(fetchState))).flat();
      return items.filter((item) => (state ? item.state === state : item.state !== "processed" && item.state !== "dropped")).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
    },

    async count() {
      return (await fetchState("INBOX")).length;
    },

    async capture({ text, source = "quick-add" }) {
      const body = text.trim();
      if (!body) invalid("Nothing to capture");
      if (body.length > MAX_TEXT) invalid("The capture is too long");
      const { data } = await mapErrors(() => client.request("post", "/api/v1/capture", { header: { "Idempotency-Key": newIdempotencyKey() }, body: { type: source === "note" ? "NOTE" : "DRAFT", text: body } }));
      sources.set(data.id, source);
      return toItem(remember(data));
    },

    async snooze() {
      return unsupported("The API has no snooze for captures");
    },

    async archive(ids) {
      const items: InboxItem[] = [];
      for (const id of ids) {
        const dto = await setArchived(id, true);
        marks.delete(id);
        items.push(toItem(dto));
      }
      return items;
    },

    process: (id, { to, taskId }) => mark(id, { state: "processed", processedTo: to, ...(taskId ? { taskId } : {}) }),

    drop: (id) => mark(id, { state: "dropped" }),

    async restore(ids) {
      const items: InboxItem[] = [];
      for (const id of ids) {
        const dto = await setArchived(id, false);
        marks.delete(id);
        items.push(toItem(dto));
      }
      return items;
    },
  };
}
