import { describe, expect, it } from "vitest";
import type { Task } from "../domain";
import { createApiGoalsRepository, withGoalLinks } from "./api-goals-repository";
import type { ApiTasksRepository } from "./api-tasks-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Goals adapter against an in-memory fake of the documented /goals contract (no network). */

const TODAY = "2026-11-12";

interface FakeGoal {
  dto: Record<string, unknown> & { id: string; revision: number; title: string; status: string; progressMode: string; metricId: string | null };
  milestones: { id: string; title: string; position: number; targetDate: string | null; status: string; contributes: boolean; completedAt: string | null }[];
  metrics: { id: string; unit: string; baseline: string; target: string; current: string }[];
  links: { id: string; taskId: string }[];
}

function backend() {
  const goals = new Map<string, FakeGoal>();
  const areas: { id: string; title: string; status: string }[] = [{ id: "a1", title: "Health", status: "ACTIVE" }];
  let seq = 0;
  /** Makes the next nested write answer 409 once (a stale revision). */
  const state = { conflictOnce: false, failLinks: false };

  function seed(id: string, over: Record<string, unknown> = {}): FakeGoal {
    const goal: FakeGoal = {
      dto: { id, revision: 1, title: `Goal ${id}`, description: null, horizon: "SHORT_TERM", status: "ACTIVE", lifeAreaId: null, targetDate: null, progressMode: "WEIGHTED", manualProgress: null, metricId: null, timezone: "Asia/Tehran", createdAt: `2026-10-0${goals.size + 1}T08:00:00.000Z`, updatedAt: "2026-10-01T08:00:00.000Z", ...over },
      milestones: [],
      metrics: [],
      links: [],
    };
    goals.set(id, goal);
    return goal;
  }

  function progress(goal: FakeGoal) {
    const metric = goal.metrics.find((item) => item.id === goal.dto.metricId);
    const counted = goal.milestones.filter((item) => item.contributes);
    const percentage = goal.dto.progressMode === "METRIC" && metric ? (Number(metric.current) / Number(metric.target)) * 100 : counted.length ? (counted.filter((item) => item.status === "COMPLETED").length / counted.length) * 100 : 0;
    return { percentage: String(percentage), reason: "OK", sources: metric && goal.dto.progressMode === "METRIC" ? [{ kind: "METRIC", sourceId: metric.id, metric }] : [] };
  }

  function handle(call: FakeCall, parts: string[]): Response {
    const { method, body } = call;
    if (parts[0] === "life-areas") {
      if (method === "GET") return json({ items: areas, nextCursor: null });
      const area = { id: `a${areas.length + 1}`, title: String(body.title), status: "ACTIVE" };
      areas.push(area);
      return json(area, 201);
    }
    if (parts.length === 1) {
      if (method === "GET") return json({ items: [...goals.values()].map((goal) => goal.dto), nextCursor: null });
      return json(seed(`g${++seq}`, { ...body, createdAt: "2026-11-12T08:00:00.000Z" }).dto, 201);
    }
    const goal = goals.get(parts[1]);
    if (!goal) return err(404);
    const [, , child, a, b] = parts;
    if (method === "GET") {
      if (!child) return json(goal.dto);
      if (child === "milestones") return json({ goalRevision: goal.dto.revision, items: goal.milestones });
      if (child === "progress") return json(progress(goal));
      return json({ goalRevision: goal.dto.revision, items: goal.links });
    }
    if (state.conflictOnce) {
      state.conflictOnce = false;
      goal.dto.revision += 1;
      return err(409);
    }
    if (call.ifMatch !== `"${goal.dto.revision}"`) return err(409);
    goal.dto.revision += 1;
    const revision = goal.dto.revision;
    if (!child) {
      Object.assign(goal.dto, body);
      return json(goal.dto);
    }
    if (child === "milestones") {
      if (method === "POST") {
        const item = { id: `m${++seq}`, title: String(body.title), position: Number(body.position), targetDate: (body.targetDate as string | null) ?? null, status: "OPEN", contributes: body.contributes === true, completedAt: null };
        goal.milestones.splice(item.position, 0, item);
        goal.milestones.forEach((entry, index) => (entry.position = index));
        return json({ id: item.id, revision, item }, 201);
      }
      const item = goal.milestones.find((entry) => entry.id === a);
      if (!item) return err(404);
      item.status = String(body.status);
      item.completedAt = item.status === "COMPLETED" ? "2026-11-10T12:00:00.000Z" : null;
      return json({ id: item.id, revision, item });
    }
    if (child === "metrics") {
      if (method === "POST") {
        const item = { id: `x${++seq}`, unit: String(body.unit), baseline: String(body.baseline), target: String(body.target), current: String(body.current) };
        goal.metrics.push(item);
        return json({ id: item.id, revision, item }, 201);
      }
      if (method === "DELETE") {
        if (goal.dto.metricId === a) return err(422);
        goal.metrics = goal.metrics.filter((entry) => entry.id !== a);
        return json(goal.dto);
      }
      const item = goal.metrics.find((entry) => entry.id === a)!;
      Object.assign(item, body);
      return json({ id: item.id, revision, item });
    }
    // links/tasks
    if (state.failLinks) return err(422);
    if (method === "POST") {
      const item = { id: `l${++seq}`, taskId: String(body.taskId) };
      goal.links.push(item);
      return json({ id: item.id, revision, item }, 201);
    }
    goal.links = goal.links.filter((entry) => entry.id !== b);
    return json(goal.dto);
  }

  return { goals, areas, seed, state, handle };
}

