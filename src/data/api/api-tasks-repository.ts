import type { ApiClient, RequestBody, ResponseData } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import { newIdempotencyKey } from "@/api/client";
import type { Subtask, Task, TaskLink, TaskNote, TaskPriority } from "../domain";
import {
  RepositoryError,
  type PartialField,
  type NewTaskInput,
  type TaskPatch,
  type TaskSnapshot,
  type TasksRepository,
  type UnscheduledQuery,
} from "../repositories";
import { countTasks, filterTasks, priorityRank, sortTasks } from "../task-query";
import { dayOfInstant, instantAtTime, instantToClockTime } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { DayPlans } from "./api-day-plans";

/*
 * Tasks on the Phase 0/1 API (live mode). The server owns title, status,
 * priority, scheduled day / planned start, due, Markdown description,
 * checklist, labels and attachments; every write sends the Task's exact
 * ETag (If-Match) and refreshes it from the response. Views, search, sort
 * and counts reuse the client query logic over the loaded root tasks.
 *
 * Duration is the Task productivity estimate (own revision/ETag) and notes
 * are server Notes linked by taskId. Fields the API cannot store (energy,
 * area, project, non-personal scope, recurring, goal link before Phase 06,
 * manual order before Phase 03) are refused with "unsupported", never kept
 * in memory. When the Task write succeeds but a follow-up write fails, the
 * call rejects with "partial" carrying the saved Task and what failed.
 * Child tasks (server subtasks) are not listed: the UI's "subtasks" are the
 * server checklist.
 *
 * Recurrence (Phase 02): the UI's "repeat weekly" flag is a WEEKLY series in
 * the device timezone. Turning it on makes the task the series master (the
 * server hides it) and materializes occurrences with a bounded catch-up; the
 * master's id then aliases to its current occurrence. Turning it off ends the
 * series after this occurrence (ENTIRE_SERIES endDate), so the visible task
 * stays. Occurrence tasks complete through the plain Task route, which keeps
 * the occurrence in step (verified live). Bulk edits use POST /tasks/bulk.
 */

type ApiTask = ResponseData<"/api/v1/tasks/{id}", "get">;
type ApiLabel = ResponseData<"/api/v1/labels", "get">["items"][number];
type ApiChecklistItem = ResponseData<"/api/v1/tasks/{id}/checklist-items", "get">["items"][number];
type ApiTaskPatch = RequestBody<"/api/v1/tasks/{id}", "patch">;
type ApiPriority = ApiTask["priority"];

type ApiNote = ResponseData<"/api/v1/notes", "get">["items"][number];
type ApiSeries = ResponseData<"/api/v1/task-recurrences", "get">["items"][number];
type ApiOccurrence = ResponseData<"/api/v1/task-recurrences/{id}/occurrences", "get">["items"][number];
type ApiDefinition = RequestBody<"/api/v1/task-recurrences", "post">["definition"];

/** Days of occurrences materialized ahead of today (weekly: the next one). */
const CATCH_UP_DAYS = 7;

const addDays = (day: string, days: number) =>
  localParts(new Date(new Date(`${day}T12:00:00`).getTime() + days * 86_400_000).toISOString()).day;



const MAX_ESTIMATE_MINUTES = 10080;

interface Entry {
  server: ApiTask;
  /** Exact ETag from the last detail/mutation response; undefined for list-only rows. */
  etag?: string;
  labels: string[];
  checklist?: Subtask[];
  links?: TaskLink[];
  /** Productivity estimate with its own ETag (separate revision from the Task). */
  duration?: { minutes: number | null; etag?: string };
  notes?: TaskNote[];
  /** Set for occurrence tasks of a series that repeats after this occurrence. */
  recurring?: boolean;
  /** Position in its day's server Day plan (manual order), when planned. */
  order?: number;
}

const PAGE = "100";

