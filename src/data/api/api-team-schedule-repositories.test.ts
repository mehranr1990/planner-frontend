import { describe, expect, it, vi } from "vitest";
import { typedAs } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-teams";
import {
  createApiTeamEvents,
  createApiTeamSprints,
  teamDueOverlays,
  teamPortfolio,
} from "./api-team-schedule-repositories";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Team events / time off, sprints and portfolio (1,045-op contract) against in-memory fakes (no network, not live evidence). */

const access = vi.fn();
vi.mock("./api-project-directory-repository", () => ({ createApiProjectDirectory: () => ({ access }) }));

const TEAM = "t1";
const member = (id: string, actorId: string, displayName: string) => ({
  id,
  actorId,
  displayName,
  role: "MEMBER",
  memberRole: "MEMBER",
  state: "ACTIVE",
  generation: 1,
  revision: 1,
});
const ROSTER = [member("a1", "u1", "Sara Ahmadi"), member("a2", "u2", "Reza Karimi"), member("a3", "u3", "Nima Rad")];
const timed = (day: string, start: string, end: string) => ({
  kind: "TIMED",
  timezone: "UTC",
  localStart: `${day}T${start}`,
  localEnd: `${day}T${end}`,
  startAt: `${day}T${start}:00.000Z`,
  endAt: `${day}T${end}:00.000Z`,
});
const event = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  title: "Sync",
  description: "https://meet.example/x",
  status: "ACTIVE",
  revision: 3,
  schedule: timed("2026-11-15", "10:00", "11:00"),
  ...over,
});
const meeting = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  teamId: TEAM,
  event: event(),
  agenda: "Roadmap\n\nRisks",
  revision: 2,
  createdByActorId: "u2",
  ...over,
});
const invite = (id: string, accessId: string, state: string) => ({
  id,
  member: { accessId, generation: 1 },
  meetingId: "m1",
  state,
  revision: 5,
  expiresAt: "2026-11-15T11:00:00.000Z",
});

/** Shared team reads: me = a1 (work.manage), the roster, an active team. */
function base(call: FakeCall, parts: string[]): Response | null {
  if (parts[2] === "access")
    return json({
      accessId: "a1",
      actorId: "u1",
      role: "LEAD",
      generation: 1,
      capabilities: ["task.read", "task.create", "work.manage"],
    });
  if (parts[2] === "memberships") return json({ items: ROSTER, nextCursor: null });
  if (parts.length === 2 && call.method === "GET") return json({ id: TEAM, state: "ACTIVE", revision: 1 });
  return null;
}

