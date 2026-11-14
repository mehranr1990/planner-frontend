import type { ApiClient, RequestBody, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import { addDaysToDay, dayOfInstant, diffDays, parseDay } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { Goal, GoalLifecycle, GoalMeasure, Task } from "../domain";
import { RepositoryError, type GoalInput, type GoalPatch, type GoalsRepository } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import type { ApiTasksRepository } from "./api-tasks-repository";

/*
 * Goals (Phase 06) over /goals, nested milestones / metrics / task links and
 * /life-areas.
 * - Lifecycle: active = PLANNED / ACTIVE / PAUSED, completed = COMPLETED,
 *   archived = ABANDONED (the API's only retained "set aside" state).
 * - Progress is the server's (GET /goals/{id}/progress): new goals are WEIGHTED
 *   with contributing milestones, so progress = share of milestones reached; a
 *   goal with a measure selects one METRIC (baseline 0). Completed shows 100%.
 * - Area = a Life area by title (created on first use). Notes = description.
 *   Deadline = targetDate. Horizon (required by the API, absent in the UI):
 *   SHORT_TERM when the deadline is within a year, else LONG_TERM.
 * - Linked tasks = /links/tasks (contributes:false, so linking never changes
 *   progress). `withGoalLinks` gives Tasks their goal: a task's goalId is
 *   written as a link, and reads show the goal from the loaded links.
 * - Every nested write sends the Goal's revision (If-Match) and takes the new
 *   one from the response; 409 → reload the goal and repeat once.
 * - No API field: the free-text "target", milestone next action, key results,
 *   money, completion day → refused on write / absent on read.
 */

type ApiGoal = ResponseData<"/api/v1/goals/{id}", "get">;
type ApiMilestone = ResponseData<"/api/v1/goals/{id}/milestones", "get">["items"][number];
type ApiProgress = ResponseData<"/api/v1/goals/{id}/progress", "get">;
type GoalPatchBody = RequestBody<"/api/v1/goals/{id}", "patch">;

interface Known {
  dto: ApiGoal;
  milestones: ApiMilestone[];
  progress: ApiProgress;
  /** Task links: task id → link id. */
  links: Map<string, string>;
  /** Linked habits (GET links/habits; read-only in the UI). */
  habitIds: string[];
}

export interface ApiGoalsOptions {
  today: () => string;
  /** The unwrapped tasks repository (linked tasks are read through it). */
  tasks: ApiTasksRepository;
}

export type ApiGoalsRepository = GoalsRepository & {
  /** The goal a loaded task is linked to (from the links loaded so far). */
  goalOf(taskId: string): { goalId: string; goalTitle: string } | undefined;
  /** Loads goals and links once, so `goalOf` can answer; later calls are free. Never rejects except 401. */
  ready(): Promise<void>;
  /** Links the task to the goal (replacing another goal's link), or unlinks it with null. */
  setTaskGoal(taskId: string, taskRevision: number, goalId: string | null): Promise<void>;
};

const PAGE = "100";
const LIFECYCLE: Record<ApiGoal["status"], GoalLifecycle> = { PLANNED: "active", ACTIVE: "active", PAUSED: "active", COMPLETED: "completed", ABANDONED: "archived" };
const STATUS: Record<GoalLifecycle, ApiGoal["status"]> = { active: "ACTIVE", completed: "COMPLETED", archived: "ABANDONED" };

function checkDay(day: string | null | undefined): void {
  if (day && parseDay(day) === null) invalid(`Bad day "${day}"`);
}

function checkMeasure(measure: GoalMeasure | null | undefined): void {
  if (!measure) return;
  if (!(measure.target > 0) || !(measure.current >= 0)) invalid("A measure needs a positive target");
  if (!measure.unit.trim()) invalid("A measure needs a unit");
}

/** An exact API decimal (≤ 6 fraction digits). */
const decimal = (value: number) => String(Math.round(value * 1e6) / 1e6);

const metricBody = (title: string, measure: GoalMeasure) => ({ title, unit: measure.unit.trim().slice(0, 30), baseline: "0", target: decimal(measure.target), current: decimal(measure.current), contributes: true });

export function createApiGoalsRepository(client: ApiClient, { today, tasks }: ApiGoalsOptions): ApiGoalsRepository {
  const known = new Map<string, Known>();
  /** Life areas: id → title, and lower-cased title → id (ACTIVE only for new assignments). */
  let areaTitles = new Map<string, string>();
  let areaIds = new Map<string, string>();
  let loaded: Promise<void> | null = null;

  async function loadAreas(): Promise<void> {
    const items = await pageAll(async (cursor) => (await client.request("get", "/api/v1/life-areas", { query: { limit: PAGE, cursor } })).data);
    areaTitles = new Map(items.map((area) => [area.id, area.title]));
    areaIds = new Map(items.filter((area) => area.status === "ACTIVE").map((area) => [area.title.trim().toLowerCase(), area.id]));
  }

  /** The Life area with that title, created on first use; blank → null. */
  async function areaId(title: string | null | undefined): Promise<string | null> {
    const name = title?.trim();
    if (!name) return null;
    if (!areaIds.has(name.toLowerCase())) await loadAreas();
    const existing = areaIds.get(name.toLowerCase());
    if (existing) return existing;
    const { data } = await client.request("post", "/api/v1/life-areas", { header: { "Idempotency-Key": newIdempotencyKey() }, body: { title: name } });
    areaTitles.set(data.id, data.title);
    areaIds.set(name.toLowerCase(), data.id);
    return data.id;
  }

  async function details(dto: ApiGoal): Promise<Known> {
    const path = { id: dto.id };
    const [milestones, progress, links, habits] = await Promise.all([
      client.request("get", "/api/v1/goals/{id}/milestones", { path }),
      client.request("get", "/api/v1/goals/{id}/progress", { path }),
      client.request("get", "/api/v1/goals/{id}/links/tasks", { path }),
      client.request("get", "/api/v1/goals/{id}/links/habits", { path }),
    ]);
    const entry: Known = {
      dto,
      milestones: [...milestones.data.items].sort((a, b) => a.position - b.position),
      progress: progress.data,
      links: new Map(links.data.items.map((link) => [link.taskId, link.id])),
      habitIds: habits.data.items.map((link) => link.habitId),
    };
    known.set(dto.id, entry);
    return entry;
  }

  /** Reloads one goal with its children (unknown id → "not-found"). */
  const reload = (id: string) => mapErrors(async () => details((await client.request("get", "/api/v1/goals/{id}", { path: { id } })).data));
  const knownOrLoad = async (id: string) => known.get(id) ?? reload(id);

  async function loadAll(): Promise<void> {
    const [dtos] = await Promise.all([pageAll(async (cursor) => (await client.request("get", "/api/v1/goals", { query: { limit: PAGE, cursor } })).data), loadAreas()]);
    const entries = await Promise.all(dtos.map(details));
    known.clear();
    for (const entry of entries) known.set(entry.dto.id, entry);
  }

  function toGoal({ dto, milestones, progress, habitIds }: Known): Goal {
    const lifecycle = LIFECYCLE[dto.status];
    const metric = dto.progressMode === "METRIC" ? progress.sources.find((source) => source.kind === "METRIC")?.metric : null;
    const open = milestones.filter((item) => item.status === "OPEN");
    const next = open[1] ?? open[0];
    const late = lifecycle === "active" && dto.targetDate && dto.targetDate < today() ? diffDays(dto.targetDate, today()) : 0;
    const area = dto.lifeAreaId ? areaTitles.get(dto.lifeAreaId) : undefined;
    return {
      id: dto.id,
      title: dto.title,
      progress: lifecycle === "completed" ? 1 : Math.max(0, Math.min(1, Number(progress.percentage) / 100)),
      status: late > 0 ? "behind" : "on-track",
      ...(late > 0 ? { behindDays: late } : {}),
      nextStep: next?.title ?? null,
      nextStepDay: next?.targetDate ?? null,
      lifecycle,
      ...(area ? { area } : {}),
      dueDay: dto.targetDate,
      ...(metric ? { measure: { current: Number(metric.current), target: Number(metric.target), unit: metric.unit } } : {}),
      ...(milestones.length ? { milestones: milestones.map((item) => ({ id: item.id, title: item.title, dueDay: item.targetDate, doneDay: item.completedAt ? dayOfInstant(item.completedAt) : null })) } : {}),
      ...(dto.description ? { notes: dto.description } : {}),
      ...(habitIds.length ? { habitIds: [...habitIds] } : {}),
    };
  }

  /**
   * Runs writes that need the Goal's revision; `write` gets the If-Match value and returns
   * the Goal's new revision. 409 → reload the goal and repeat once.
   */
  async function write(id: string, send: (etag: string, entry: Known) => Promise<number | ApiGoal>): Promise<Known> {
    await knownOrLoad(id);
    await mapErrors(() =>
      retryOnConflict(
        async () => {
          const entry = known.get(id)!;
          const result = await send(revisionTag(entry.dto.revision), entry);
          if (typeof result === "number") entry.dto.revision = result;
          else entry.dto = result;
        },
        () => reload(id),
      ),
    );
    return known.get(id)!;
  }

  const patchGoal = (id: string, body: GoalPatchBody) =>
    write(id, async (etag) => (await client.request("patch", "/api/v1/goals/{id}", { path: { id }, header: { "If-Match": etag }, body })).data);

  async function refreshProgress(entry: Known): Promise<void> {
    entry.progress = (await client.request("get", "/api/v1/goals/{id}/progress", { path: { id: entry.dto.id } })).data;
  }

  async function postMilestone(id: string, input: { title: string; dueDay: string | null }, position: number): Promise<void> {
    const key = newIdempotencyKey();
    await write(id, async (etag, entry) => {
      const { data } = await client.request("post", "/api/v1/goals/{id}/milestones", {
        path: { id },
        header: { "If-Match": etag, "Idempotency-Key": key },
        body: { title: input.title.trim(), position, targetDate: input.dueDay, contributes: true },
      });
      entry.milestones.splice(Math.min(position, entry.milestones.length), 0, data.item);
      return data.revision;
    });
  }

  /** Creates the goal's metric and selects it (METRIC mode). */
  async function addMeasure(id: string, measure: GoalMeasure): Promise<void> {
    const key = newIdempotencyKey();
    let metricId = "";
    await write(id, async (etag, entry) => {
      const { data } = await client.request("post", "/api/v1/goals/{id}/metrics", { path: { id }, header: { "If-Match": etag, "Idempotency-Key": key }, body: metricBody(entry.dto.title, measure) });
      metricId = data.item.id;
      return data.revision;
    });
    await patchGoal(id, { progressMode: "METRIC", metricId });
  }

  function findLink(taskId: string): { goalId: string; linkId: string } | undefined {
    for (const [goalId, entry] of known) {
      const linkId = entry.links.get(taskId);
      if (linkId) return { goalId, linkId };
    }
    return undefined;
  }

  const repository: ApiGoalsRepository = {
    async list(lifecycle = "active") {
      loaded = loadAll();
      await loaded;
      return [...known.values()]
        .filter((entry) => LIFECYCLE[entry.dto.status] === lifecycle)
        .sort((a, b) => b.dto.createdAt.localeCompare(a.dto.createdAt))
        .map(toGoal);
    },

    async get(id) {
      try {
        if (areaTitles.size === 0) await loadAreas();
        return toGoal(await reload(id));
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "not-found") return null;
        throw error;
      }
    },

    async create(input: GoalInput) {
      const title = input.title.trim();
      if (!title) invalid("A goal needs a title");
      checkDay(input.dueDay);
      checkMeasure(input.measure);
      for (const item of input.milestones ?? []) {
        if (!item.title.trim()) invalid("A milestone needs a title");
        checkDay(item.dueDay);
      }
      if (input.target?.trim()) unsupported("The API has no free-text target");
      const dueDay = input.dueDay ?? null;
      const { data } = await mapErrors(async () =>
        client.request("post", "/api/v1/goals", {
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: {
            title,
            description: input.notes?.trim() || null,
            horizon: dueDay && dueDay <= addDaysToDay(today(), 365) ? "SHORT_TERM" : "LONG_TERM",
            status: "ACTIVE",
            lifeAreaId: await areaId(input.area),
            targetDate: dueDay,
            progressMode: "WEIGHTED",
            timezone: getPlannerTimeZone(),
          },
        }),
      );
      const entry: Known = { dto: data, milestones: [], progress: emptyProgress(data), links: new Map(), habitIds: [] };
      known.set(data.id, entry);
      try {
        if (input.measure) await addMeasure(data.id, input.measure);
        for (const [index, item] of (input.milestones ?? []).entries()) await postMilestone(data.id, item, index);
        if (input.measure) await refreshProgress(known.get(data.id)!);
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 401) throw error;
        throw new RepositoryError("partial", "Goal saved, some of its parts were not");
      }
      return toGoal(known.get(data.id)!);
    },

    async update(id, patch: GoalPatch) {
      if (patch.title !== undefined && !patch.title.trim()) invalid("A goal needs a title");
      checkDay(patch.dueDay);
      checkMeasure(patch.measure);
      if (patch.target?.trim()) unsupported("The API has no free-text target");
      const { dto } = await knownOrLoad(id);
      const body: GoalPatchBody = {};
      if (patch.title !== undefined && patch.title.trim() !== dto.title) body.title = patch.title.trim();
      if (patch.notes !== undefined && (patch.notes.trim() || null) !== dto.description) body.description = patch.notes.trim() || null;
      if (patch.dueDay !== undefined && patch.dueDay !== dto.targetDate) body.targetDate = patch.dueDay;
      if (patch.area !== undefined) {
        const lifeAreaId = await mapErrors(() => areaId(patch.area));
        if (lifeAreaId !== dto.lifeAreaId) body.lifeAreaId = lifeAreaId;
      }
      const metricId = dto.progressMode === "METRIC" ? dto.metricId : null;
      if (patch.measure === null && metricId) Object.assign(body, { progressMode: "WEIGHTED", metricId: null } satisfies GoalPatchBody);
      if (Object.keys(body).length) await patchGoal(id, body);
      if (patch.measure !== undefined) {
        const measure = patch.measure;
        if (measure && metricId) {
          await write(id, async (etag) => (await client.request("patch", "/api/v1/goals/{id}/metrics/{childId}", { path: { id, childId: metricId }, header: { "If-Match": etag }, body: { unit: measure.unit.trim().slice(0, 30), target: decimal(measure.target), current: decimal(measure.current) } })).data.revision);
        } else if (measure) await addMeasure(id, measure);
        else if (metricId) await write(id, async (etag) => (await client.request("delete", "/api/v1/goals/{id}/metrics/{childId}", { path: { id, childId: metricId }, header: { "If-Match": etag }, body: {} })).data);
        await mapErrors(() => refreshProgress(known.get(id)!));
      }
      return toGoal(known.get(id)!);
    },

    async setLifecycle(id, lifecycle) {
      if (!(lifecycle in STATUS)) invalid(`Bad lifecycle "${lifecycle}"`);
      const entry = await knownOrLoad(id);
      if (LIFECYCLE[entry.dto.status] === lifecycle) return toGoal(entry);
      return toGoal(await patchGoal(id, { status: STATUS[lifecycle] }));
    },

    async addMilestone(goalId, input, index) {
      if (!input.title.trim()) invalid("A milestone needs a title");
      checkDay(input.dueDay);
      const entry = await knownOrLoad(goalId);
      const at = index === undefined ? entry.milestones.length : Math.max(0, Math.min(entry.milestones.length, index));
      await postMilestone(goalId, input, at);
      // Positions shift on the server: read the journey and the progress back.
      return toGoal(await reload(goalId));
    },

    async setMilestoneDone(goalId, milestoneId, done) {
      const entry = await knownOrLoad(goalId);
      if (!entry.milestones.some((item) => item.id === milestoneId)) throw new RepositoryError("not-found", `No milestone "${milestoneId}"`);
      await write(goalId, async (etag, current) => {
        const { data } = await client.request("patch", "/api/v1/goals/{id}/milestones/{childId}", { path: { id: goalId, childId: milestoneId }, header: { "If-Match": etag }, body: { status: done ? "COMPLETED" : "OPEN" } });
        current.milestones = current.milestones.map((item) => (item.id === milestoneId ? data.item : item));
        return data.revision;
      });
      await mapErrors(() => refreshProgress(known.get(goalId)!));
      return toGoal(known.get(goalId)!);
    },

    async tasks(goalId) {
      const entry = await reload(goalId);
      const linked = (await Promise.all([...entry.links.keys()].map((id) => tasks.get(id)))).filter((task): task is Task => task !== null);
      const rank = (task: Task) => (task.status === "done" ? 2 : task.date ? 0 : 1);
      linked.sort((a, b) => rank(a) - rank(b) || (a.date ?? "").localeCompare(b.date ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));
      return linked.map((task) => ({ ...task, goalId, goalTitle: entry.dto.title }));
    },

    goalOf(taskId) {
      const link = findLink(taskId);
      return link ? { goalId: link.goalId, goalTitle: known.get(link.goalId)!.dto.title } : undefined;
    },

    async ready() {
      loaded ??= loadAll();
      try {
        await loaded;
      } catch (error) {
        loaded = null;
        if (error instanceof ApiHttpError && error.status === 401) throw error;
      }
    },

    async setTaskGoal(taskId, taskRevision, goalId) {
      if (goalId) await knownOrLoad(goalId);
      const existing = findLink(taskId);
      if (existing?.goalId === goalId) return;
      if (existing) {
        await write(existing.goalId, async (etag, entry) => {
          const { data } = await client.request("delete", "/api/v1/goals/{id}/links/tasks/{childId}", { path: { id: existing.goalId, childId: existing.linkId }, header: { "If-Match": etag }, body: {} });
          entry.links.delete(taskId);
          return data;
        });
      }
      if (!goalId) return;
      const key = newIdempotencyKey();
      await write(goalId, async (etag, entry) => {
        const { data } = await client.request("post", "/api/v1/goals/{id}/links/tasks", { path: { id: goalId }, header: { "If-Match": etag, "Idempotency-Key": key }, body: { taskId, sourceRevision: taskRevision } });
        entry.links.set(taskId, data.item.id);
        return data.revision;
      });
    },
  };
  return repository;
}