const task = (id: string, over: Partial<Task> = {}) => ({ id, title: `Task ${id}`, status: "todo", date: null, time: null, ...over }) as Task;

function setup() {
  const fake = backend();
  const api = fakeApi((call, parts) => fake.handle(call, parts[0] === "goals" || parts[0] === "life-areas" ? parts : []));
  const store = new Map<string, Task>();
  const created: unknown[] = [];
  const tasks = {
    get: async (id: string) => store.get(id) ?? null,
    peek: (id: string) => store.get(id),
    list: async () => [...store.values()],
    listUnscheduled: async () => [],
    revisionOf: () => 7,
    create: async (input: Record<string, unknown>) => {
      created.push(input);
      const made = task(`t${store.size + 1}`, { title: String(input.title) });
      store.set(made.id, made);
      return made;
    },
    update: async (id: string) => store.get(id)!,
  } as unknown as ApiTasksRepository;
  const goals = createApiGoalsRepository(api.client, { today: () => TODAY, tasks });
  return { ...fake, ...api, fakeGoals: fake.goals, store, created, tasks, goals };
}

describe("goals adapter", () => {
  it("lists goals by lifecycle with area, journey, progress and lateness", async () => {
    const t = setup();
    const a = t.seed("ga", { lifeAreaId: "a1", targetDate: "2026-11-02", description: "Why" });
    a.milestones.push(
      { id: "m1", title: "One", position: 0, targetDate: "2026-10-20", status: "COMPLETED", contributes: true, completedAt: "2026-10-19T12:00:00.000Z" },
      { id: "m2", title: "Two", position: 1, targetDate: "2026-11-01", status: "OPEN", contributes: true, completedAt: null },
    );
    t.seed("gb", { status: "PAUSED" });
    t.seed("gc", { status: "COMPLETED" });
    t.seed("gd", { status: "ABANDONED" });

    const active = await t.goals.list();
    expect(active.map((goal) => goal.id)).toEqual(["gb", "ga"]);
    expect(active[1]).toMatchObject({ area: "Health", progress: 0.5, status: "behind", behindDays: 10, nextStep: "Two", nextStepDay: "2026-11-01", dueDay: "2026-11-02", notes: "Why", lifecycle: "active" });
    expect(active[1].milestones).toEqual([
      { id: "m1", title: "One", dueDay: "2026-10-20", doneDay: "2026-10-19" },
      { id: "m2", title: "Two", dueDay: "2026-11-01", doneDay: null },
    ]);
    expect((await t.goals.list("completed")).map((goal) => [goal.id, goal.progress])).toEqual([["gc", 1]]);
    expect((await t.goals.list("archived")).map((goal) => goal.id)).toEqual(["gd"]);
    expect(t.writes()).toEqual([]);
  });

  it("creates a goal with a measure and milestones, chaining the goal revision", async () => {
    const t = setup();
    const goal = await t.goals.create({ title: " Read more ", area: "Learning", dueDay: "2027-03-01", notes: "n", measure: { current: 3, target: 12, unit: "books" }, milestones: [{ title: "First", dueDay: "2026-12-01" }, { title: "Second", dueDay: null }] });

    expect(t.writes()).toEqual(["POST /life-areas", "POST /goals", "POST /goals/g1/metrics", "PATCH /goals/g1", "POST /goals/g1/milestones", "POST /goals/g1/milestones"]);
    const writes = t.calls.filter((call) => call.method !== "GET");
    expect(writes[1].body).toMatchObject({ title: "Read more", horizon: "SHORT_TERM", status: "ACTIVE", lifeAreaId: "a2", targetDate: "2027-03-01", progressMode: "WEIGHTED", description: "n" });
    expect(writes[2].body).toMatchObject({ unit: "books", baseline: "0", target: "12", current: "3", contributes: true });
    expect(writes[3].body).toMatchObject({ progressMode: "METRIC" });
    expect(writes[4].body).toMatchObject({ title: "First", position: 0, targetDate: "2026-12-01", contributes: true });
    expect(writes.slice(2).map((call) => call.ifMatch)).toEqual(['"1"', '"2"', '"3"', '"4"']);
    expect(writes.filter((call) => call.method === "POST").every((call) => call.key)).toBe(true);
    expect(goal).toMatchObject({ id: "g1", title: "Read more", area: "Learning", progress: 0.25, measure: { current: 3, target: 12, unit: "books" }, nextStep: "Second", lifecycle: "active" });
    expect(goal.milestones?.map((item) => item.title)).toEqual(["First", "Second"]);
  });

  it("picks LONG_TERM without a near deadline and refuses what the API cannot hold", async () => {
    const t = setup();
    await t.goals.create({ title: "Someday" });
    expect(t.calls.find((call) => call.method === "POST")!.body).toMatchObject({ horizon: "LONG_TERM", targetDate: null, lifeAreaId: null });
    const before = t.calls.length;
    await expect(t.goals.create({ title: "X", target: "Run 10k" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(t.goals.create({ title: " " })).rejects.toMatchObject({ code: "invalid" });
    await expect(t.goals.create({ title: "X", measure: { current: 0, target: 0, unit: "km" } })).rejects.toMatchObject({ code: "invalid" });
    expect(t.calls.length).toBe(before);
  });

  it("marks a milestone done, recovering once from a stale revision", async () => {
    const t = setup();
    const g = t.seed("ga");
    g.milestones.push({ id: "m1", title: "One", position: 0, targetDate: null, status: "OPEN", contributes: true, completedAt: null });
    await t.goals.list();
    t.state.conflictOnce = true;

    const goal = await t.goals.setMilestoneDone("ga", "m1", true);
    expect(t.writes()).toEqual(["PATCH /goals/ga/milestones/m1", "PATCH /goals/ga/milestones/m1"]);
    expect(goal).toMatchObject({ progress: 1, nextStep: null });
    expect(goal.milestones?.[0].doneDay).toBe("2026-11-10");
    expect((await t.goals.setMilestoneDone("ga", "m1", false)).progress).toBe(0);
    await expect(t.goals.setMilestoneDone("ga", "nope", true)).rejects.toMatchObject({ code: "not-found" });
  });

  it("adds a milestone at an index and reads the journey back", async () => {
    const t = setup();
    const g = t.seed("ga");
    g.milestones.push({ id: "m1", title: "One", position: 0, targetDate: null, status: "OPEN", contributes: true, completedAt: null });
    const goal = await t.goals.addMilestone("ga", { title: "Zero", dueDay: "2026-12-01" }, 0);
    expect(goal.milestones?.map((item) => item.title)).toEqual(["Zero", "One"]);
    await expect(t.goals.addMilestone("nope", { title: "A", dueDay: null })).rejects.toMatchObject({ code: "not-found" });
  });

  it("updates fields, swaps the measure and removes it in the documented order", async () => {
    const t = setup();
    t.seed("ga");
    await t.goals.list();
    let goal = await t.goals.update("ga", { title: "New", area: "health", dueDay: "2026-12-30", measure: { current: 1, target: 4, unit: "km" } });
    expect(goal).toMatchObject({ title: "New", area: "Health", dueDay: "2026-12-30", progress: 0.25, measure: { current: 1, target: 4, unit: "km" } });
    expect(t.writes()).toEqual(["PATCH /goals/ga", "POST /goals/ga/metrics", "PATCH /goals/ga"]);

    goal = await t.goals.update("ga", { measure: { current: 2, target: 4, unit: "km" } });
    expect(goal.progress).toBe(0.5);
    expect(t.writes().slice(3)).toEqual([expect.stringMatching(/^PATCH \/goals\/ga\/metrics\//)]);

    goal = await t.goals.update("ga", { measure: null, area: null });
    expect(goal.measure).toBeUndefined();
    expect(goal.area).toBeUndefined();
    expect(t.writes().slice(4)).toEqual(["PATCH /goals/ga", expect.stringMatching(/^DELETE \/goals\/ga\/metrics\//)]);
    expect(t.fakeGoals.get("ga")!.metrics.length).toBe(0);
    await expect(t.goals.update("ga", { target: "text" })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("maps the lifecycle and unknown goals", async () => {
    const t = setup();
    t.seed("ga");
    expect((await t.goals.setLifecycle("ga", "archived")).lifecycle).toBe("archived");
    expect(await t.goals.get("ga")).toMatchObject({ lifecycle: "archived" });
    expect(t.calls.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([{ status: "ABANDONED" }]);
    await t.goals.setLifecycle("ga", "archived");
    expect(t.writes().length).toBe(1);
    expect((await t.goals.setLifecycle("ga", "completed")).progress).toBe(1);
    expect(await t.goals.get("nope")).toBeNull();
    await expect(t.goals.setLifecycle("nope", "active")).rejects.toMatchObject({ code: "not-found" });
  });

  it("links tasks to goals and shows the goal on task reads", async () => {
    const t = setup();
    t.seed("ga");
    t.seed("gb");
    t.store.set("t1", task("t1", { date: "2026-11-13" }));
    t.store.set("t2", task("t2", { status: "done" }));
    const wrapped = withGoalLinks(t.tasks, t.goals);

    expect((await wrapped.update("t1", { goalId: "ga" })).goalId).toBe("ga");
    await wrapped.update("t2", { goalId: "ga" });
    const post = t.calls.find((call) => call.method === "POST")!;
    expect(post).toMatchObject({ path: "/goals/ga/links/tasks", body: { taskId: "t1", sourceRevision: 7 }, ifMatch: '"1"' });
    expect((await t.goals.tasks("ga")).map((item) => [item.id, item.goalTitle])).toEqual([["t1", "Goal ga"], ["t2", "Goal ga"]]);
    expect((await wrapped.list({} as never)).map((item) => item.goalId)).toEqual(["ga", "ga"]);

    await wrapped.update("t1", { goalId: "gb" });
    expect(t.writes().slice(2)).toEqual([expect.stringMatching(/^DELETE \/goals\/ga\/links\/tasks\//), "POST /goals/gb/links/tasks"]);
    expect(wrapped.peek("t1")?.goalId).toBe("gb");
    expect((await wrapped.update("t1", { goalId: null })).goalId).toBeUndefined();
    expect(t.goals.goalOf("t1")).toBeUndefined();
  });

  it("creates a task for a goal without sending goalId to the Tasks API", async () => {
    const t = setup();
    t.seed("ga");
    const wrapped = withGoalLinks(t.tasks, t.goals);
    const made = await wrapped.create({ title: "Step", goalId: "ga", source: "manual" } as never);
    expect(t.created).toEqual([{ title: "Step", source: "manual" }]);
    expect(made).toMatchObject({ goalId: "ga", goalTitle: "Goal ga" });

    t.state.failLinks = true;
    await expect(wrapped.create({ title: "Other", goalId: "ga" } as never)).rejects.toMatchObject({ code: "partial" });
    expect(t.store.size).toBe(2);
  });
});