describe("team events adapter (TM-03)", () => {
  const api = () =>
    fakeApi((call, parts) => {
      const shared = base(call, parts);
      if (shared) return shared;
      if (parts[2] === "calendar" && parts.length === 3)
        return json({
          from: "x",
          to: "x",
          timezone: "UTC",
          items: [
            {
              identity: "e1",
              resourceId: "e1",
              kind: "EVENT",
              status: "ACTIVE",
              title: "Sync",
              schedule: timed("2026-11-15", "10:00", "11:00"),
            },
          ],
          nextCursor: null,
        });
      if (parts[2] === "meetings" && parts.length === 3) return json({ items: [meeting()], nextCursor: null });
      if (parts[4] === "invitations" && call.method === "GET")
        return json({ items: [invite("i1", "a1", "PENDING"), invite("i2", "a3", "DECLINED")], nextCursor: null });
      if (parts[2] === "meetings" && parts.length === 4) return json(meeting());
      if (parts[2] === "time-off" && call.method === "GET")
        return json({
          items: [
            {
              id: "o1",
              member: { accessId: "a2", generation: 1 },
              startDate: "2026-11-14",
              endDate: "2026-11-16",
              state: "APPROVED",
              revision: 1,
            },
          ],
          nextCursor: null,
        });
      if (parts[6] === "respond") return json(invite("i1", "a1", "ACCEPTED"));
      return err(404);
    });

  it("range: meetings with invitees / RSVP / agenda lines / link, and approved time off per day inside the range", async () => {
    const fake = api();
    const events = await createApiTeamEvents(typedAs<paths>(fake.client)).range(TEAM, "2026-11-15", "2026-11-16");
    const sync = events.find((entry) => entry.kind === "meeting")!;
    expect(sync).toMatchObject({
      id: "e1",
      title: "Sync",
      day: "2026-11-15",
      url: "https://meet.example/x",
      myRsvp: null,
      can: { edit: true, rsvp: true },
    });
    expect(sync.organiser?.name).toBe("Reza Karimi");
    expect(sync.invitees.map((entry) => [entry.person.name, entry.rsvp])).toEqual([
      ["Sara Ahmadi", null],
      ["Nima Rad", "no"],
    ]);
    expect(sync.agenda.map((item) => [item.title, item.owner, item.minutes])).toEqual([
      ["Roadmap", null, null],
      ["Risks", null, null],
    ]);
    // Time off 14–16 Nov clipped to the range; only APPROVED is asked for.
    expect(
      events.filter((entry) => entry.kind === "time-off").map((entry) => [entry.day, entry.personId, entry.can.edit]),
    ).toEqual([
      ["2026-11-15", "a2", false],
      ["2026-11-16", "a2", false],
    ]);
    expect(fake.calls.find((call) => call.path.endsWith("/time-off"))!.query.state).toBe("APPROVED");
    expect(fake.writes()).toEqual([]);
  });

  it("rsvp: maybe is refused without a request; going answers my invitation with its revision", async () => {
    const fake = api();
    const events = createApiTeamEvents(typedAs<paths>(fake.client));
    await events.range(TEAM, "2026-11-15", "2026-11-15");
    await expect(events.rsvp("e1", "maybe")).rejects.toMatchObject({ code: "unsupported" });
    expect(fake.writes()).toEqual([]);
    await events.rsvp("e1", "going");
    const respond = fake.calls.find((call) => call.path.endsWith("/respond"))!;
    expect([respond.path, respond.ifMatch, respond.body]).toEqual([
      `/teams/${TEAM}/meetings/m1/invitations/i1/respond`,
      '"5"',
      { decision: "ACCEPTED" },
    ]);
  });

  it("create: a meeting (link in the description) invites every other active member; own time off is a request", async () => {
    const soon = new Date(Date.now() + 3_600_000);
    const day = soon.toISOString().slice(0, 10);
    const fake = fakeApi((call, parts) => {
      const shared = base(call, parts);
      if (shared) return shared;
      if (parts[2] === "meetings" && call.method === "POST" && parts.length === 3)
        return json(meeting({ event: event({ schedule: timed(day, "00:00", "23:00") }) }), 201);
      if (parts[4] === "invitations" && call.method === "POST")
        return json(invite("ix", String((call.body.member as { accessId: string }).accessId), "PENDING"), 201);
      if (parts[4] === "invitations") return json({ items: [], nextCursor: null });
      if (parts[2] === "meetings" && parts.length === 4) return json(meeting());
      if (parts[2] === "time-off" && call.method === "POST")
        return json(
          {
            id: "o9",
            member: { accessId: "a1", generation: 1 },
            startDate: day,
            endDate: day,
            state: "PENDING",
            revision: 1,
          },
          201,
        );
      return err(404);
    });
    const events = createApiTeamEvents(typedAs<paths>(fake.client));
    await events.create(TEAM, {
      kind: "meeting",
      title: " Sync ",
      day,
      time: "10:00",
      end: "11:00",
      url: "https://meet.example/x",
    });
    const create = fake.calls.find((call) => call.method === "POST" && call.path === `/teams/${TEAM}/meetings`)!;
    expect(create.key).toBeTruthy();
    expect(create.body).toMatchObject({
      event: {
        title: "Sync",
        description: "https://meet.example/x",
        schedule: { kind: "TIMED", localStart: `${day}T10:00`, localEnd: `${day}T11:00` },
      },
      agenda: "",
    });
    const invites = fake.calls.filter((call) => call.method === "POST" && call.path.endsWith("/invitations"));
    expect(invites.map((call) => [(call.body.member as { accessId: string }).accessId, call.ifMatch])).toEqual([
      ["a2", '"2"'],
      ["a3", '"2"'],
    ]);
    expect(Date.parse(String(invites[0]!.body.expiresAt))).toBeLessThanOrEqual(Date.now() + 7 * 86_400_000);
    const off = await events.create(TEAM, { kind: "time-off", title: "", day, time: null, end: null });
    expect(fake.calls.find((call) => call.path.endsWith("/time-off"))!.body).toMatchObject({
      startDate: day,
      endDate: day,
      minutesPerDay: null,
      reason: null,
    });
    expect(off).toMatchObject({ kind: "time-off", personId: "a1", can: { edit: false } });
  });

  it("overlays: due dates of open team tasks in the range", async () => {
    const row = (id: string, dueAt: string | null, boardState: string) => ({
      task: { id, title: `Task ${id}`, deletedAt: null, revision: 1, priority: "NONE" },
      boardState,
      dueAt,
      items: [],
      estimatedMinutes: null,
    });
    const fake = fakeApi((call, parts) => {
      const shared = base(call, parts);
      if (shared) return shared;
      if (parts[2] === "task-planning")
        return json({
          items: [
            row("k1", "2026-11-15T20:00:00.000Z", "BLOCKED"),
            row("k2", "2026-11-15T20:00:00.000Z", "DONE"),
            row("k3", null, "TODO"),
          ],
          nextCursor: null,
        });
      if (parts[2] === "dependencies") return json({ edges: [] });
      return json({ items: [], nextCursor: null });
    });
    const overlays = await teamDueOverlays(typedAs<paths>(fake.client), TEAM, "2026-11-14", "2026-11-20");
    expect(overlays.map((entry) => entry.kind === "task-due" && [entry.taskId, entry.blocked])).toEqual([["k1", true]]);
  });
});

