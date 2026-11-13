import { describe, expect, it } from "vitest";
import { createApiTeamRepositories } from "./api-team-repositories";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Contract fakes for the Teams subset of the 864-op contract (access/me + member display names, T-M2 handover list). */

const T = "t1";
const team = (state = "ACTIVE") => ({ id: T, spaceId: T, scopeId: T, title: "Design Team", description: null, revision: 6, state, createdByActorId: "a0", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", association: { kind: "INDEPENDENT" } });
const member = (id: string, role: string | null, displayName: string | null, state = "ACTIVE", revision = 2) => ({ id, spaceId: T, scopeId: T, actorId: `a-${id}`, memberRole: role === "OWNER" ? null : role, role, state, generation: 1, revision, displayName });
const ROSTER = [member("m1", "OWNER", "Mehran Raeeszade"), member("m2", "LEAD", "Sara Karimi"), member("m3", "MEMBER", null), member("m4", "MEMBER", "Gone", "LEFT")];
const ME = { accessId: "m1", actorId: "a-m1", role: "OWNER", generation: 1, capabilities: ["task.read", "membership.admin", "custody.archive", "custody.handover"] };

function teamApi(extra: (call: FakeCall, parts: string[]) => Response | null = () => null) {
  return fakeApi((call, parts) => {
    const answer = extra(call, parts);
    if (answer) return answer;
    if (call.method !== "GET") return err(500);
    if (parts.length === 1) return json({ items: [team(), { ...team("CLOSED"), id: "t2" }], nextCursor: null });
    if (parts[1] !== T) return err(404);
    if (parts.length === 2) return json(team(), 200, '"team-6"');
    if (parts[2] === "access") return json(ME);
    if (parts[2] === "memberships") return json({ items: ROSTER, nextCursor: null });
    if (parts[2] === "tasks")
      return json({ items: [{ status: "OPEN", deletedAt: null }, { status: "IN_PROGRESS", deletedAt: null }, { status: "DONE", deletedAt: null }, { status: "OPEN", deletedAt: "x" }], nextCursor: null });
    if (parts[2] === "projects") return json({ items: [{ link: { teamId: T, projectId: "p1", revision: 3, active: true }, project: {} }], nextCursor: null });
    return err(404);
  });
}

describe("live Teams repositories", () => {
  it("directory and access gate: role, names, counts and capabilities from the API (closed teams hidden)", async () => {
    const api = teamApi();
    const { teams } = createApiTeamRepositories(api.client);
    const directory = await teams.listAccessible();
    expect(directory.teams.map((entry) => entry.id)).toEqual([T]);
    expect(directory.teams[0]).toMatchObject({
      name: "Design Team",
      role: "owner",
      lifecycle: "active",
      memberCount: 3,
      lead: { id: "m2", name: "Sara Karimi", initials: "SK" },
      openTasks: 2,
      projectCount: 1,
      forYou: 0,
    });
    // A member without a display name stays blank (never invented).
    expect(directory.teams[0].members[2]).toEqual({ id: "m3", name: "", initials: "" });
    const access = await teams.access(T);
    expect(access.status).toBe("ok");
    if (access.status !== "ok") return;
    expect(access.capabilities).toMatchObject({ archive: true, restore: false, ownTeam: true, invite: false, createTask: false });
    expect(access.capabilities.modules).toMatchObject({ overview: true, people: true, calendar: true, settings: true, work: false, goals: false });
    await expect(teams.access("other")).resolves.toEqual({ status: "not-available" });
    expect(api.writes()).toEqual([]);
  });

  it("members: rows with per-row rights; role change and removal PATCH the membership with its revision", async () => {
    const api = teamApi((call) => (call.method === "PATCH" ? json({ ...member("m3", call.body.memberRole as string, null, call.body.state as string), revision: 3 }) : null));
    const { teamMembers } = createApiTeamRepositories(api.client);
    const rows = await teamMembers.list(T);
    expect(rows.map((row) => [row.person.id, row.role, row.can.changeRole, row.can.remove])).toEqual([
      ["m1", "owner", false, false],
      ["m2", "lead", true, true],
      ["m3", "member", true, true],
    ]);
    await teamMembers.setRole(T, "m3", "lead");
    await teamMembers.remove(T, "m3");
    expect(api.calls.filter((call) => call.method === "PATCH").map((call) => [call.path, call.ifMatch, call.body])).toEqual([
      [`/teams/${T}/memberships/m3`, '"2"', { state: "ACTIVE", memberRole: "LEAD" }],
      [`/teams/${T}/memberships/m3`, '"2"', { state: "REVOKED", memberRole: "MEMBER" }],
    ]);
  });

  it("revokes a sent invitation with its revision; listing, resend and invitee answers stay refused (OD-4)", async () => {
    const api = teamApi((call, parts) => {
      if (call.method === "GET" && parts[2] === "invitations") return json({ id: "i1", spaceId: T, scopeId: T, kind: "MEMBERSHIP", memberRole: "MEMBER", state: "PENDING", revision: 4, expiresAt: "2026-12-01T00:00:00Z", acceptedAccessId: null });
      if (call.method === "POST") return json({ id: "i1", revision: 5 }, 201);
      return null;
    });
    const repos = createApiTeamRepositories(api.client);
    await repos.teamMembers.cancelInvite(T, "i1");
    expect(api.writes()).toEqual([`POST /teams/${T}/invitations/i1/revoke`]);
    expect(api.calls.at(-1)!.ifMatch).toBe('"4"');
    await expect(repos.teamMembers.invitations(T)).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.teamInvitations.accept("i1")).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.teamInvitations.send(T, { emails: ["a@b.c"], role: "member" })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("calendar: active events of the range (to inclusive), task blocks and cancelled items left out", async () => {
    const api = teamApi((call, parts) =>
      parts[2] === "calendar"
        ? json({
            from: call.query.from,
            to: call.query.to,
            timezone: "UTC",
            items: [
              { identity: "e1", kind: "EVENT", status: "ACTIVE", title: "Retro", schedule: { kind: "ALL_DAY", timezone: "UTC", startDate: "2026-11-14", endDate: "2026-11-15" } },
              { identity: "e2", kind: "EVENT", status: "CANCELED", title: "Old", schedule: { kind: "ALL_DAY", timezone: "UTC", startDate: "2026-11-14", endDate: "2026-11-15" } },
              { identity: "b1", kind: "TIME_BLOCK", status: "ACTIVE", title: "Block", schedule: { kind: "ALL_DAY", timezone: "UTC", startDate: "2026-11-14", endDate: "2026-11-15" } },
            ],
            nextCursor: null,
          })
        : null,
    );
    const events = await createApiTeamRepositories(api.client).teamCalendar.range(T, "2026-11-14", "2026-11-20");
    expect(events).toEqual([{ id: "e1", title: "Retro", kind: "meeting", day: "2026-11-14", time: null }]);
    expect(api.calls.at(-1)!.query).toMatchObject({ from: "2026-11-14", to: "2026-11-21" });
  });

  it("archive, deletion request (typed name first), handover request and project unlink", async () => {
    const api = teamApi((call) => {
      if (call.method === "POST" && call.path.endsWith("ownership-handovers"))
        return json({ id: "h1", spaceId: T, scopeId: T, fromAccessId: "m1", toAccessId: "m2", state: "PENDING", revision: 1, expiresAt: "x", expectedCustodyRevision: 1, acceptedAt: null }, 201);
      if (call.method === "POST") return json({ id: "j1", teamId: T, revision: 7 });
      if (call.method === "DELETE") return json(null, 204);
      return null;
    });
    const { teamSettings, projectAssociations } = createApiTeamRepositories(api.client);
    await teamSettings.archive(T);
    await expect(teamSettings.remove(T, { name: "Other", password: "pw" })).rejects.toMatchObject({ code: "invalid" });
    await teamSettings.remove(T, { name: " Design Team ", password: "pw" });
    await expect(teamSettings.requestTransfer(T, "m2")).resolves.toEqual({ successor: { id: "m2", name: "Sara Karimi", initials: "SK" }, accepted: false });
    await projectAssociations.unlink(T, "p1");
    expect(api.calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.path, call.ifMatch, call.body])).toEqual([
      ["POST", `/teams/${T}/archive`, '"team-6"', {}],
      ["POST", `/teams/${T}/delete`, '"team-6"', { password: "pw" }],
      ["POST", `/teams/${T}/ownership-handovers`, null, { successorAccessId: "m2" }],
      ["DELETE", `/teams/${T}/projects/p1`, '"3"', {}],
    ]);
    expect(api.calls.find((call) => call.path.endsWith("ownership-handovers"))!.key).toBeTruthy();
  });

  it("T-M2: the current transfer is the unexpired PENDING handover from the Owner list; cancel revokes it with If-Match", async () => {
    const handover = (id: string, state: string, expiresAt: string, toAccessId = "m2") => ({ id, spaceId: T, scopeId: T, fromAccessId: "m1", toAccessId, state, revision: 4, expiresAt, expectedCustodyRevision: 1, acceptedAt: null });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    let items = [handover("h0", "DECLINED", future), handover("h1", "PENDING", "2020-01-01T00:00:00Z", "m3"), handover("h2", "PENDING", future)];
    const api = teamApi((call, parts) => {
      if (parts[2] !== "ownership-handovers") return null;
      if (call.method === "GET") return json({ items, nextCursor: null });
      return json(handover("h2", "REVOKED", future), 201);
    });
    const { teamSettings } = createApiTeamRepositories(api.client);
    await expect(teamSettings.transfer(T)).resolves.toEqual({ successor: { id: "m2", name: "Sara Karimi", initials: "SK" }, accepted: false });
    await teamSettings.cancelTransfer(T);
    expect(api.calls.filter((call) => call.method !== "GET").map((call) => [call.method, call.path, call.ifMatch])).toEqual([["POST", `/teams/${T}/ownership-handovers/h2/revoke`, '"4"']]);
    items = [];
    await expect(teamSettings.transfer(T)).resolves.toBeNull();
    await expect(teamSettings.confirmTransfer(T, "pw")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("refuses unsupported modules without a request (never mock data)", async () => {
    const api = fakeApi(() => err(500));
    const repos = createApiTeamRepositories(api.client);
    await expect(repos.teamTasks.list(T)).rejects.toMatchObject({ code: "unsupported", message: expect.stringContaining("Teams API:") });
    await expect(repos.teamSettings.get(T)).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.teams.create({ name: "x", planningMode: "weekly" })).rejects.toMatchObject({ code: "unsupported" });
    await expect(repos.teamGoals.list(T)).rejects.toMatchObject({ code: "unsupported" });
    expect(api.calls).toEqual([]);
  });
});