const PRIORITY_FROM_API: Record<ApiPriority, TaskPriority | null> = {
  NONE: null,
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
};
const PRIORITY_TO_API: Record<TaskPriority, ApiPriority> = { low: "LOW", medium: "MEDIUM", high: "HIGH", urgent: "URGENT" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Planner-zone wall clock → UTC instant (the account zone in live mode; DST-aware). */
export function localInstant(day: string, time: string): string {
  return new Date(instantAtTime(day, time)).toISOString();
}

export function localParts(instant: string): { day: string; time: string } {
  return { day: dayOfInstant(instant), time: instantToClockTime(instant) };
}

/** Due "by the end of" the chosen local day. */
const dueInstant = (day: string) => localInstant(day, "23:59");

export function toDomainTask(entry: Entry): Task {
  const { server } = entry;
  const planned = server.plannedStartAt ? localParts(server.plannedStartAt) : null;
  const date = server.scheduledDate ?? planned?.day ?? null;
  const task: Task = {
    id: server.id,
    title: server.title,
    scope: "personal",
    priority: PRIORITY_FROM_API[server.priority],
    energy: null,
    durationMinutes: entry.duration?.minutes ?? null,
    date,
    time: planned && planned.day === date ? planned.time : null,
    status: server.status === "DONE" ? "done" : "open",
    createdAt: server.createdAt,
  };
  if (server.completedAt && task.status === "done") task.completedAt = server.completedAt;
  if (server.dueAt) task.deadline = localParts(server.dueAt).day;
  if (server.description?.content) task.description = server.description.content;
  if (entry.labels.length) task.labels = [...entry.labels];
  if (entry.checklist) {
    task.checklist = entry.checklist.map((item) => ({ ...item }));
    task.subtasks = { done: entry.checklist.filter((item) => item.done).length, total: entry.checklist.length };
  }
  if (entry.links?.length) task.links = entry.links.map((link) => ({ ...link }));
  if (entry.notes?.length) task.notes = entry.notes.map((note) => ({ ...note }));
  if (entry.recurring) task.recurring = true;
  if (entry.order !== undefined) task.order = entry.order;
  return task;
}

function invalid(message: string): never {
  throw new RepositoryError("invalid", message);
}

/** Live API gaps: refuse instead of pretending to save (see task-capabilities.ts). */
function assertSupported(input: Pick<TaskPatch, "energy" | "area" | "project" | "scope" | "goalId">) {
  const unsupported =
    input.energy != null ||
    input.area != null ||
    input.project != null ||
    (input.scope !== undefined && input.scope !== "personal") ||
    input.goalId != null;
  if (unsupported) throw new RepositoryError("unsupported", "Field not supported by the API");
}

function checkDuration(minutes: number | null | undefined) {
  if (minutes == null) return;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_ESTIMATE_MINUTES) invalid("Bad duration");
}

/** A note's title is its first non-empty line (the API requires 1–300 characters). */
export function noteTitle(body: string): string {
  return (body.split("\n").find((line) => line.trim())?.trim() ?? body.trim()).slice(0, 300);
}

/** Day and due parts of a create/patch (the planned start is set by the caller). */
function scheduleFields(date: string | null | undefined, deadline: string | null | undefined) {
  const out: Pick<ApiTaskPatch, "scheduledDate" | "dueAt"> = {};
  if (date !== undefined) {
    if (date !== null && !DAY.test(date)) invalid("Bad date");
    out.scheduledDate = date;
  }
  if (deadline !== undefined) {
    if (deadline !== null && !DAY.test(deadline)) invalid("Bad deadline");
    out.dueAt = deadline === null ? null : dueInstant(deadline);
  }
  return out;
}

export interface ApiTasksRepositoryOptions {
  /** The planner's "today" (YYYY-MM-DD) for views and counts. */
  today: () => string;
  /** Repository for concepts the API does not have yet (areas, goal titles). */
  fallback: Pick<TasksRepository, "listAreas">;
  /** Day plans (Phase 03): manual order and plan moves. Without it, manual order is unsupported. */
  dayPlans?: DayPlans;
}

/** Days around today whose Day plans give the manual order (bounded reads per load). */
const PLAN_WINDOW = { before: 7, after: 14 };

export type ApiTasksRepository = TasksRepository & {
  /** The last loaded state of a task, without a request (Day plan views resolve titles/times from it). */
  peek(id: string): Task | undefined;
  /** Server revision of a loaded task (for references such as Day plan items). */
  revisionOf(id: string): number;
};