describe("team sprints adapter (TM-05)", () => {
  const plan = (id: string, state: string, startDate: string, endDate: string) => ({
    id,
    kind: "SPRINT",
    title: id,
    startDate,
    endDate,
    timezone: "UTC",
    state,
    revision: 7,
  });
  const summary = (over: Record<string, unknown> = {}) => ({
    planId: "s1",
    kind: "SPRINT",
    state: "ACTIVE",
    revision: 4,
    sprintNumber: 3,
    focus: [],
    goal: "Ship widgets",
    planned: 2,
    done: 1,
    canceled: 0,
    blocked: 0,
    review: 0,
    carriedIn: 0,
    addedAfterPublish: 0,
    carriedOut: { toPlan: 1, toBacklog: 0 },
    plannedMinutes: 600,
    doneMinutes: 240,
    unknownEstimates: 0,
    closedAt: null,
    days: [{ date: "2000-01-01", scheduled: 1, completed: 0, remainingMinutes: 600 }],
    unfinished: [{ itemId: "w1", itemRevision: 9, taskId: "k1", title: "A", sourceRevision: 2, boardState: "TODO" }],
    asOf: "x",
    ...over,
  });
  const sprintApi = (mode: "SPRINTS" | "WEEKLY", plans: unknown[]) =>
    fakeApi((call, parts) => {
      const shared = base(call, parts);
      if (shared) return shared;
      if (parts[2] === "settings") return json({ planningMode: mode, estimateUnit: "HOURS", revision: 1 });
      if (parts[2] === "plans" && parts.length === 3 && call.method === "GET")
        return json({ items: plans, nextCursor: null });
      if (parts[2] === "plans" && parts.length === 3 && call.method === "POST")
        return json(
          { ...plan("s2", "DRAFT", String(call.body.startDate), String(call.body.endDate)), revision: 1 },
          201,
        );
      if (parts[4] === "summary") return json(summary({ planId: parts[3] }));
      if (parts[2] === "plans" && parts.length === 4)
        return json(plan(parts[3]!, "ACTIVE", "2026-11-08", "2026-11-21"));
      if (parts[2] === "capacity")
        return json({
          members: [
            { member: { accessId: "a1" }, totals: { netAvailableMinutes: 1800 } },
            { member: { accessId: "a2" }, totals: { netAvailableMinutes: 1200 } },
          ],
        });
      if (parts[2] === "task-planning")
        return json({
          items: [
            {
              task: { id: "k1", title: "A", deletedAt: null, revision: 2, priority: "NONE" },
              boardState: "TODO",
              dueAt: null,
              estimatedMinutes: 120,
              items: [{ id: "w1", planId: "s1" }],
            },
          ],
          nextCursor: null,
        });
      if (parts[2] === "dependencies") return json({ edges: [] });
      if (call.method !== "GET") return json({});
      return json({ items: [], nextCursor: null });
    });

  it("refuses when the team plans weekly (Settings › Planning)", async () => {
    const fake = sprintApi("WEEKLY", []);
    await expect(createApiTeamSprints(typedAs<paths>(fake.client)).current(TEAM)).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("current: hours from the plan summary, capacity from the capacity summary, items of the sprint plan", async () => {
    const fake = sprintApi("SPRINTS", [
      plan("s0", "CLOSED", "2026-10-25", "2026-11-07"),
      plan("s1", "ACTIVE", "2026-11-08", "2026-11-21"),
    ]);
    const state = await createApiTeamSprints(typedAs<paths>(fake.client)).current(TEAM);
    expect(state.unit).toBe("hours");
    expect(state.sprint).toMatchObject({
      id: "s1",
      number: 3,
      goal: "Ship widgets",
      committed: 10,
      done: 4,
      capacity: 50,
    });
    expect(state.sprint!.items).toMatchObject([{ taskId: "k1", estimate: 2, status: "todo" }]);
    // Next sprint: the day after the active one, same length (14 days).
    expect([state.next.start, state.next.end, state.next.number]).toEqual(["2026-11-22", "2026-12-05", 3]);
    expect(fake.writes()).toEqual([]);
  });

  it("start: conflict while one is active; otherwise draft → goal → ACTIVE", async () => {
    await expect(
      createApiTeamSprints(
        typedAs<paths>(sprintApi("SPRINTS", [plan("s1", "ACTIVE", "2026-11-08", "2026-11-21")]).client),
      ).start(TEAM, { goal: "x" }),
    ).rejects.toMatchObject({ code: "conflict" });
    const fake = sprintApi("SPRINTS", [plan("s0", "CLOSED", "2026-10-25", "2026-11-07")]);
    await createApiTeamSprints(typedAs<paths>(fake.client)).start(TEAM, { goal: " Ship " });
    const writes = fake.calls.filter((call) => call.method !== "GET");
    expect(writes.map((call) => [call.method, call.path.split("/").slice(3).join("/") || "plans"])).toEqual([
      ["POST", "plans"],
      ["PUT", "plans/s2/planning"],
      ["PATCH", "plans/s2"],
    ]);
    expect(writes[0]!.body).toMatchObject({ kind: "SPRINT" });
    expect([writes[1]!.body, writes[1]!.ifMatch]).toEqual([{ goal: "Ship" }, '"4"']);
    expect(writes[2]!.body).toEqual({ state: "ACTIVE" });
  });

  it("complete: unfinished items are carried over first (backlog by default), then the sprint closes", async () => {
    const fake = sprintApi("SPRINTS", [plan("s1", "ACTIVE", "2026-11-08", "2026-11-21")]);
    const review = await createApiTeamSprints(typedAs<paths>(fake.client)).complete(TEAM, "s1", {});
    const writes = fake.calls.filter((call) => call.method !== "GET");
    expect(writes.map((call) => [call.method, call.path.split("/").slice(3).join("/"), call.ifMatch])).toEqual([
      ["POST", "plans/s1/items/w1/carry-over", '"9"'],
      ["PATCH", "plans/s1", '"7"'],
    ]);
    expect(writes[0]!.body).toEqual({ decision: "BACKLOG", targetPlanId: null, sourceRevision: 2 });
    expect(review).toMatchObject({ sprintId: "s1", number: 3, committed: 10, done: 4, movedToNext: 1 });
  });
});

describe("team portfolio (TM-06)", () => {
  it("only active links whose project the viewer can open; figures from the project, team people from project-summaries", async () => {
    access.mockReset();
    access.mockImplementation(async (id: string) =>
      id === "p1"
        ? {
            status: "ok",
            project: {
              id: "p1",
              name: "Apollo",
              progress: { percent: 40 },
              health: null,
              lifecycle: "active",
              initials: "AP",
              tint: "blue",
              role: "member",
              nextMilestone: { title: "Beta", due: "2026-12-01" },
              startDate: "2026-10-01",
              endDate: null,
              openHighRisks: 2,
            },
          }
        : { status: "not-available" },
    );
    const fake = fakeApi((call, parts) => {
      const shared = base(call, parts);
      if (shared) return shared;
      if (parts[2] === "projects")
        return json({
          items: [
            { link: { projectId: "p1", active: true } },
            { link: { projectId: "p2", active: true } },
            { link: { projectId: "p3", active: false } },
          ],
          nextCursor: null,
        });
      if (parts[2] === "project-summaries")
        return json({
          items: [{ projectId: "p1", commonMembers: [{ member: { accessId: "a2" }, projectAccessId: "x" }] }],
          nextCursor: null,
        });
      return err(404);
    });
    const rows = await teamPortfolio(typedAs<paths>(fake.client), fake.client, TEAM);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "p1",
      percent: 40,
      health: null,
      relation: "linked",
      role: "member",
      nextMilestone: { title: "Beta", due: "2026-12-01" },
      endDate: null,
      openHighRisks: 2,
    });
    expect(rows[0]!.teamPeople.map((person) => person.name)).toEqual(["Reza Karimi"]);
    expect(access.mock.calls.map(([id]) => id)).toEqual(["p1", "p2"]);
  });
});