/** A goal that was just created has no sources yet: 0%, without a request. */
function emptyProgress(dto: ApiGoal): ApiProgress {
  return { ruleVersion: 1, goalId: dto.id, goalRevision: dto.revision, mode: dto.progressMode, timezone: dto.timezone, computedAt: dto.createdAt, rawPercentage: "0", percentage: "0", weightSum: "0", reason: "NO_SOURCES", sources: [] };
}

/**
 * Tasks with their goal (live mode): `goalId` on create / update becomes a
 * Goal ⇄ Task link, and every task read carries the goal it is linked to.
 * A task that saved while its link failed is "partial" (the task is kept).
 */
export function withGoalLinks(tasks: ApiTasksRepository, goals: ApiGoalsRepository): ApiTasksRepository {
  const show = (task: Task): Task => {
    const goal = goals.goalOf(task.id);
    return goal ? { ...task, ...goal } : task;
  };
  const shown = async (load: Promise<Task[]>) => {
    const [list] = await Promise.all([load, goals.ready()]);
    return list.map(show);
  };

  async function link(task: Task, goalId: string | null): Promise<Task> {
    try {
      await goals.setTaskGoal(task.id, tasks.revisionOf(task.id), goalId);
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 401) throw error;
      throw new RepositoryError("partial", "Task saved, its goal link was not", { task: show(task) });
    }
    return show(task);
  }

  return {
    ...tasks,
    list: (query) => shown(tasks.list(query)),
    listUnscheduled: (query) => shown(tasks.listUnscheduled(query)),
    async get(id) {
      const [task] = await Promise.all([tasks.get(id), goals.ready()]);
      return task && show(task);
    },
    peek(id) {
      const task = tasks.peek(id);
      return task && show(task);
    },
    async create(input) {
      const { goalId, ...rest } = input;
      const task = await tasks.create(rest);
      return goalId ? link(task, goalId) : task;
    },
    async update(id, patch) {
      if (!("goalId" in patch)) return show(await tasks.update(id, patch));
      const { goalId, ...rest } = patch;
      await goals.ready();
      const task = Object.keys(rest).length ? await tasks.update(id, rest) : await tasks.get(id);
      if (!task) throw new RepositoryError("not-found", `No task "${id}"`);
      return link(task, goalId ?? null);
    },
    setDone: async (id, done) => show(await tasks.setDone(id, done)),
    bulkUpdate: async (ids, patch) => (await tasks.bulkUpdate(ids, patch)).map(show),
    addNote: async (id, body) => show(await tasks.addNote(id, body)),
  };
}
