import type { ApiClient, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import { addDaysToDay, dayOfInstant, formatClockTime, instantToClockTime, parseClockTime } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { TimeBlock } from "../domain";
import { RepositoryError, type BlockPlacement, type BlocksRepository, type ScheduleSnapshot } from "../repositories";
import type { ApiTasksRepository } from "./api-tasks-repository";

/*
 * Calendar (Phase 04): the timeline/calendar blocks are the server view
 * (GET /calendar/views, account zone, exclusive `to`): EVENTs and TIME_BLOCKs.
 * A task on the timeline is a TIME_BLOCK linked to the Task (taskRevision);
 * the API never changes the Task for a block, so scheduling also writes the
 * Task's day/time/estimate explicitly — reported as "partial" when only the
 * block saved. Every edit sends the block's/event's ETag (409 → refetch +
 * resend once); creates use an Idempotency-Key. Recurring event occurrences
 * are virtual: moving them needs the series flow (not in this UI) → refused.
 * Only ACTIVE timed entries are shown (no all-day lane in the UI).
 */

type ApiViewItem = ResponseData<"/api/v1/calendar/views", "get">["items"][number];
type ApiTimeBlock = ResponseData<"/api/v1/calendar/time-blocks/{id}", "get">;
type TimedSchedule = { kind: "TIMED"; timezone: string; localStart: string; localEnd: string };

interface Known {
  kind: "EVENT" | "TIME_BLOCK";
  resourceId: string;
  /** Set for virtual occurrences of a recurring event. */
  seriesId: string | null;
  taskId: string | null;
  etag?: string;
}

const DEFAULT_MINUTES = 30;
const PAGE = "100";

export interface ApiBlocksOptions {
  tasks: ApiTasksRepository;
}

export function createApiBlocksRepository(client: ApiClient, { tasks }: ApiBlocksOptions): BlocksRepository {
  const known = new Map<string, Known>();
  const lastByDay = new Map<string, TimeBlock[]>();

  const timed = (day: string, startMinutes: number, endMinutes: number): TimedSchedule => ({
    kind: "TIMED",
    timezone: getPlannerTimeZone(),
    localStart: `${day}T${formatClockTime(startMinutes)}`,
    localEnd: `${addDaysToDay(day, Math.floor(endMinutes / 1440))}T${formatClockTime(endMinutes % 1440)}`,
  });

  function toBlock(item: ApiViewItem): TimeBlock | null {
    if (item.status !== "ACTIVE" || item.schedule.kind !== "TIMED" || !item.schedule.startAt || !item.schedule.endAt) return null;
    const id = item.seriesId ? item.identity : item.resourceId;
    known.set(id, { kind: item.kind, resourceId: item.resourceId, seriesId: item.seriesId, taskId: item.taskId, etag: known.get(id)?.etag });
    const task = item.taskId ? tasks.peek(item.taskId) : undefined;
    const block: TimeBlock = {
      id,
      title: task?.title ?? item.title,
      start: item.schedule.startAt,
      end: item.schedule.endAt,
      scope: "personal",
      kind: item.kind === "TIME_BLOCK" && item.taskId ? "task" : "event",
    };
    if (item.taskId) {
      block.taskId = item.taskId;
      block.done = item.taskDisposition === "COMPLETED" || task?.status === "done";
    }
    return block;
  }

  async function listForDay(day: string): Promise<TimeBlock[]> {
    const out: TimeBlock[] = [];
    let cursor: string | undefined;
    do {
      const { data } = await client.request("get", "/api/v1/calendar/views", {
        query: { from: day, to: addDaysToDay(day, 1), timezone: getPlannerTimeZone(), limit: PAGE, cursor },
      });
      for (const item of data.items) {
        const block = toBlock(item);
        if (block) out.push(block);
      }
      cursor = data.nextCursor ?? undefined;
    } while (cursor);
    out.sort((a, b) => a.start.localeCompare(b.start));
    lastByDay.set(day, out);
    return out;
  }

  /** All active task-linked time blocks (task → its block). */
  async function taskBlocks(): Promise<ApiTimeBlock[]> {
    const all: ApiTimeBlock[] = [];
    let cursor: string | undefined;
    do {
      const { data } = await client.request("get", "/api/v1/calendar/time-blocks", { query: { limit: PAGE, cursor } });
      all.push(...data.items);
      cursor = data.nextCursor ?? undefined;
    } while (cursor);
    return all.filter((block) => block.taskId && block.status === "ACTIVE" && !block.deletedAt);
  }

  async function etagFor(id: string, entry: Known): Promise<string> {
    if (entry.etag) return entry.etag;
    const { etag } =
      entry.kind === "EVENT"
        ? await client.request("get", "/api/v1/calendar/events/{id}", { path: { id: entry.resourceId } })
        : await client.request("get", "/api/v1/calendar/time-blocks/{id}", { path: { id: entry.resourceId } });
    entry.etag = etag;
    known.set(id, entry);
    return etag!;
  }

  /** PATCH an event or time block schedule with If-Match; 409 → refetch ETag and re-send once. */
  async function patchSchedule(id: string, entry: Known, schedule: TimedSchedule) {
    if (entry.seriesId) throw new RepositoryError("unsupported", "Recurring event occurrences need the series editor");
    const send = (etag: string) =>
      entry.kind === "EVENT"
        ? client.request("patch", "/api/v1/calendar/events/{id}", { path: { id: entry.resourceId }, header: { "If-Match": etag }, body: { schedule } })
        : client.request("patch", "/api/v1/calendar/time-blocks/{id}", { path: { id: entry.resourceId }, header: { "If-Match": etag }, body: { schedule } });
    let result;
    try {
      result = await send(await etagFor(id, entry));
    } catch (error) {
      rethrowGap(error);
      if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
      entry.etag = undefined;
      result = await send(await etagFor(id, entry));
    }
    entry.etag = result.etag;
  }

  /** An explicit DST-gap time is invalid input, not a server failure. */
  function rethrowGap(error: unknown) {
    if (error instanceof ApiHttpError && error.status === 400 && error.details.some((d) => d.code === "DST_GAP")) {
      throw new RepositoryError("invalid", "That time does not exist in this time zone (DST change)");
    }
  }

  function placementMinutes(placement: BlockPlacement, fallbackLength: number) {
    const start = parseClockTime(placement.start);
    const length = placement.durationMinutes ?? fallbackLength;
    if (start === null || !Number.isInteger(length) || length <= 0 || start + length > 1440) {
      throw new RepositoryError("invalid", "The block must stay within its day");
    }
    return { start, end: start + length, length };
  }

  /** The Task follows its block (day, time, estimate); a failure here leaves the saved block and reports it. */
  async function syncTask(taskId: string, day: string, startMinutes: number, length: number) {
    try {
      await tasks.update(taskId, { date: day, time: formatClockTime(startMinutes), durationMinutes: length });
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) throw error;
      throw new RepositoryError("partial", "Block saved, task not updated", { failed: ["time"] });
    }
  }

  async function findBlock(id: string): Promise<{ id: string; entry: Known; block: TimeBlock | undefined }> {
    const entry = known.get(id);
    if (!entry) throw new RepositoryError("not-found", "Block not found");
    const block = [...lastByDay.values()].flat().find((item) => item.id === id);
    return { id, entry, block };
  }

  const blockFrom = (id: string, title: string, day: string, start: number, end: number, taskId: string | null, done = false): TimeBlock => {
    const schedule = timed(day, start, end);
    const block: TimeBlock = {
      id,
      title,
      start: `${schedule.localStart}`,
      end: `${schedule.localEnd}`,
      scope: "personal",
      kind: taskId ? "task" : "event",
    };
    if (taskId) {
      block.taskId = taskId;
      block.done = done;
    }
    return block;
  };

  return {
    listForDay,

    async schedule(taskId, placement) {
      const task = (await tasks.get(taskId)) ?? null;
      if (!task) throw new RepositoryError("not-found", "Task not found");
      const { start, end, length } = placementMinutes(placement, task.durationMinutes ?? DEFAULT_MINUTES);
      const schedule = timed(placement.day, start, end);
      const existing = (await taskBlocks()).find((block) => block.taskId === taskId);
      let blockId: string;
      if (existing) {
        const entry: Known = { kind: "TIME_BLOCK", resourceId: existing.id, seriesId: null, taskId, etag: undefined };
        known.set(existing.id, entry);
        await patchSchedule(existing.id, entry, schedule);
        blockId = existing.id;
      } else {
        // One key per placement intent; a lost response re-sends the same key and body.
        const key = newIdempotencyKey();
        const body = { title: task.title, schedule, taskId, taskRevision: tasks.revisionOf(taskId) };
        const post = () => client.request("post", "/api/v1/calendar/time-blocks", { header: { "Idempotency-Key": key }, body });
        let result;
        try {
          result = await post();
        } catch (error) {
          rethrowGap(error);
          if (error instanceof ApiHttpError) throw error;
          result = await post();
        }
        blockId = result.data.id;
        known.set(blockId, { kind: "TIME_BLOCK", resourceId: blockId, seriesId: null, taskId, etag: result.etag });
      }
      await syncTask(taskId, placement.day, start, length);
      return blockFrom(blockId, task.title, placement.day, start, end, taskId, task.status === "done");
    },

    async move(blockId, placement) {
      const { entry, block } = await findBlock(blockId);
      const current = block ? Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60_000) : DEFAULT_MINUTES;
      const { start, end, length } = placementMinutes(placement, current);
      await patchSchedule(blockId, entry, timed(placement.day, start, end));
      if (entry.taskId) await syncTask(entry.taskId, placement.day, start, length);
      return blockFrom(blockId, block?.title ?? "", placement.day, start, end, entry.taskId, block?.done);
    },

    async unschedule(blockId) {
      const { entry } = await findBlock(blockId);
      if (entry.kind !== "TIME_BLOCK" || !entry.taskId) throw new RepositoryError("forbidden", "Only task blocks can be unscheduled");
      const send = (etag: string) =>
        client.request("delete", "/api/v1/calendar/time-blocks/{id}", { path: { id: entry.resourceId }, header: { "If-Match": etag }, body: {} });
      try {
        await send(await etagFor(blockId, entry));
      } catch (error) {
        if (!(error instanceof ApiHttpError && error.status === 409)) throw error;
        entry.etag = undefined;
        await send(await etagFor(blockId, entry));
      }
      known.delete(blockId);
      // The task keeps its day and loses its time.
      try {
        await tasks.update(entry.taskId, { time: null });
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) throw error;
        throw new RepositoryError("partial", "Block removed, task time not cleared", { failed: ["time"] });
      }
    },

    async snapshot({ taskIds = [], blockIds = [] }) {
      const linked = await taskBlocks();
      const snapshotTasks: ScheduleSnapshot["tasks"] = [];
      for (const id of taskIds) {
        const task = tasks.peek(id) ?? (await tasks.get(id));
        if (task) snapshotTasks.push({ id: task.id, date: task.date, time: task.time, durationMinutes: task.durationMinutes });
      }
      const ids = new Set([...blockIds, ...linked.filter((block) => block.taskId && taskIds.includes(block.taskId)).map((block) => block.id)]);
      const blocks: TimeBlock[] = [];
      for (const id of ids) {
        const fromView = [...lastByDay.values()].flat().find((block) => block.id === id);
        const server = linked.find((block) => block.id === id);
        if (fromView) blocks.push({ ...fromView });
        else if (server?.schedule.kind === "TIMED" && server.schedule.startAt && server.schedule.endAt) {
          blocks.push({ id, title: server.title, start: server.schedule.startAt, end: server.schedule.endAt, scope: "personal", kind: "task", taskId: server.taskId! });
        }
      }
      return { tasks: snapshotTasks, blocks, blockIds: [...blockIds] };
    },

    async restore(snapshot) {
      const linked = await taskBlocks();
      const wanted = new Map(snapshot.blocks.map((block) => [block.id, block]));
      // Blocks created for these tasks since the snapshot go away.
      for (const block of linked) {
        if (!block.taskId || !snapshot.tasks.some((task) => task.id === block.taskId) || wanted.has(block.id)) continue;
        const entry: Known = known.get(block.id) ?? { kind: "TIME_BLOCK", resourceId: block.id, seriesId: null, taskId: block.taskId };
        await client.request("delete", "/api/v1/calendar/time-blocks/{id}", { path: { id: block.id }, header: { "If-Match": await etagFor(block.id, entry) }, body: {} });
        known.delete(block.id);
      }
      for (const block of snapshot.blocks) {
        const day = dayOfInstant(block.start);
        const start = parseClockTime(instantToClockTime(block.start))!;
        const length = Math.round((Date.parse(block.end) - Date.parse(block.start)) / 60_000);
        const schedule = timed(day, start, start + length);
        const entry = known.get(block.id) ?? (linked.some((b) => b.id === block.id) ? { kind: "TIME_BLOCK" as const, resourceId: block.id, seriesId: null, taskId: block.taskId ?? null } : undefined);
        if (entry) {
          await patchSchedule(block.id, entry, schedule);
        } else if (block.taskId) {
          // Removed since the snapshot: create it again (new id) for its task.
          await client.request("post", "/api/v1/calendar/time-blocks", {
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { title: block.title, schedule, taskId: block.taskId, taskRevision: tasks.revisionOf(block.taskId) },
          });
        }
      }
      for (const task of snapshot.tasks) {
        await tasks.update(task.id, { date: task.date, time: task.date ? task.time : null, durationMinutes: task.durationMinutes });
      }
    },

    async setDone(blockId, done) {
      const { entry, block } = await findBlock(blockId);
      if (!entry.taskId) throw new RepositoryError("unsupported", "Events cannot be marked done");
      const task = await tasks.setDone(entry.taskId, done);
      return { ...(block ?? blockFrom(blockId, task.title, task.date ?? "", 0, DEFAULT_MINUTES, entry.taskId)), done };
    },
  };
}