describe("team time off + event cancel (TM-03)", () => {
  const request = (over: Record<string, unknown> = {}) => ({
    id: "o2",
    member: { accessId: "a2", generation: 1 },
    startDate: "2026-11-20",
    endDate: "2026-11-21",
    minutesPerDay: null,
    reason: "Family",
    state: "PENDING",
    decisionNote: null,
    decidedAt: null,
    revision: 4,
    createdAt: "2026-11-10T08:00:00.000Z",
    can: { decide: true, cancel: false },
    ...over,
  });
  const mine = request({
    id: "o3",
    member: { accessId: "a1", generation: 1 },
    revision: 1,
    createdAt: "2026-11-09T08:00:00.000Z",
    can: { decide: false, cancel: true },
  });
  const calendarItem = {
    identity: "e1",
    resourceId: "e1",
    kind: "EVENT",
    status: "ACTIVE",
    title: "Sync",
    schedule: timed("2026-11-15", "10:00", "11:00"),
  };

  const timeOffApi = (decision: () => Response) =>
    fakeApi((call, parts) => {
      const shared = base(call, parts);
      if (shared) return shared;
      if (parts[2] === "time-off" && parts.length === 3) return json({ items: [mine, request()], nextCursor: null });
      if (parts[4] === "decision") return decision();
      if (parts[4] === "cancel")
        return json({ ...mine, state: "CANCELED", revision: 2, can: { decide: false, cancel: false } });
      if (parts[4] === "history")
        return json({
          items: [
            { id: "h2", action: "APPROVED", by: { accessId: "a1", generation: 1 }, createdAt: "2026-11-11T08:00:00.000Z" },
            { id: "h1", action: "SUBMITTED", by: { accessId: "a2", generation: 1 }, createdAt: "2026-11-10T08:00:00.000Z" },
          ],
          nextCursor: null,
        });
      return err(404);
    });

  it("lists every state with the server rights (decide / cancel), newest first", async () => {
    const fake = timeOffApi(() => err(500));
    const list = await createApiTeamEvents(typedAs<paths>(fake.client)).timeOff(TEAM);
    expect(list.map((row) => [row.id, row.person.name, row.mine, row.state, row.can])).toEqual([
      ["o2", "Reza Karimi", false, "pending", { decide: true, cancel: false }],
      ["o3", "Sara Ahmadi", true, "pending", { decide: false, cancel: true }],
    ]);
    // No state filter here: pending / rejected / canceled requests are listed, never shown on the calendar.
    expect(fake.calls.find((call) => call.path.endsWith("/time-off"))!.path).not.toContain("state=");
  });

  it("manager approves and rejects with the read revision; a 409 is a conflict", async () => {
    let answer = () => json(request({ state: "APPROVED", revision: 5, can: { decide: false, cancel: false } }));
    const fake = timeOffApi(() => answer());
    const events = createApiTeamEvents(typedAs<paths>(fake.client));
    await expect(events.decideTimeOff(TEAM, "o2", "approve", null)).rejects.toMatchObject({ code: "not-found" });
    await events.timeOff(TEAM);
    const approved = await events.decideTimeOff(TEAM, "o2", "approve", null);
    expect(approved).toMatchObject({ state: "approved", can: { decide: false } });
    const first = fake.calls.find((call) => call.path.endsWith("/decision"))!;
    expect([first.ifMatch, first.body]).toEqual(['"4"', { decision: "APPROVE", note: null }]);

    answer = () => json(request({ state: "REJECTED", decisionNote: "Release week", revision: 6 }));
    const rejected = await events.decideTimeOff(TEAM, "o2", "reject", "  Release week ");
    expect(rejected).toMatchObject({ state: "rejected", decisionNote: "Release week" });
    const second = fake.calls.filter((call) => call.path.endsWith("/decision"))[1]!;
    expect([second.ifMatch, second.body]).toEqual(['"5"', { decision: "REJECT", note: "Release week" }]);

    answer = () => err(409, "TIME_OFF_CLOSED");
    await expect(events.decideTimeOff(TEAM, "o2", "approve", null)).rejects.toMatchObject({ code: "conflict" });
    answer = () => err(403, "SELF_DECISION_FORBIDDEN");
    await expect(events.decideTimeOff(TEAM, "o2", "approve", null)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("member cancels their own request; history maps actions and people, oldest first", async () => {
    const fake = timeOffApi(() => err(500));
    const events = createApiTeamEvents(typedAs<paths>(fake.client));
    await events.timeOff(TEAM);
    const canceled = await events.cancelTimeOff(TEAM, "o3");
    expect(canceled).toMatchObject({ state: "canceled", mine: true, can: { cancel: false } });
    const call = fake.calls.find((entry) => entry.path.endsWith("/cancel"))!;
    expect([call.method, call.ifMatch, call.body]).toEqual(["POST", '"1"', {}]);
    const steps = await events.timeOffHistory(TEAM, "o3");
    expect(steps.map((step) => [step.action, step.by?.name])).toEqual([
      ["submitted", "Reza Karimi"],
      ["approved", "Sara Ahmadi"],
    ]);
  });

  const calendarApi = (current: Record<string, unknown>, remove: () => Response, capabilities?: string[]) =>
    fakeApi((call, parts) => {
      if (capabilities && parts[2] === "access")
        return json({ accessId: "a1", actorId: "u1", role: "MEMBER", generation: 1, capabilities });
      const shared = base(call, parts);
      if (shared) return shared;
      if (parts[2] === "calendar" && parts.length === 3)
        return json({ from: "x", to: "x", timezone: "UTC", items: [calendarItem], nextCursor: null });
      if (parts[2] === "meetings" && parts.length === 3) return json({ items: [meeting()], nextCursor: null });
      if (parts[4] === "invitations") return json({ items: [], nextCursor: null });
      if (parts[2] === "time-off")
        return json({
          items: [request({ state: "APPROVED", startDate: "2026-11-15", endDate: "2026-11-15" })],
          nextCursor: null,
        });
      if (parts[3] === "events" && call.method === "GET") return json(event(current));
      if (parts[3] === "events" && call.method === "DELETE") return remove();
      return err(404);
    });

  it("event cancel: DELETE with the seen revision, once; already canceled / changed / 409 are conflicts", async () => {
    const ok = calendarApi({}, () => json({ id: "e1", removed: true }));
    const events = createApiTeamEvents(typedAs<paths>(ok.client));
    const sync = (await events.range(TEAM, "2026-11-15", "2026-11-15")).find((entry) => entry.kind === "meeting");
    expect(sync!.can.cancel).toBe(true);
    await events.cancel("e1");
    const remove = ok.calls.find((call) => call.method === "DELETE")!;
    expect([remove.path.endsWith("/calendar/events/e1"), remove.ifMatch]).toEqual([true, '"3"']);
    // Forgotten after success: a repeated click cannot send a second DELETE.
    await expect(events.cancel("e1")).rejects.toMatchObject({ code: "not-found" });
    expect(ok.calls.filter((call) => call.method === "DELETE")).toHaveLength(1);

    const cases: [Record<string, unknown>, (() => Response) | null][] = [
      [{ status: "CANCELED" }, null],
      [{ revision: 4 }, null],
      [{}, () => err(409)],
    ];
    for (const [current, response] of cases) {
      const fake = calendarApi(current, response ?? (() => json({ id: "e1", removed: true })));
      const repo = createApiTeamEvents(typedAs<paths>(fake.client));
      await repo.range(TEAM, "2026-11-15", "2026-11-15");
      await expect(repo.cancel("e1")).rejects.toMatchObject({ code: "conflict" });
      if (!response) expect(fake.calls.some((call) => call.method === "DELETE")).toBe(false);
    }
  });

  it("event cancel is not offered without work.manage, nor for time off", async () => {
    const fake = calendarApi({}, () => json({ id: "e1", removed: true }), ["task.read"]);
    const events = createApiTeamEvents(typedAs<paths>(fake.client));
    const list = await events.range(TEAM, "2026-11-15", "2026-11-15");
    expect(list.map((entry) => [entry.kind, entry.can.cancel])).toEqual([
      ["time-off", false],
      ["meeting", false],
    ]);
    const off = list.find((entry) => entry.kind === "time-off")!;
    await expect(events.cancel(off.id)).rejects.toMatchObject({ code: "unsupported" });
    expect(fake.calls.some((call) => call.method === "DELETE")).toBe(false);
  });
});