export function createApiTasksRepository(client: ApiClient, options: ApiTasksRepositoryOptions): ApiTasksRepository {
  const entries = new Map<string, Entry>();
  const deletedEtags = new Map<string, string>();
  let labelsByName = new Map<string, ApiLabel>();

  /** Series by id (with ETag once read), occurrences by task id, master id → current occurrence task id. */
  const series = new Map<string, { data: ApiSeries; etag?: string }>();
  const occurrenceOf = new Map<string, ApiOccurrence>();
  const aliasOf = new Map<string, string>();
  const resolve = (id: string) => aliasOf.get(id) ?? id;

  const domain = (id: string) => toDomainTask(entries.get(id)!);

  /** Active = not retired and repeating after this occurrence (endDate is inclusive). */
  const repeatsAfter = (occurrence: ApiOccurrence) => {
    const owner = series.get(occurrence.seriesId)?.data;
    return !!owner && !owner.retiredAt && (owner.definition.endDate === null || owner.definition.endDate > occurrence.localDate);
  };

  async function catchUp(seriesId: string, through: string) {
    let cursor: string | undefined;
    do {
      const { data } = await client.request("post", "/api/v1/task-recurrences/{id}/catch-up", {
        path: { id: seriesId },
        body: { through, ...(cursor ? { cursor } : {}) },
      });
      cursor = data.nextCursor ?? undefined;
    } while (cursor);
  }

  /** Series, bounded catch-up (client-driven; no server worker), occurrence → task map, master aliases. */
  async function loadRecurrences() {
    const through = addDays(options.today(), CATCH_UP_DAYS);
    const all = await pages((cursor) =>
      client.request("get", "/api/v1/task-recurrences", { query: { limit: PAGE, cursor } }).then((r) => r.data),
    );
    series.clear();
    occurrenceOf.clear();
    aliasOf.clear();
    for (const item of all) series.set(item.id, { data: item });
    await Promise.all(
      all.map(async (item) => {
        // Catch up only while behind: an ended series never scans past its (inclusive) endDate.
        const end = item.definition.endDate && item.definition.endDate < through ? item.definition.endDate : through;
        if (!item.retiredAt && (!item.scannedThrough || item.scannedThrough < end)) await catchUp(item.id, end);
        const occurrences = await pages((cursor) =>
          client
            .request("get", "/api/v1/task-recurrences/{id}/occurrences", { path: { id: item.id }, query: { limit: PAGE, cursor } })
            .then((r) => r.data),
        );
        for (const occurrence of occurrences) if (occurrence.taskId) occurrenceOf.set(occurrence.taskId, occurrence);
        // The master is hidden by the server: point it at the earliest pending occurrence (else the latest one).
        const pending = occurrences.filter((o) => o.taskId && o.state === "PENDING").sort((a, b) => a.localDate.localeCompare(b.localDate));
        const target = pending[0] ?? occurrences.filter((o) => o.taskId).sort((a, b) => b.localDate.localeCompare(a.localDate))[0];
        if (target?.taskId) aliasOf.set(item.masterTaskId, target.taskId);
      }),
    );
  }

  const markRecurring = (id: string) => {
    const entry = entries.get(id);
    const occurrence = occurrenceOf.get(id);
    if (entry) entry.recurring = !!occurrence && repeatsAfter(occurrence);
  };

  async function seriesEtag(seriesId: string) {
    const known = series.get(seriesId);
    if (known?.etag) return known.etag;
    const { data, etag } = await client.request("get", "/api/v1/task-recurrences/{id}", { path: { id: seriesId } });
    series.set(seriesId, { data, etag });
    return etag!;
  }

  /** Manual order = positions in each nearby day's plan (reads only; plans are never created here). */
  async function loadPlanOrder() {
    const plans = options.dayPlans;
    if (!plans) return;
    const today = options.today();
    const from = addDays(today, -PLAN_WINDOW.before);
    const to = addDays(today, PLAN_WINDOW.after);
    const dates = [...new Set([...entries.values()].map((entry) => toDomainTask(entry).date).filter((d): d is string => !!d && d >= from && d <= to))];
    for (const entry of entries.values()) entry.order = undefined;
    await eachLimited(dates, async (date) => {
      const plan = await plans.get(date);
      for (const item of plan?.items ?? []) {
        const entry = entries.get(item.taskId);
        if (entry) entry.order = item.position;
      }
    });
  }

  /** Repeat weekly from the task's day (or today), in the planner zone; returns the occurrence task id to show. */
  async function startRepeating(id: string): Promise<string> {
    if (occurrenceOf.has(id)) throw new RepositoryError("unsupported", "Already part of a series");
    const current = domain(id);
    const startDate = current.date ?? options.today();
    const definition: ApiDefinition = {
      version: 1,
      startDate,
      endDate: null,
      // Identity anchor only: occurrence tasks keep the master's day and (lack of) time.
      localTime: current.time ?? "00:00",
      timezone: getPlannerTimeZone(),
      rule: { kind: "WEEKLY", interval: 1 },
      exclusionDates: [],
    };
    const send = (taskRevision: number) =>
      client.request("post", "/api/v1/task-recurrences", { body: { taskId: id, taskRevision, definition } });
    // Follow-up writes (productivity, labels) bump the Task revision: read the current one first.
    const fresh = await loadDetail(id);
    if (!fresh) throw new RepositoryError("not-found", "Task not found");
    let created;
    try {
      created = await send(fresh.server.revision);
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
      created = await send((await loadDetail(id))!.server.revision);
    }
    series.set(created.data.id, { data: created.data, etag: created.etag });
    await catchUp(created.data.id, addDays(startDate > options.today() ? startDate : options.today(), CATCH_UP_DAYS));
    await loadRecurrences();
    const shown = resolve(id);
    if (shown !== id) await loadDetail(shown);
    entries.delete(id);
    return shown;
  }

  /** Stop after this occurrence: end the series on its day (ENTIRE_SERIES), keep the visible task. */
  async function stopRepeating(id: string) {
    const occurrence = occurrenceOf.get(id);
    if (!occurrence) return;
    const send = async (etag: string) => {
      const owner = series.get(occurrence.seriesId)!.data;
      return client.request("patch", "/api/v1/task-recurrences/{id}", {
        path: { id: occurrence.seriesId },
        header: { "If-Match": etag },
        body: { scope: "ENTIRE_SERIES", definition: { ...owner.definition, endDate: occurrence.localDate } },
      });
    };
    let result;
    try {
      result = await send(await seriesEtag(occurrence.seriesId));
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
      series.delete(occurrence.seriesId);
      result = await send(await seriesEtag(occurrence.seriesId));
    }
    // { series, successor, occurrence }: ENTIRE_SERIES edits the series in place.
    series.set(occurrence.seriesId, { data: result.data.series, etag: result.etag });
    markRecurring(id);
  }

  async function loadDuration(id: string) {
    const { data, etag } = await client.request("get", "/api/v1/tasks/{id}/productivity", { path: { id } });
    const entry = entries.get(id);
    if (entry) entry.duration = { minutes: data.estimatedMinutes, etag };
    return { minutes: data.estimatedMinutes, etag };
  }

  /** Bounded parallel loads (estimates for list rows not loaded yet). */
  async function eachLimited(ids: string[], run: (id: string) => Promise<unknown>, limit = 6) {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(limit, ids.length) }, async () => {
        while (next < ids.length) await run(ids[next++]!);
      }),
    );
  }

  async function pages<T>(load: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>) {
    const all: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await load(cursor);
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return all;
  }

  async function loadLabels() {
    const labels = await pages((cursor) =>
      client.request("get", "/api/v1/labels", { query: { limit: PAGE, cursor } }).then((r) => r.data),
    );
    labelsByName = new Map(labels.map((label) => [label.name.toLocaleLowerCase(), label]));
    return labels;
  }

  /** Root tasks + their label names (one listing per label, not per task). */
  async function loadAll() {
    await loadRecurrences(); // first: catch-up may materialize occurrence tasks
    const [tasks, labels] = await Promise.all([
      pages((cursor) =>
        client.request("get", "/api/v1/tasks", { query: { limit: PAGE, cursor, rootOnly: "true" } }).then((r) => r.data),
      ),
      loadLabels(),
    ]);
    const names = new Map<string, string[]>();
    await Promise.all(
      labels.map(async (label) => {
        const tagged = await pages((cursor) =>
          client
            .request("get", "/api/v1/tasks", { query: { limit: PAGE, cursor, rootOnly: "true", labelId: label.id } })
            .then((r) => r.data),
        );
        for (const task of tagged) names.set(task.id, [...(names.get(task.id) ?? []), label.name]);
      }),
    );
    const seen = new Set<string>();
    for (const server of tasks) {
      if (server.status === "CANCELED") continue;
      seen.add(server.id);
      const previous = entries.get(server.id);
      // A newer list row invalidates a stored ETag for an older revision.
      const etag = previous && previous.server.revision === server.revision ? previous.etag : undefined;
      entries.set(server.id, { ...previous, server, etag, labels: (names.get(server.id) ?? []).sort() });
    }
    for (const id of [...entries.keys()]) if (!seen.has(id)) entries.delete(id);
    // Durations live on the productivity resource: load each row estimate once (detail refreshes it).
    await eachLimited([...entries.keys()].filter((id) => !entries.get(id)!.duration), loadDuration);
    for (const id of entries.keys()) markRecurring(id);
    await loadPlanOrder();
    return [...entries.keys()].map(domain);
  }

  function remember(server: ApiTask, etag: string | undefined) {
    const previous = entries.get(server.id);
    entries.set(server.id, { labels: [], ...previous, server, etag });
  }

  async function loadDetail(id: string) {
    let response;
    try {
      response = await client.request("get", "/api/v1/tasks/{id}", { path: { id } });
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 404) return null;
      throw error;
    }
    const [checklist, labels, attachments, duration, notes] = await Promise.all([
      pages((cursor) =>
        client
          .request("get", "/api/v1/tasks/{id}/checklist-items", { path: { id }, query: { limit: PAGE, cursor } })
          .then((r) => r.data),
      ),
      pages((cursor) =>
        client.request("get", "/api/v1/tasks/{id}/labels", { path: { id }, query: { limit: PAGE, cursor } }).then((r) => r.data),
      ),
      pages((cursor) =>
        client
          .request("get", "/api/v1/tasks/{id}/attachments", { path: { id }, query: { limit: PAGE, cursor } })
          .then((r) => r.data),
      ),
      client.request("get", "/api/v1/tasks/{id}/productivity", { path: { id } }),
      pages((cursor) =>
        client
          .request("get", "/api/v1/notes", { query: { limit: PAGE, cursor, taskId: id, state: "ACTIVE" } })
          .then((r) => r.data),
      ),
    ]);
    entries.set(id, {
      server: response.data,
      etag: response.etag,
      labels: labels.map((label) => label.name).sort(),
      checklist: toChecklist(checklist),
      links: attachments
        .filter((file) => file.status === "READY")
        .map((file) => ({ id: file.fileId, kind: "file" as const, name: file.filename, sizeBytes: file.size ?? 0 })),
      duration: { minutes: duration.data.estimatedMinutes, etag: duration.etag },
      notes: toNotes(notes),
    });
    markRecurring(id);
    return entries.get(id)!;
  }

  const toNotes = (notes: ApiNote[]): TaskNote[] =>
    notes
      .map((note) => ({ id: note.id, body: note.content.content, createdAt: note.createdAt }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  /** PATCH the productivity estimate with its own ETag; on 409 refetch and re-send once. */
  async function setDuration(id: string, minutes: number | null) {
    const send = (etag: string) =>
      client.request("patch", "/api/v1/tasks/{id}/productivity", {
        path: { id },
        header: { "If-Match": etag },
        body: { estimatedMinutes: minutes },
      });
    const known = entries.get(id)?.duration?.etag ?? (await loadDuration(id)).etag;
    let result;
    try {
      result = await send(known!);
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
      result = await send((await loadDuration(id)).etag!);
    }
    const entry = entries.get(id);
    if (entry) entry.duration = { minutes: result.data.estimatedMinutes, etag: result.etag };
  }

  /** Runs follow-up writes; any failure becomes one "partial" rejection carrying the saved Task. */
  async function followUps(id: string, ...args: [PartialField[], [PartialField, (() => Promise<unknown>) | false][]] | [[PartialField, (() => Promise<unknown>) | false][]]) {
    const [initial, steps] = args.length === 2 ? args : [[], args[0]];
    const failed: PartialField[] = [...initial];
    for (const [field, run] of steps) {
      if (!run) continue;
      try {
        await run();
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) throw error;
        failed.push(field);
      }
    }
    if (failed.length) {
      const shown = entries.has(id) ? id : resolve(id);
      throw new RepositoryError("partial", "Saved with errors", { task: entries.has(shown) ? domain(shown) : undefined, failed });
    }
  }

  const toChecklist = (items: ApiChecklistItem[]): Subtask[] =>
    [...items].sort((a, b) => a.position - b.position).map((item) => ({ id: item.id, title: item.title, done: item.completed }));

  async function etagOf(id: string): Promise<string> {
    const entry = entries.get(id);
    if (entry?.etag) return entry.etag;
    const loaded = await loadDetail(id);
    if (!loaded?.etag) throw new RepositoryError("not-found", "Task not found");
    return loaded.etag;
  }

  /** One If-Match write; on 409 refetch the Task and re-send the same intent once. */
  async function write<T extends { data: unknown; etag: string | undefined }>(
    id: string,
    send: (etag: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await send(await etagOf(id));
    } catch (error) {
      if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
      const fresh = await loadDetail(id);
      if (!fresh?.etag) throw error;
      return send(fresh.etag);
    }
  }

  const taskFrom = (data: unknown): ApiTask =>
    data && typeof data === "object" && "task" in data ? (data as { task: ApiTask }).task : (data as ApiTask);

  async function patchServer(id: string, body: ApiTaskPatch) {
    if (Object.keys(body).length === 0) return;
    const result = await write(id, (etag) =>
      client.request("patch", "/api/v1/tasks/{id}", { path: { id }, header: { "If-Match": etag }, body }),
    );
    remember(result.data, result.etag);
  }

  async function labelId(name: string): Promise<string> {
    const key = name.trim().toLocaleLowerCase();
    const known = labelsByName.get(key);
    if (known) return known.id;
    try {
      const { data } = await client.request("post", "/api/v1/labels", { body: { name: name.trim() } });
      labelsByName.set(key, data);
      return data.id;
    } catch (error) {
      // Created meanwhile (another tab): reload and use it.
      if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
      await loadLabels();
      const found = labelsByName.get(key);
      if (!found) throw error;
      return found.id;
    }
  }

  async function syncLabels(id: string, next: string[]) {
    const current = entries.get(id)?.labels ?? [];
    const lower = (list: string[]) => new Set(list.map((name) => name.trim().toLocaleLowerCase()));
    const want = lower(next);
    const have = lower(current);
    for (const name of next) {
      if (have.has(name.trim().toLocaleLowerCase())) continue;
      const labelIdValue = await labelId(name);
      const result = await write(id, (etag) =>
        client.request("put", "/api/v1/tasks/{id}/labels/{labelId}", {
          path: { id, labelId: labelIdValue },
          header: { "If-Match": etag },
          body: {},
        }),
      );
      remember(result.data, result.etag);
    }
    for (const name of current) {
      if (want.has(name.trim().toLocaleLowerCase())) continue;
      const label = labelsByName.get(name.trim().toLocaleLowerCase());
      if (!label) continue;
      const result = await write(id, (etag) =>
        client.request("delete", "/api/v1/tasks/{id}/labels/{labelId}", {
          path: { id, labelId: label.id },
          header: { "If-Match": etag },
          body: {},
        }),
      );
      remember(result.data, result.etag);
    }
    entries.get(id)!.labels = [...new Set(next.map((name) => name.trim()))].filter(Boolean).sort();
  }

  async function syncChecklist(id: string, next: NonNullable<TaskPatch["checklist"]>) {
    const entry = entries.get(id)?.checklist ? entries.get(id)! : await loadDetail(id);
    if (!entry) throw new RepositoryError("not-found", "Task not found");
    const current = entry.checklist ?? [];
    const byId = new Map(current.map((item) => [item.id, item]));
    const keep = new Set(next.flatMap((item) => (item.id && byId.has(item.id) ? [item.id] : [])));
    // Every checklist write uses the Task revision and returns { task, item? }.
    const apply = async <T extends { data: unknown; etag: string | undefined }>(send: (etag: string) => Promise<T>) => {
      const result = await write(id, send);
      remember(taskFrom(result.data), result.etag);
    };
    for (const item of current) {
      if (keep.has(item.id)) continue;
      await apply((etag) =>
        client.request("delete", "/api/v1/tasks/{id}/checklist-items/{itemId}", {
          path: { id, itemId: item.id },
          header: { "If-Match": etag },
          body: {},
        }),
      );
    }
    for (const [position, item] of next.entries()) {
      const title = item.title.trim();
      if (!title) invalid("Empty checklist item");
      const existing = item.id ? byId.get(item.id) : undefined;
      if (!existing) {
        const created = await write(id, (etag) =>
          client.request("post", "/api/v1/tasks/{id}/checklist-items", {
            path: { id },
            header: { "If-Match": etag },
            body: { title, position },
          }),
        );
        remember(created.data.task, created.etag);
        // Creation takes no completed flag: a new, already-ticked item needs a follow-up PATCH.
        if (item.done) {
          await apply((etag) =>
            client.request("patch", "/api/v1/tasks/{id}/checklist-items/{itemId}", {
              path: { id, itemId: created.data.item.id },
              header: { "If-Match": etag },
              body: { completed: true },
            }),
          );
        }
        continue;
      }
      const currentPosition = current.indexOf(existing);
      const body: RequestBody<"/api/v1/tasks/{id}/checklist-items/{itemId}", "patch"> = {};
      if (existing.title !== title) body.title = title;
      if (existing.done !== item.done) body.completed = item.done;
      if (currentPosition !== position) body.position = position;
      if (Object.keys(body).length === 0) continue;
      await apply((etag) =>
        client.request("patch", "/api/v1/tasks/{id}/checklist-items/{itemId}", {
          path: { id, itemId: existing.id },
          header: { "If-Match": etag },
          body,
        }),
      );
    }
    await loadDetail(id);
  }

  /** The Task-row part of a domain patch, relative to the current task (validates as it goes). */
  function serverPatchFor(current: Task, patch: TaskPatch): ApiTaskPatch {
    assertSupported(patch);
    if (patch.title !== undefined && !patch.title.trim()) invalid("Empty title");
    checkDuration(patch.durationMinutes);
    const body: ApiTaskPatch = {};
    if (patch.title !== undefined && patch.title.trim() !== current.title) body.title = patch.title.trim();
    if (patch.priority !== undefined) body.priority = patch.priority ? PRIORITY_TO_API[patch.priority] : "NONE";
    if (patch.description !== undefined) {
      body.description = patch.description ? { format: "MARKDOWN", version: 1, content: patch.description } : null;
    }
    const date = patch.date !== undefined ? patch.date : current.date;
    const time = patch.date === null ? null : patch.time !== undefined ? patch.time : current.time;
    if (patch.time && !TIME.test(patch.time)) invalid("Bad time");
    if (time && !date) invalid("A time needs a date");
    Object.assign(body, scheduleFields(patch.date, patch.deadline));
    // A new day with a kept time, or a new time: re-anchor the planned start in the device zone.
    if (patch.date !== undefined || patch.time !== undefined) body.plannedStartAt = date && time ? localInstant(date, time) : null;
    return body;
  }

  /** Returns the id to show afterwards (starting a series replaces the task by its occurrence). */
  async function applyPatch(id: string, patch: TaskPatch): Promise<string> {
    const entry = entries.get(id) ?? (await loadDetail(id));
    if (!entry) throw new RepositoryError("not-found", "Task not found");
    const previousDate = toDomainTask(entry).date;
    const body = serverPatchFor(toDomainTask(entry), patch);
    // A planned task keeps its Day plan reference in step with its day. The move must come before the
    // Task date change, with the current Task revision (verified live); it never changes the Task itself.
    const failedBefore: PartialField[] = [];
    if (options.dayPlans && patch.date !== undefined && patch.date !== previousDate && previousDate !== null) {
      try {
        const { data, etag } = await client.request("get", "/api/v1/tasks/{id}", { path: { id } });
        remember(data, etag);
        await options.dayPlans.move(previousDate, patch.date ?? null, id, data.revision);
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) throw error;
        failedBefore.push("plan");
      }
    }
    await patchServer(id, body);

    let shown = id;
    const wantsRepeat = patch.recurring !== undefined && patch.recurring !== !!entries.get(id)?.recurring;
    await followUps(id, failedBefore, [
      [
        "recurrence",
        wantsRepeat &&
          (async () => {
            if (patch.recurring) shown = await startRepeating(id);
            else await stopRepeating(id);
          }),
      ],
      ["duration", patch.durationMinutes !== undefined && (() => setDuration(id, patch.durationMinutes ?? null))],
      ["labels", patch.labels !== undefined && (() => syncLabels(id, patch.labels!))],
      ["checklist", patch.checklist !== undefined && (() => syncChecklist(shown, patch.checklist!))],
    ]);
    return shown;
  }

  return {
    async list(query = {}) {
      const tasks = await loadAll();
      const today = options.today();
      const day = query.day ?? today;
      const view = query.view ?? (query.day ? undefined : "all");
      const matches = filterTasks(tasks, query, { today });
      // No server order for the legacy (unsorted) views: the Tasks "smart" order is the closest.
      return sortTasks(matches, query.sort ?? "smart", day, view);
    },
    async get(requested) {
      if (!aliasOf.size && !series.size) await loadRecurrences();
      const id = resolve(requested);
      const entry = await loadDetail(id);
      return entry && entry.server.status !== "CANCELED" && !entry.server.deletedAt ? domain(id) : null;
    },
    async listUnscheduled({ day, range }: UnscheduledQuery) {
      const tasks = await loadAll();
      // Week range: the next 7 days (blocks/week config belong to Phase 03/04).
      const end = localParts(new Date(new Date(`${day}T12:00:00`).getTime() + 6 * 86_400_000).toISOString()).day;
      return tasks
        .filter((task) => task.status === "open" && task.time === null && task.date !== null)
        .filter((task) =>
          range === "today" ? task.date! <= day : range === "overdue" ? task.date! < day : task.date! > day && task.date! <= end,
        )
        .sort(
          (a, b) =>
            priorityRank(a) - priorityRank(b) ||
            (a.deadline ?? "~").localeCompare(b.deadline ?? "~") ||
            a.title.localeCompare(b.title),
        );
    },
    async counts(query = {}) {
      return countTasks(await loadAll(), query, { today: options.today() });
    },
    listAreas() {
      return options.fallback.listAreas();
    },
    async create(input: NewTaskInput) {
      const title = input.title.trim();
      if (!title) invalid("Empty title");
      if (input.time && !input.date) invalid("A time needs a date");
      assertSupported(input);
      checkDuration(input.durationMinutes);
      const body: RequestBody<"/api/v1/tasks", "post"> = {
        title,
        priority: input.priority ? PRIORITY_TO_API[input.priority] : "NONE",
        ...scheduleFields(input.date, input.deadline),
      };
      if (input.date && input.time) {
        if (!TIME.test(input.time)) invalid("Bad time");
        body.plannedStartAt = localInstant(input.date, input.time);
      }
      // One key per create intent; a lost response is retried once with the same key and body.
      const key = newIdempotencyKey();
      const send = () => client.request("post", "/api/v1/tasks", { header: { "Idempotency-Key": key }, body });
      let result;
      try {
        result = await send();
      } catch (error) {
        if (error instanceof ApiHttpError) throw error;
        result = await send();
      }
      remember(result.data, result.etag);
      const id = result.data.id;
      entries.get(id)!.duration = { minutes: null };
      await followUps(id, [
        ["duration", input.durationMinutes != null && (() => setDuration(id, input.durationMinutes!))],
        ["labels", !!input.labels?.length && (() => syncLabels(id, input.labels!))],
        // Last: the series copies the master's values into its occurrences.
        ["recurrence", !!input.recurring && (() => startRepeating(id))],
      ]);
      return domain(resolve(id));
    },
    async update(requested, patch) {
      return domain(await applyPatch(resolve(requested), patch));
    },
    async setDone(requested, done) {
      const id = resolve(requested);
      const init = (etag: string) => ({ path: { id }, header: { "If-Match": etag }, body: {} });
      const result = await write(id, (etag) =>
        done
          ? client.request("post", "/api/v1/tasks/{id}/complete", init(etag))
          : client.request("post", "/api/v1/tasks/{id}/reopen", init(etag)),
      );
      remember(result.data, result.etag);
      return domain(id);
    },
    async reorder({ ids }) {
      const plans = options.dayPlans;
      if (!plans) throw new RepositoryError("unsupported", "Manual order is not available");
      const unique = [...new Set(ids.map(resolve))];
      for (const id of unique) if (!entries.has(id) && !(await loadDetail(id))) throw new RepositoryError("not-found", "Task not found");
      // Manual order lives in each day's plan: undated tasks have no plan to order.
      const byDate = new Map<string, string[]>();
      for (const id of unique) {
        const date = domain(id).date;
        if (!date) throw new RepositoryError("unsupported", "Undated tasks have no day plan");
        byDate.set(date, [...(byDate.get(date) ?? []), id]);
      }
      for (const [date, list] of byDate) {
        // Current Task revisions (follow-up writes such as the estimate bump it): one GET each.
        const items = [];
        for (const id of list) {
          const { data, etag } = await client.request("get", "/api/v1/tasks/{id}", { path: { id } });
          remember(data, etag);
          items.push({ taskId: id, taskRevision: data.revision, plannedMinutes: entries.get(id)!.duration?.minutes ?? null });
        }
        const plan = await plans.order(date, items);
        for (const item of plan.items) {
          const entry = entries.get(item.taskId);
          if (entry) entry.order = item.position;
        }
      }
    },
    async remove(ids) {
      const unique = [...new Set(ids.map(resolve))];
      for (const id of unique) if (!entries.has(id) && !(await loadDetail(id))) throw new RepositoryError("not-found", "Task not found");
      const snapshot: TaskSnapshot = { tasks: unique.map(domain), blocks: [], positions: [] };
      for (const id of unique) {
        const result = await write(id, (etag) =>
          client.request("delete", "/api/v1/tasks/{id}", { path: { id }, header: { "If-Match": etag }, body: {} }),
        );
        if (result.etag) deletedEtags.set(id, result.etag);
        entries.delete(id);
      }
      return { restore: snapshot };
    },
    async restore(snapshot) {
      for (const task of snapshot.tasks) {
        if (entries.has(task.id)) continue;
        let etag = deletedEtags.get(task.id);
        if (!etag) {
          const { etag: fresh } = await client.request("get", "/api/v1/tasks/{id}", { path: { id: task.id }, query: { includeDeleted: "true" } });
          etag = fresh;
        }
        // Server-side restore window (restoreUntil): a 4xx here means it can no longer be restored.
        const result = await client.request("post", "/api/v1/tasks/{id}/restore", {
          path: { id: task.id },
          header: { "If-Match": etag! },
          body: {},
        });
        deletedEtags.delete(task.id);
        remember(result.data, result.etag);
      }
    },
    async bulkUpdate(requested, patch) {
      const ids = [...new Set(requested.map(resolve))];
      // Follow-up resources (duration, labels, checklist, recurrence) are per task: sequential updates.
      const perTask = ["durationMinutes", "labels", "checklist", "recurring"].some((key) => key in patch);
      if (perTask) {
        const out: Task[] = [];
        for (const id of ids) out.push(await this.update(id, patch));
        return out;
      }
      for (const id of ids) if (!entries.has(id) && !(await loadDetail(id))) throw new RepositoryError("not-found", "Task not found");
      const items = (list: string[]) =>
        list.map((id) => ({ id, revision: entries.get(id)!.server.revision, action: "PATCH" as const, patch: serverPatchFor(domain(id), patch) }));
      // One Idempotency-Key per exact body; a lost response re-sends the same key and body.
      const send = async (list: string[]) => {
        const body = { items: items(list) };
        const key = newIdempotencyKey();
        const post = () => client.request("post", "/api/v1/tasks/bulk", { header: { "Idempotency-Key": key }, body });
        try {
          return (await post()).data;
        } catch (error) {
          if (error instanceof ApiHttpError) throw error;
          return (await post()).data;
        }
      };
      const apply = (list: string[], result: Awaited<ReturnType<typeof send>>) => {
        const rejected: { id: string; code: string }[] = [];
        for (const item of result.items) {
          const id = list[item.index]!;
          if (item.status === "APPLIED") remember(item.task, undefined);
          else rejected.push({ id, code: item.error.code });
        }
        return rejected;
      };
      let rejected = apply(ids, await send(ids));
      // Stale revisions: refetch those tasks and re-send them once (a new body, so a new key).
      const stale = rejected.filter((item) => item.code === "CONFLICT").map((item) => item.id);
      if (stale.length) {
        for (const id of stale) await loadDetail(id);
        rejected = [...rejected.filter((item) => item.code !== "CONFLICT"), ...apply(stale, await send(stale))];
      }
      if (rejected.length) {
        throw new RepositoryError("partial", "Some tasks were not updated", { failedIds: rejected.map((item) => item.id) });
      }
      return ids.map(domain);
    },
    revisionOf(id) {
      const entry = entries.get(resolve(id));
      if (!entry) throw new RepositoryError("not-found", "Task not loaded");
      return entry.server.revision;
    },
    peek(id) {
      const entry = entries.get(resolve(id));
      return entry ? toDomainTask(entry) : undefined;
    },
    async addNote(requested, body) {
      const id = resolve(requested);
      const text = body.trim();
      if (!text) invalid("Empty note");
      if (!entries.has(id) && !(await loadDetail(id))) throw new RepositoryError("not-found", "Task not found");
      // A Task note is a server Note linked by taskId; the Task description is never touched.
      const key = newIdempotencyKey();
      const request = () =>
        client.request("post", "/api/v1/notes", {
          header: { "Idempotency-Key": key },
          body: { title: noteTitle(text), content: { format: "MARKDOWN", version: 1, content: text }, taskId: id },
        });
      let result;
      try {
        result = await request();
      } catch (error) {
        if (error instanceof ApiHttpError) throw error;
        result = await request(); // lost response: same key, same body
      }
      const entry = entries.get(id)!;
      entry.notes = [
        ...(entry.notes ?? []),
        { id: result.data.id, body: result.data.content.content, createdAt: result.data.createdAt },
      ];
      return domain(id);
    },
  };
}
