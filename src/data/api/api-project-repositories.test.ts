import { describe, expect, it } from "vitest";
import { createApiProjectRepositories } from "./api-project-repositories";
import { dayOfInstant as dayOf } from "@/lib/dates/clock-time";
import { err, fakeApi, json } from "./test-support";

/* Contract fakes for the Projects subset of P6-01: paths, If-Match and bodies as the contract states them. */

const P = "p1";
const live = (api: { client: Parameters<typeof createApiProjectRepositories>[0] }) => createApiProjectRepositories(api.client, { today: () => "2026-11-12" });
const edge = (over: Record<string, unknown> = {}) => ({ id: "e1", predecessorId: "t1", successorId: "t2", kind: "FS", lagMinutes: 1440, revision: 3, retiredAt: null, ...over });

describe("live Projects repositories", () => {
  it("refuses what the contract cannot answer, without a request", async () => {
    const api = fakeApi(() => err(500));
    const repos = live(api);
    await expect(repos.projects.setStatus(P, { health: "on-track", note: "" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.members.setCapacity(P, "m1", 30)).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.imports.undo(P, "b1")).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.settings.confirmTransfer(P, "pw")).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.projectTasks.reorder(P, ["t1"])).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.schedule.criticalPath(P)).rejects.toMatchObject({ code: "unsupported" });
    expect(api.calls).toEqual([]);
  });

  it("schedule graph: scheduled tasks, dated milestones, live edges", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "tasks" && parts.length === 3)
        return call.query.after
          ? json({ items: [{ id: "t3", title: "Gone", deletedAt: "2026-11-01T00:00:00.000Z" }], nextCursor: null })
          : json({ items: [{ id: "t1", title: "Plan", deletedAt: null }, { id: "t2", title: "Open", deletedAt: null }], nextCursor: "c2" });
      if (parts[4] === "schedule")
        return json(
          parts[3] === "t1"
            ? { id: "t1", revision: 7, plannedStartAt: "2026-11-10T08:00:00.000Z", dueAt: "2026-11-12T08:00:00.000Z", scheduledDate: null }
            : { id: "t2", revision: 1, plannedStartAt: null, dueAt: "2026-11-12T08:00:00.000Z", scheduledDate: null },
        );
      if (parts[2] === "components")
        return json({ items: [{ id: "m1", title: "Beta", targetDate: "2026-11-20", revision: 2 }, { id: "m2", title: "Later", targetDate: null, revision: 1 }], nextCursor: null });
      if (parts[2] === "dependencies") return json({ revision: 4, edges: [edge(), edge({ id: "e0", retiredAt: "2026-11-01T00:00:00.000Z" })] });
      return err(404);
    });
    const graph = await live(api).schedule.graph(P);
    expect(graph.items).toEqual([
      { id: "t1", kind: "task", title: "Plan", start: "2026-11-10", end: "2026-11-12", revision: 7 },
      { id: "m1", kind: "milestone", title: "Beta", start: "2026-11-20", end: "2026-11-20", revision: 2 },
    ]);
    expect(graph.links).toEqual([{ id: "e1", predecessorId: "t1", successorId: "t2", type: "FS", lagDays: 1 }]);
    expect(api.calls.some((call) => call.path === `/projects/${P}/components/milestones`)).toBe(true);
    expect(api.calls.some((call) => call.path.endsWith("/t3/schedule"))).toBe(false);
    expect(api.writes()).toEqual([]);
  });

  it("links: add, change the lag with If-Match (one retry on 409), refuse a type change, remove", async () => {
    let revision = 3;
    let patches = 0;
    const api = fakeApi((call, parts) => {
      if (call.method === "GET") return json({ revision: 4, edges: [edge({ revision })] });
      if (call.method === "POST") return json(edge({ ...call.body, revision: 1 }), 201);
      if (call.method === "PATCH") {
        if (patches++ === 0) return ((revision = 5), err(409));
        return json(edge({ lagMinutes: call.body.lagMinutes, revision: 6 }));
      }
      if (call.method === "DELETE" && parts[3] === "e1") return json(null, 204);
      return err(404);
    });
    const { schedule } = live(api);

    const added = await schedule.addLink(P, { predecessorId: "t1", successorId: "t2", type: "SS", lagDays: 2 });
    expect(added).toMatchObject({ predecessorId: "t1", successorId: "t2", type: "SS", lagDays: 2 });
    const post = api.calls.find((call) => call.method === "POST")!;
    expect(post.path).toBe(`/projects/${P}/dependencies`);
    expect(post.body).toMatchObject({ id: added.id, kind: "SS", lagMinutes: 2880 });

    expect(await schedule.updateLink(P, "e1", { type: "FS", lagDays: 3 })).toMatchObject({ id: "e1", lagDays: 3 });
    expect(api.calls.filter((call) => call.method === "PATCH").map((call) => [call.ifMatch, call.body])).toEqual([
      ['"3"', { lagMinutes: 4320 }],
      ['"5"', { lagMinutes: 4320 }],
    ]);

    await expect(schedule.updateLink(P, "e1", { type: "FF", lagDays: 0 })).rejects.toMatchObject({ code: "unsupported" });
    await expect(schedule.updateLink(P, "nope", { type: "FS", lagDays: 0 })).rejects.toMatchObject({ code: "not-found" });

    await schedule.removeLink(P, "e1");
    const del = api.calls.find((call) => call.method === "DELETE")!;
    expect([del.path, del.ifMatch]).toEqual([`/projects/${P}/dependencies/e1`, '"5"']);
  });

  it("a second 409 is a conflict; a rejected link is invalid", async () => {
    const api = fakeApi((call) => (call.method === "GET" ? json({ revision: 4, edges: [edge()] }) : call.method === "POST" ? err(422) : err(409)));
    const { schedule } = live(api);
    await expect(schedule.removeLink(P, "e1")).rejects.toMatchObject({ code: "conflict" });
    await expect(schedule.addLink(P, { predecessorId: "t2", successorId: "t1", type: "FS", lagDays: 0 })).rejects.toMatchObject({ code: "invalid" });
  });

  it("delete project: the typed name must match, then the deletion request with the ETag and the password", async () => {
    const api = fakeApi((call) =>
      call.method === "GET" ? json({ id: P, title: "Apollo", revision: 9 }, 200, '"9"') : call.body.password === "wrong" ? err(403) : json({ id: "d1", projectId: P, revision: 10 }, 201),
    );
    const { settings } = live(api);
    await expect(settings.remove(P, { name: "Apolo", password: "pw" })).rejects.toMatchObject({ code: "invalid", message: "name-mismatch" });
    expect(api.writes()).toEqual([]);
    await expect(settings.remove(P, { name: "Apollo", password: "wrong" })).rejects.toMatchObject({ code: "forbidden" });
    await settings.remove(P, { name: "Apollo", password: "pw" });
    const sent = api.calls.filter((call) => call.method === "POST").at(-1)!;
    expect([sent.path, sent.ifMatch, sent.body]).toEqual([`/projects/${P}/deletion-request`, '"9"', { password: "pw" }]);
    await expect(settings.setAccess(P, { allowGuests: true })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("remove field = deprecate with If-Match; already deprecated sends nothing", async () => {
    const api = fakeApi((call) =>
      call.method === "GET"
        ? json({ items: [{ id: "f1", name: "Cost", revision: 2, deprecatedAt: null }, { id: "f2", name: "Old", revision: 4, deprecatedAt: "2026-11-01T00:00:00.000Z" }], nextCursor: null })
        : json({ id: "f1", revision: 3 }),
    );
    const { fields } = live(api);
    await fields.remove(P, "f1");
    await fields.remove(P, "f2");
    await expect(fields.remove(P, "f9")).rejects.toMatchObject({ code: "not-found" });
    expect(api.writes()).toEqual([`POST /projects/${P}/custom-fields/f1/deprecate`]);
    expect(api.calls.find((call) => call.method === "POST")!.ifMatch).toBe('"2"');
  });

  const member = (id: string, role: string | null, over: Record<string, unknown> = {}) => ({
    id, spaceId: "s1", scopeId: "sc", actorId: "a-" + id, memberRole: role === "OWNER" ? null : role, role, state: "ACTIVE", generation: 1, revision: 2, displayName: "Sara Amini", ...over,
  });
  const viewItem = (id: string, status: string, dueAt: string | null) => ({ id, task: { id, title: id, status, deletedAt: null }, schedule: { id, revision: 1, plannedStartAt: null, dueAt, scheduledDate: null } });
  const assignment = (recipientAccessId: string, over: Record<string, unknown> = {}) => ({ id: "as-" + recipientAccessId, recipientAccessId, decision: "ACCEPTED", endedAt: null, ...over });

  it("members: active roster with names, roles and open-task counts; role change and removal through the membership", async () => {
    let revision = 2;
    const api = fakeApi((call, parts) => {
      if (parts[2] === "members")
        return json({ items: [member("m1", "OWNER"), member("m2", "MEMBER", { revision, displayName: "رضا" }), member("m3", "VIEWER", { state: "LEFT" })], nextCursor: null });
      if (parts[2] === "views") return json({ kind: "LIST", items: [viewItem("t1", "OPEN", null), viewItem("t2", "DONE", null)], nextCursor: null, dependencies: [] });
      if (parts[4] === "assignments") return json({ items: [assignment("m2"), assignment("m1", { decision: "DECLINED" }), assignment("m3", { endedAt: "2026-11-01T00:00:00.000Z" })], nextCursor: null });
      if (call.method === "PATCH") return json(member("m2", String(call.body.memberRole), { revision: ++revision, state: call.body.state, displayName: undefined }));
      return err(404);
    });
    const { members, projectTasks } = live(api);
    expect(await members.list(P)).toEqual([
      { person: { id: "m1", name: "Sara Amini", initials: "SA" }, email: "", role: "owner", capacityHours: null, openTasks: 0 },
      { person: { id: "m2", name: "رضا", initials: "ر" }, email: "", role: "member", capacityHours: null, openTasks: 1 },
    ]);
    expect(api.calls.some((call) => call.path.endsWith("/t2/assignments"))).toBe(false);
    expect(await projectTasks.members(P)).toHaveLength(2);
    expect(await members.removalPreview(P, "m2")).toEqual({ openTasks: 1 });

    expect(await members.setRole(P, "m2", "manager")).toMatchObject({ person: { id: "m2", name: "رضا" }, role: "manager" });
    await members.remove(P, "m2");
    expect(api.calls.filter((call) => call.method === "PATCH").map((call) => [call.path, call.ifMatch, call.body])).toEqual([
      ["/spaces/s1/memberships/m2", "\"2\"", { state: "ACTIVE", memberRole: "MANAGER" }],
      ["/spaces/s1/memberships/m2", "\"3\"", { state: "REVOKED", memberRole: "MEMBER" }],
    ]);
    await expect(members.remove(P, "m1")).rejects.toMatchObject({ code: "invalid", message: "last-owner" });
    await expect(members.remove(P, "m3")).rejects.toMatchObject({ code: "not-found" });
    await expect(members.setCapacity(P, "m2", 20)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("summary: KPIs from the dashboard, milestones, risks and the list view (Iran week)", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "dashboard") return json({ report: { overdueTaskCount: 2, openRiskCount: 3, statusCounts: { OPEN: 4, IN_PROGRESS: 1, DONE: 6, CANCELED: 1 } }, progress: {}, health: {} });
      if (parts[2] === "components")
        return json({ items: [{ id: "m1", title: "Alpha", targetDate: "2026-11-01", completed: true }, { id: "m3", title: "GA", targetDate: "2026-12-20" }, { id: "m2", title: "Beta", targetDate: "2026-11-20", completed: false }, { id: "m4", title: "Someday", targetDate: null }], nextCursor: null });
      if (parts[2] === "register-items")
        return json({ items: [{ id: "r1", severity: "HIGH", status: "OPEN", retiredAt: null }, { id: "r2", severity: "CRITICAL", status: "CLOSED", retiredAt: null }, { id: "r3", severity: "LOW", status: "MITIGATING", retiredAt: null }], nextCursor: null });
      if (parts[2] === "views")
        return json({ kind: "LIST", items: [viewItem("t1", "OPEN", "2026-11-03T08:00:00.000Z"), viewItem("t2", "IN_PROGRESS", "2026-11-13T08:00:00.000Z"), viewItem("t3", "DONE", "2026-11-01T08:00:00.000Z"), viewItem("t4", "OPEN", null)], nextCursor: null, dependencies: [] });
      return err(404);
    });
    expect(await live(api).projects.summary(P)).toEqual({
      milestonesDone: 1, milestonesTotal: 4, nextMilestone: { id: "m2", title: "Beta", due: "2026-11-20" },
      overdueTasks: 2, oldestOverdueDays: 9, openRisks: 3, highRisks: 1, dueThisWeek: 1, openTasks: 5,
    });
    const dashboard = api.calls.find((call) => call.path.endsWith("/dashboard"))!;
    expect(dayOf(dashboard.query.fromAt!)).toBe("2026-11-07");
    expect(api.calls.find((call) => call.path.endsWith("/register-items"))!.query.kind).toBe("RISK");
    expect(api.writes()).toEqual([]);
  });

  it("reschedule: cascade preview of a timed task, applied as a whole with its hash; the rest is refused", async () => {
    const timed = (id: string, start: string, due: string) => ({
      id,
      task: { id, title: id.toUpperCase(), status: "OPEN", revision: 5, deletedAt: null },
      schedule: { id, revision: 1, plannedStartAt: start, dueAt: due, scheduledDate: null },
    });
    let applies = 0;
    const api = fakeApi((call, parts) => {
      if (parts[2] === "views")
        return json({
          kind: "LIST",
          items: [timed("t1", "2026-11-10T08:00:00.000Z", "2026-11-12T08:00:00.000Z"), timed("t2", "2026-11-13T08:00:00.000Z", "2026-11-14T08:00:00.000Z"), viewItem("t3", "OPEN", null)],
          nextCursor: null,
          dependencies: [],
        });
      if (parts[2] === "dependencies") return json({ revision: 4, edges: [edge()] });
      if (parts[4] === "apply") return applies++ === 0 ? json({ id: "pv", state: "APPLIED" }) : err(409);
      if (parts[2] === "reschedule-previews") {
        const schedule = call.body.schedule as { plannedStartAt: string; dueAt: string };
        return json(
          {
            id: "pv",
            revision: 1,
            manifestHash: "h1",
            items: [
              { taskId: "t2", sourceRevision: 5, changed: true, plannedStartAt: "2026-11-15T08:00:00.000Z", dueAt: "2026-11-16T08:00:00.000Z", scheduledDate: null },
              { taskId: "t1", sourceRevision: 5, changed: true, plannedStartAt: schedule.plannedStartAt, dueAt: schedule.dueAt, scheduledDate: null },
              { taskId: "t0", sourceRevision: 2, changed: false, plannedStartAt: null, dueAt: null, scheduledDate: null },
            ],
          },
          200,
          '"pv-1"',
        );
      }
      return err(404);
    });
    const { schedule } = live(api);
    const preview = await schedule.preview(P, { itemId: "t1", start: "2026-11-12", end: "2026-11-14" }, "cascade");
    const sent = api.calls.find((call) => call.method === "POST")!;
    expect(sent.key).toBeTruthy();
    expect(sent.body).toMatchObject({ taskId: "t1", sourceRevision: 5, schedule: { plannedStartAt: "2026-11-12T08:00:00.000Z", dueAt: "2026-11-14T08:00:00.000Z" } });
    expect(preview).toMatchObject({ deltaDays: 2, conflicts: [], hasDependents: true });
    expect(preview.moves).toEqual([
      { id: "t1", kind: "task", title: "T1", from: { start: "2026-11-10", end: "2026-11-12" }, to: { start: "2026-11-12", end: "2026-11-14" }, revision: 5 },
      { id: "t2", kind: "task", title: "T2", from: { start: "2026-11-13", end: "2026-11-14" }, to: { start: "2026-11-15", end: "2026-11-16" }, revision: 5 },
    ]);

    await expect(schedule.apply(P, preview.moves.slice(0, 1))).rejects.toMatchObject({ code: "unsupported" });
    await schedule.apply(P, preview.moves);
    const applied = api.calls.at(-1)!;
    expect([applied.path, applied.ifMatch, applied.body]).toEqual([`/projects/${P}/reschedule-previews/pv/apply`, '"pv-1"', { manifestHash: "h1" }]);
    await expect(schedule.apply(P, preview.moves)).rejects.toMatchObject({ code: "unsupported" });

    const again = await schedule.preview(P, { itemId: "t1", start: "2026-11-12", end: "2026-11-14" }, "cascade");
    await expect(schedule.apply(P, again.moves)).rejects.toMatchObject({ code: "conflict" });
    await expect(schedule.preview(P, { itemId: "t1", start: "2026-11-12", end: "2026-11-14" }, "only")).rejects.toMatchObject({ code: "unsupported" });
    await expect(schedule.preview(P, { itemId: "t3", start: "2026-11-12", end: "2026-11-14" }, "cascade")).rejects.toMatchObject({ code: "unsupported" });
    await expect(schedule.preview(P, { itemId: "m1", start: "2026-11-12", end: "2026-11-12" }, "cascade")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("save as template: the project's structure, live tasks and live links in one template", async () => {
    const api = fakeApi((call, parts) => {
      if (call.method === "POST") return json({ name: call.body.name, templateId: "tp1", version: 1 });
      if (parts.length === 2) return json({ id: P, title: "Apollo", revision: 9 });
      if (parts[2] === "components")
        return json({ items: [{ id: `${parts[3]}-1`, title: String(parts[3]), position: 0, phaseId: parts[3] === "phases" ? undefined : "phases-1", targetDate: parts[3] === "milestones" ? "2026-12-01" : null }], nextCursor: null });
      if (parts[2] === "views")
        return json({ kind: "LIST", items: [{ ...viewItem("t1", "OPEN", null), task: { id: "t1", title: "Plan", description: null, priority: "HIGH", deletedAt: null }, estimatedMinutes: 90 }], nextCursor: null, dependencies: [] });
      if (parts[4] === "association") return json({ id: "t1", sectionId: "sections-1", milestoneId: null, revision: 1 });
      if (parts[2] === "dependencies") return json({ revision: 4, edges: [edge({ predecessorId: "t1", successorId: "t1" }), edge({ id: "e2" })] });
      return err(404);
    });
    expect(await live(api).settings.saveTemplate(P)).toEqual({ name: "Apollo" });
    const sent = api.calls.find((call) => call.method === "POST")!;
    expect([sent.path, Boolean(sent.key)]).toEqual([`/projects/${P}/templates`, true]);
    expect(sent.body).toMatchObject({
      name: "Apollo",
      definition: {
        schemaVersion: 1,
        phases: [{ key: "phases-1", title: "phases", position: 0 }],
        sections: [{ key: "sections-1", phaseKey: "phases-1" }],
        milestones: [{ key: "milestones-1", phaseKey: "phases-1", targetDate: "2026-12-01" }],
        tasks: [{ key: "t1", title: "Plan", description: null, priority: "HIGH", estimatedMinutes: 90, sectionKey: "sections-1", milestoneKey: null }],
        dependencies: [{ predecessorKey: "t1", successorKey: "t1", kind: "FS", lagMinutes: 1440 }],
      },
    });
  });

  it("task comment: posted to the task target, authored by the member behind the actor id", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "members") return json({ items: [member("m1", "OWNER"), member("m2", "MEMBER", { displayName: "Omid Karimi" })], nextCursor: null });
      if (call.method === "POST") return json({ ...call.body, projectId: P, revision: 1, createdByActorId: "a-m2", createdAt: "2026-11-12T09:00:00.000Z", deletedAt: null });
      return err(404);
    });
    const comment = await live(api).comments.add(P, "t1", "Looks good");
    expect(comment).toEqual({ id: comment.id, author: { id: "m2", name: "Omid Karimi", initials: "OK" }, at: "2026-11-12T09:00:00.000Z", body: "Looks good" });
    const sent = api.calls.find((call) => call.method === "POST")!;
    expect([sent.path, Boolean(sent.key)]).toEqual([`/projects/${P}/comments`, true]);
    expect(sent.body).toEqual({ id: comment.id, body: "Looks good", target: { kind: "TASK", id: "t1" } });
  });

  it("task dependency: an edge into the task with the predecessor's title; removed with If-Match", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "views") return json({ kind: "LIST", items: call.query.taskId === "t1" ? [{ ...viewItem("t1", "OPEN", null), task: { id: "t1", title: "Plan", deletedAt: null } }] : [], nextCursor: null, dependencies: [] });
      if (call.method === "GET") return json({ revision: 4, edges: [edge()] });
      if (call.method === "POST") return json(edge({ ...call.body, revision: 1 }), 201);
      return json(null, 204);
    });
    const { dependencies } = live(api);
    const added = await dependencies.add(P, "t2", { predecessorId: "t1", type: "FS", lagDays: 1 });
    expect(added).toEqual({ id: added.id, predecessorId: "t1", predecessorTitle: "Plan", type: "FS", lagDays: 1 });
    expect(api.calls.find((call) => call.method === "POST")!.body).toMatchObject({ predecessorId: "t1", successorId: "t2", kind: "FS", lagMinutes: 1440 });
    await expect(dependencies.add(P, "t2", { predecessorId: "nope", type: "FS", lagDays: 0 })).rejects.toMatchObject({ code: "not-found" });
    await dependencies.remove(P, "t2", "e1");
    const del = api.calls.at(-1)!;
    expect([del.method, del.path, del.ifMatch]).toEqual(["DELETE", `/projects/${P}/dependencies/e1`, '"3"']);
  });

  it("leave: the caller's own membership from access/me, with its revision; an owner cannot leave", async () => {
    let role = "MEMBER";
    const api = fakeApi((call, parts) => {
      if (parts[3] === "me") return json({ accessId: "m2", actorId: "a-m2", role, state: "ACTIVE", generation: 1, scope: "FULL", projectState: "ACTIVE", capabilities: [] });
      if (parts[2] === "members") return json({ items: [member("m1", "OWNER"), member("m2", "MEMBER", { revision: 5 })], nextCursor: null });
      if (parts[2] === "leave") return json({ id: "m2", revision: 6 }, 201);
      return err(404);
    });
    const { members } = live(api);
    await members.leave(P);
    const sent = api.calls.at(-1)!;
    expect([sent.method, sent.path, sent.ifMatch]).toEqual(["POST", "/spaces/s1/leave", '"5"']);
    role = "OWNER";
    await expect(members.leave(P)).rejects.toMatchObject({ code: "invalid" });
  });

  it("ownership handover: pending one with the successor's name, request through the space, cancel = revoke", async () => {
    const handover = { id: "h1", spaceId: "s1", scopeId: "sc", fromAccessId: "m1", toAccessId: "m2", state: "PENDING", revision: 3, expiresAt: "2026-11-19T00:00:00.000Z", expectedCustodyRevision: 1, acceptedAt: null };
    let list = [{ ...handover, id: "h0", state: "REVOKED" }];
    const api = fakeApi((call, parts) => {
      if (parts[2] === "ownership-handovers" && parts[0] === "projects") return json({ items: list, nextCursor: null });
      if (parts[2] === "members") return json({ items: [member("m1", "OWNER"), member("m2", "MEMBER", { displayName: "Omid Karimi" })], nextCursor: null });
      if (parts[0] === "projects" && parts.length === 2) return json({ id: P, spaceId: "s1", title: "Apollo", revision: 1 });
      if (parts[4] === "revoke") return json({ ...handover, state: "REVOKED" }, 201);
      if (call.method === "POST" && parts[2] === "ownership-handovers") return json(handover, 201);
      return err(404);
    });
    const { settings } = live(api);
    expect(await settings.transfer(P)).toBeNull();
    expect(await settings.requestTransfer(P, "m2")).toEqual({ successor: { id: "m2", name: "Omid Karimi", initials: "OK" }, accepted: false });
    const posted = api.calls.find((call) => call.method === "POST")!;
    expect([posted.path, Boolean(posted.key), posted.body]).toEqual(["/spaces/s1/ownership-handovers", true, { successorAccessId: "m2" }]);
    list = [handover];
    expect(await settings.transfer(P)).toMatchObject({ successor: { id: "m2" }, accepted: false });
    await settings.cancelTransfer(P);
    const revoked = api.calls.at(-1)!;
    expect([revoked.path, revoked.ifMatch]).toEqual(["/spaces/s1/ownership-handovers/h1/revoke", '"3"']);
  });

  it("CSV import: inspection, the mapping rewritten into the API layout, only ready rows applied, status / assignee refused", async () => {
    const csvs: string[] = [];
    const plan = { id: "pl1", projectId: P, kind: "CSV", state: "PREVIEWED", revision: 2, manifestHash: "hh", expiresAt: "2026-11-12T10:30:00.000Z", appliedAt: null, operations: [], sources: [] };
    const api = fakeApi((call, parts) => {
      if (parts[4] === "inspection") return json({ columns: ["Name", "Hours", "Deadline"], sampleRows: [], rowCount: 3, samplesTruncated: false, errors: [] });
      if (parts[3] === "csv") {
        const csv = String(call.body.csv);
        csvs.push(csv);
        return csv.split("\r\n").length === 4
          ? json({ valid: false, errors: [{ row: 3, column: "estimatedMinutes", code: "VALUE" }], plan: null })
          : json({ valid: true, errors: [], plan });
      }
      if (parts[4] === "apply")
        return json({ ...plan, state: "APPLIED", appliedAt: "2026-11-12T10:01:00.000Z", operations: [{ kind: "CREATE_TASK" }, { kind: "CREATE_TASK" }] });
      return err(404);
    });
    const { imports } = live(api);
    const file = "Name,Hours,Deadline\nPlan,1.5,2026-11-20\nBuild,lots,\nShip,,\n";
    expect(await imports.inspect(P, file)).toEqual({ headers: ["Name", "Hours", "Deadline"], rowCount: 3, suggested: { title: null, status: null, assignee: null, due: null, estimate: null } });
    const mapping = { title: 0, status: null, assignee: null, due: 2, estimate: 1 };
    expect(await imports.dryRun(P, file, mapping)).toEqual({ rowsRead: 3, ready: 2, errors: [{ row: 2, column: "estimate", problem: "number", value: "lots" }] });
    expect(csvs[0]!.split("\r\n")[0]).toBe('"title","estimatedMinutes","dueAt"');
    expect(csvs[0]!.split("\r\n")[1]).toMatch(/^"Plan","90","2026-11-2\dT.*"$/);
    const done = await imports.commit(P, file, mapping);
    expect(done).toEqual({ created: 2, batchId: "pl1", undoUntil: "2026-11-12T10:01:00.000Z" });
    expect(csvs.at(-1)!.split("\r\n").map((line) => line.split(",")[0])).toEqual(['"title"', '"Plan"', '"Ship"']);
    const applied = api.calls.at(-1)!;
    expect([applied.path, applied.ifMatch, applied.body]).toEqual([`/projects/${P}/change-plans/pl1/apply`, '"2"', { manifestHash: "hh" }]);
    await expect(imports.dryRun(P, file, { ...mapping, status: 1 })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("custom fields: current versions, value counts across the LIST view, create / new version / refusals", async () => {
    const fields = [
      { id: "f1", name: "Area", kind: "SINGLE_SELECT", currentVersion: 2, revision: 4, deprecatedAt: null },
      { id: "f2", name: "Budget", kind: "CURRENCY", currentVersion: 1, revision: 1, deprecatedAt: null },
      { id: "f3", name: "Old", kind: "TEXT", currentVersion: 1, revision: 1, deprecatedAt: "2026-11-01T00:00:00.000Z" },
    ];
    const api = fakeApi((call, parts) => {
      if (parts[4] === "versions" && call.method === "GET")
        return json({ fieldId: parts[3], version: 2, name: "Area", kind: "SINGLE_SELECT", options: [{ id: "o1", label: "Web" }], createdAt: "x", publishedByActorId: "a" });
      if (parts[4] === "versions") return json({ ...call.body, fieldId: parts[3], version: 3 });
      if (parts[2] === "custom-fields" && call.method === "GET") return json({ items: fields, nextCursor: null });
      if (parts[2] === "custom-fields") return json({ ...call.body, fieldId: "f9", version: 1 });
      if (parts[2] === "views")
        return json({
          kind: "LIST",
          items: [
            { ...viewItem("t1", "OPEN", null), fields: { items: [{ fieldId: "f1", value: "o1" }] } },
            { ...viewItem("t2", "OPEN", null), fields: { items: [{ fieldId: "f1", value: null }] } },
          ],
          nextCursor: null,
          dependencies: [],
        });
      return err(404);
    });
    const repo = live(api).fields;
    expect(await repo.list(P)).toEqual([{ id: "f1", name: "Area", type: "single-select", options: ["Web"], appliesTo: ["tasks"], required: false, valueCount: 1 }]);
    const base = { appliesTo: ["tasks"] as const, required: false };
    await repo.save(P, [
      { id: "f1", name: "Area", type: "single-select", options: ["Web", "App"], ...base },
      { name: "Done?", type: "checkbox", ...base },
    ]);
    const writes = api.calls.filter((call) => call.method !== "GET");
    expect(writes.map((call) => [call.path, call.ifMatch])).toEqual([[`/projects/${P}/custom-fields/f1/versions`, '"4"'], [`/projects/${P}/custom-fields`, null]]);
    expect(writes[0]!.body).toMatchObject({ kind: "SINGLE_SELECT", options: [{ id: "o1", label: "Web" }, { label: "App" }] });
    expect(writes[1]!.body).toMatchObject({ name: "Done?", kind: "BOOLEAN" });
    await expect(repo.save(P, [{ name: "Link", type: "url", ...base }])).rejects.toMatchObject({ code: "unsupported" });
    await expect(repo.save(P, [{ name: "Must", type: "text", appliesTo: ["tasks"], required: true }])).rejects.toMatchObject({ code: "unsupported" });
  });

  const directoryApi = (state: { projectState: string; role: string | null; capabilities: string[]; forbidden?: boolean }) =>
    fakeApi((call, parts) => {
      const project = { id: P, spaceId: "s1", scopeId: "sc", title: "Apollo Launch", description: "Ship it", revision: 4, state: state.projectState, updatedAt: "2026-11-10T09:00:00.000Z" };
      if (parts[0] === "me") return json({ items: [{ assignment: { projectId: P, decision: "PENDING", endedAt: null } }, { assignment: { projectId: "p2", decision: "ACCEPTED", endedAt: null } }, { assignment: { projectId: P, decision: "DECLINED", endedAt: null } }], nextCursor: null });
      if (parts[3] === "me") return state.forbidden ? err(403) : json({ accessId: "m1", actorId: "a-m1", role: state.role, state: "ACTIVE", generation: 1, scope: state.role ? "FULL" : "PROJECT", projectState: state.projectState, capabilities: state.capabilities });
      if (parts[2] === "metadata" && call.method === "GET") return json({ id: P, title: "Apollo Launch", key: "APL", color: "indigo", summary: null, startDate: "2026-10-01", endDate: null, statusNote: "On plan", status: state.projectState, revision: 7 });
      if (parts[2] === "dashboard") return json({ report: {}, progress: { basis: "DONE_OVER_NON_CANCELED_VISIBLE_TASKS", completedTasks: 3, eligibleTasks: 8, percent: 37.5 }, health: {} });
      if (parts[2] === "members") return json({ items: [member("m1", "OWNER"), member("m2", "MEMBER", { displayName: "Omid Karimi" }), member("m3", "MEMBER", { state: "REVOKED" })], nextCursor: null });
      if (parts[2] === "components") return json({ items: [{ id: "ms1", title: "Beta", completed: false, targetDate: "2026-12-01" }], nextCursor: null });
      if (parts[2] === "register-items") return json({ items: [{ id: "r1", status: "OPEN", severity: "HIGH", retiredAt: null }, { id: "r2", status: "CLOSED", severity: "CRITICAL", retiredAt: null }], nextCursor: null });
      if (call.method === "GET" && parts[0] === "projects" && parts.length === 1) return json({ items: [project, { ...project, id: "p9", state: "CLOSED" }], nextCursor: null });
      if (call.method === "GET" && parts.length === 2) return json(project, 200, '"proj-4"');
      if (call.method === "PATCH" && parts.length === 2) return json({ ...project, ...call.body });
      if (call.method === "PATCH") return json({ ...call.body, revision: 8 });
      if (call.method === "POST") return json({ id: "c1", projectId: P, revision: 5 }, 201);
      return err(404);
    });

  it("access gate: a factual summary (unknown health / expected / end date) and capabilities from access/me", async () => {
    const api = directoryApi({ projectState: "ACTIVE", role: "MANAGER", capabilities: ["task.read", "task.create", "task.update", "work.manage", "settings.manage", "comment.create"] });
    const access = await live(api).projects.access(P);
    if (access.status !== "ok") throw new Error(access.status);
    expect(access.project).toMatchObject({
      name: "Apollo Launch",
      key: "APL",
      tint: "indigo",
      initials: "AL",
      description: "Ship it",
      role: "manager",
      health: null,
      expectedPercent: null,
      lifecycle: "active",
      statusNote: { text: "On plan", author: null, at: null },
      progress: { done: 3, total: 8, percent: 38 },
      startDate: "2026-10-01",
      endDate: null,
      nextMilestone: { id: "ms1", title: "Beta", due: "2026-12-01" },
      memberCount: 2,
      forYou: 1,
      openHighRisks: 1,
    });
    expect(access.capabilities).toMatchObject({ createTask: true, editAnyTask: true, importCsv: true, editGeneral: true, comment: true, editStatus: false, invite: false, deleteTasks: false, ownProject: false, editAccess: false });
    expect(access.capabilities.modules).toMatchObject({ timeline: true, settings: true, files: false });
    expect(api.writes()).toEqual([]);
  });

  it("access gate: a project-scope grant is a guest; forbidden is 'not available'; the directory skips closed projects", async () => {
    const guest = await live(directoryApi({ projectState: "ACTIVE", role: null, capabilities: ["task.read"] })).projects.access(P);
    expect(guest.status === "ok" && [guest.project.role, guest.capabilities.modules.timeline]).toEqual(["guest", false]);
    expect(await live(directoryApi({ projectState: "ACTIVE", role: "MEMBER", capabilities: [], forbidden: true })).projects.access(P)).toEqual({ status: "not-available" });
    const directory = await live(directoryApi({ projectState: "ARCHIVED", role: "OWNER", capabilities: ["custody.archive"] })).projects.listAccessible();
    expect(directory.projects.map((project) => [project.id, project.lifecycle, project.restorable])).toEqual([[P, "archived", true]]);
    expect(directory.counts).toEqual({ all: 0, owned: 0, member: 0, invitations: 0, archived: 1 });
    expect(directory.recentIds).toEqual([]);
  });

  it("general settings, archive and restore: project + metadata writes with If-Match, then a fresh summary", async () => {
    const api = directoryApi({ projectState: "ACTIVE", role: "OWNER", capabilities: ["settings.manage", "custody.archive"] });
    const { settings, projects } = live(api);
    await settings.update(P, { name: " Apollo 2 ", key: "AP2", startDate: "2026-10-02", endDate: "2026-12-31", tint: "amber" });
    const patches = api.calls.filter((call) => call.method === "PATCH");
    expect(patches.map((call) => [call.path, call.ifMatch, call.body])).toEqual([
      [`/projects/${P}`, '"proj-4"', { title: "Apollo 2" }],
      [`/projects/${P}/metadata`, '"7"', { key: "AP2", color: "amber", startDate: "2026-10-02", endDate: "2026-12-31" }],
    ]);
    await expect(settings.update(P, { endDate: "2026-09-01" })).rejects.toMatchObject({ code: "invalid" });
    await settings.archive(P);
    await projects.restore(P);
    expect(api.calls.filter((call) => call.method === "POST").map((call) => [call.path, call.ifMatch])).toEqual([
      [`/projects/${P}/archive`, '"proj-4"'],
      [`/projects/${P}/restore`, '"proj-4"'],
    ]);
  });

  const W = "w1";
  const tasksApi = (over: { binding?: boolean; decision?: string } = {}) =>
    fakeApi((call, parts) => {
      const bound = { workflowId: W, version: 2, stateId: "s-review", taskId: "t1", revision: 1, sourceRevision: 5 };
      const item = (id: string, status: string, priority: string, binding: unknown, dueAt: string | null) => ({
        id,
        task: { id, title: id === "t1" ? "Design" : "Copy", status, priority, revision: 5, deletedAt: null, completedAt: null },
        schedule: { id, revision: 1, plannedStartAt: null, dueAt, scheduledDate: null },
        estimatedMinutes: id === "t1" ? 90 : null,
        workflow: { taskId: id, sourceRevision: 5, binding },
        fields: { taskId: id, sourceRevision: 5, items: [] },
      });
      if (parts[2] === "views") {
        const items = [item("t1", "IN_PROGRESS", "HIGH", over.binding === false ? null : bound, "2026-11-10T20:29:00.000Z"), item("t2", "OPEN", "NONE", null, null)];
        if (call.query.taskId === "t9") items.push(item("t9", "OPEN", "LOW", null, null));
        return json({ kind: "LIST", items: call.query.taskId ? items.filter((entry) => entry.id === call.query.taskId) : items, nextCursor: null, dependencies: [edge({ predecessorId: "t2", successorId: "t1" })] });
      }
      if (parts[2] === "members") return json({ items: [member("m1", "OWNER"), member("m2", "MEMBER", { displayName: "Omid Karimi" })], nextCursor: null });
      if (parts[2] === "components") return json({ items: [{ id: "sec2", title: "B", position: 2, phaseId: "ph1" }, { id: "sec1", title: "A", position: 1, phaseId: "ph1" }], nextCursor: null });
      if (parts[3] === "me") return json({ accessId: "m2", role: "MEMBER", scope: "FULL", capabilities: [] });
      if (parts[2] === "workflows")
        return json({
          name: "Delivery",
          workflowId: W,
          version: 2,
          createdAt: "2026-11-01T00:00:00.000Z",
          states: [{ id: "s-review", label: "Review", status: "IN_PROGRESS" }, { id: "s-done", label: "Shipped", status: "DONE" }],
          edges: [{ id: "edge1", fromStateId: "s-review", toStateId: "s-done", requiresApproval: false, approvers: [] }],
        });
      if (parts[4] === "association" && call.method === "GET") return json({ id: parts[3], sectionId: parts[3] === "t1" ? "sec1" : null, milestoneId: null, revision: 3 });
      if (parts[4] === "assignments" && call.method === "GET")
        return json({ items: parts[3] === "t1" ? [assignment("m2", { kind: "PRIMARY", createdByActorId: "a-m1", revision: 4, createdAt: "2026-11-09T08:00:00.000Z", decision: over.decision ?? "ACCEPTED" })] : [], nextCursor: null });
      if (parts[4] === "workflow" && call.method === "GET") return json({ taskId: parts[3], sourceRevision: 5, binding: parts[3] === "t1" && over.binding !== false ? bound : null }, 200, '"5"');
      if (call.method === "GET" && parts[2] === "tasks" && parts.length === 4) return json({ id: parts[3], revision: 5, status: "OPEN", priority: "NONE" }, 200, '"5"');
      if (call.method === "POST" && parts[2] === "tasks" && parts.length === 3) return json({ id: "t9", revision: 1 }, 201);
      if (parts[4] === "schedule" && call.method === "GET") return json({ id: parts[3], revision: 1, plannedStartAt: "2026-11-08T06:00:00.000Z", dueAt: null, scheduledDate: null });
      if (parts[4] === "work-logs") return json({ items: [{ startedAt: "2026-11-09T08:00:00.000Z", endedAt: "2026-11-09T09:30:00.000Z", voidedAt: null }, { startedAt: "2026-11-09T10:00:00.000Z", endedAt: "2026-11-09T12:00:00.000Z", voidedAt: "x" }], nextCursor: null });
      if (parts[2] === "dependencies") return json({ revision: 4, edges: [edge({ predecessorId: "t2", successorId: "t1", kind: "SS", lagMinutes: 2880 })] });
      return json({ ok: true });
    });

  it("tasks: rows from the LIST view, association and assignments; per-version statuses; views from access/me", async () => {
    const api = tasksApi();
    const repos = live(api);
    const list = await repos.projectTasks.list(P);
    expect(list.tasks[0]).toMatchObject({
      id: "t1",
      statusId: `${W}:2:s-review`,
      phaseId: "ph1",
      priority: "high",
      due: dayOf("2026-11-10T20:29:00.000Z"),
      estimateHours: 1.5,
      blockedBy: ["t2"],
      subtasks: null,
      commentCount: null,
      assignees: [{ person: { id: "m2", name: "Omid Karimi" }, state: "accepted", by: { id: "m1" } }],
    });
    expect(list.tasks[1]).toMatchObject({ id: "t2", statusId: "base:OPEN", phaseId: null, priority: null, assignees: [] });
    expect(list.counts).toMatchObject({ all: 2, mine: 1, unassigned: 1 });
    const workflow = await repos.workflows.published(P);
    expect(workflow.statuses.map((status) => [status.id, status.category])).toEqual([
      ["base:OPEN", "todo"],
      ["base:IN_PROGRESS", "active"],
      ["base:DONE", "done"],
      ["base:CANCELED", "canceled"],
      [`${W}:2:s-review`, "active"],
      [`${W}:2:s-done`, "done"],
    ]);
    expect(workflow.transitions[`${W}:2:s-review`]).toEqual([`${W}:2:s-done`]);
    expect(api.writes()).toEqual([]);
  });

  it("tasks: a move follows the version edge with the task's If-Match; unbound tasks PATCH the base status; cross-version moves refused", async () => {
    const api = tasksApi();
    const { projectTasks } = live(api);
    await projectTasks.transition(P, "t1", `${W}:2:s-done`, 5);
    const moved = api.calls.find((call) => call.path.endsWith("/workflow/transitions"))!;
    expect([moved.ifMatch, Boolean(moved.key), moved.body]).toEqual(['"5"', true, { edgeId: "edge1" }]);
    await expect(projectTasks.transition(P, "t1", "base:DONE", 5)).rejects.toMatchObject({ code: "unsupported" });
    await expect(projectTasks.transition(P, "t1", `${W}:2:s-done`, 4)).rejects.toMatchObject({ code: "conflict" });
    const plain = tasksApi({ binding: false });
    await live(plain).projectTasks.transition(P, "t2", "base:DONE", 5);
    const patch = plain.calls.find((call) => call.method === "PATCH")!;
    expect([patch.path, patch.body]).toEqual([`/projects/${P}/tasks/t2`, { status: "DONE" }]);
  });

  it("tasks: create in a phase's first section, then due / estimate / assignee through their own facets", async () => {
    const api = tasksApi();
    await live(api).projectTasks.create(P, { title: " Launch ", phaseId: "ph1", priority: "low", due: "2026-11-20", estimateHours: 2, assigneeId: "m2" });
    const writes = api.calls.filter((call) => call.method !== "GET");
    expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST /projects/${P}/tasks`,
      `PUT /projects/${P}/tasks/t9/schedule`,
      `PUT /projects/${P}/tasks/t9/estimate`,
      `POST /projects/${P}/tasks/t9/assignments`,
    ]);
    expect(writes[0]!.body).toMatchObject({ title: "Launch", priority: "LOW", sectionId: "sec1" });
    expect(writes[2]!.body).toEqual({ estimatedMinutes: 120 });
    expect(writes[3]!.body).toMatchObject({ recipientAccessId: "m2", recipientGeneration: 1, kind: "PRIMARY" });
    await expect(live(api).projectTasks.create(P, { title: "X", phaseId: "ph-empty" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("my assignments: pending / open lists, accept and decline on my own assignment with its revision", async () => {
    const api = tasksApi({ decision: "PENDING" });
    const { assignments } = live(api);
    expect((await assignments.listMine(P)).pending.map((task) => task.id)).toEqual(["t1"]);
    await assignments.accept(P, "t1", 5);
    await assignments.decline(P, "t1", { reason: "no-capacity", note: "Full week", revision: 5 });
    const writes = api.calls.filter((call) => call.method === "POST");
    expect(writes.map((call) => [call.path, call.ifMatch, call.body])).toEqual([
      [`/projects/${P}/tasks/t1/assignments/as-m2/accept`, '"4"', {}],
      [`/projects/${P}/tasks/t1/assignments/as-m2/decline`, '"4"', { reason: "no-capacity — Full week" }],
    ]);
    await expect(assignments.accept(P, "t1", 3)).rejects.toMatchObject({ code: "conflict" });
    await expect(assignments.revertAccept(P, "t1", 5)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("reassign, calendar and task detail from the shared task loader", async () => {
    const api = tasksApi({ decision: "PENDING" });
    const repos = live(api);
    await repos.reassign.reassign(P, "t1", { personId: "m1" });
    const reassigned = api.calls.find((call) => call.path.endsWith("/reassign"))!;
    expect([reassigned.ifMatch, Boolean(reassigned.key), reassigned.body]).toMatchObject(['"4"', true, { recipientAccessId: "m1", recipientGeneration: 1, sourceRevision: 5 }]);
    const items = await repos.calendar.range(P, "2026-11-01", "2026-11-30");
    expect(items.map((item) => [item.id, item.kind])).toEqual([["task:t1", "task"]]);
    const detail = await repos.taskDetails.get(P, "t1");
    expect(detail).toMatchObject({ start: "2026-11-08", section: "A", loggedHours: 1.5, comments: [], subtasks: [], showInCalendar: false });
    expect(detail.dependencies).toEqual([{ id: "e1", predecessorId: "t2", predecessorTitle: "Copy", type: "SS", lagDays: 2 }]);
    expect(detail.activity).toMatchObject([{ kind: "assigned", actor: { id: "m1" }, person: "Omid Karimi" }]);
    await expect(repos.taskDetails.setShowInCalendar(P, "t1", true)).rejects.toMatchObject({ code: "unsupported" });
  });
});
