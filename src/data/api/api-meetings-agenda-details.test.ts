import { describe, expect, it } from "vitest";
import { createApiMessaging } from "./api-messaging-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* P5 gap closure: agenda details (planned minutes, completion) over `…/agenda/{entryId}/details`; details share the entry revision. */

const USER = { id: "u1", name: "Mehran Raeeszade" };
const M1 = "11111111-1111-4111-8111-111111111111";
const at = new Date(Date.now() + 86_400_000).toISOString();
const until = new Date(Date.now() + 90_000_000).toISOString();
const MEETING = {
  id: M1,
  kind: "TEAM",
  sourceId: "t1",
  legacyTeamMeetingId: null,
  event: { id: "e1", title: "Weekly sync", description: null, schedule: { kind: "TIMED", timezone: "Asia/Tehran", localStart: "x", localEnd: "x", startAt: at, endAt: until } },
  externalUrl: null,
  state: "ACTIVE",
  revision: 4,
  createdAt: at,
  role: "ORGANIZER",
  currentFinalVersionId: null,
};
const ORGANIZER = { displayName: "Mehran", actorId: "a1", role: "ORGANIZER", state: "ACTIVE", rsvp: "ACCEPTED", generation: 1, revision: 1, meetingId: M1, memberId: "mm1", capabilities: ["meeting.read", "meeting.manage", "agenda.propose"] };
const PARTICIPANT = { ...ORGANIZER, role: "PARTICIPANT", capabilities: ["meeting.read", "agenda.propose"] };
const entry = (id: string, state: string, revision = 2) => ({ id, meetingId: M1, memberId: "mm1", text: id === "g1" ? "Roadmap" : "Idea", state, revision, createdAt: at });
const detail = (id: string, over: Record<string, unknown> = {}) => ({ id, meetingId: M1, revision: 2, plannedMinutes: 15, completed: false, completedAt: null, notes: "", updatedByMemberId: null, updatedAt: null, ...over });
const page = (items: unknown[]) => json({ items, nextCursor: null, hasMore: false });

function agendaApi(me: typeof ORGANIZER, opts: { createdState?: string; detailsStatus?: number } = {}) {
  return fakeApi((call: FakeCall, parts) => {
    if (parts[0] === "teams") return json({ id: "t1", title: "Design Team" });
    if (parts[0] !== "meetings") return err(404);
    if (parts.length === 1) return page([MEETING]);
    const tail = parts.slice(2).join("/");
    if (tail === "") return json(MEETING, 200, '"4"');
    if (tail === "access/me") return json(me);
    if (tail === "members") return page([{ ...me, id: "mm1" }]);
    if (tail === "versions" || tail === "attachments") return page([]);
    if (tail === "agenda") {
      if (call.method === "POST") return json({ ...entry(String(call.body.id), opts.createdState ?? "PROPOSED", 1), text: call.body.text }, 201);
      return page([entry("g1", "ACCEPTED"), entry("g2", "PROPOSED"), entry("g3", "REJECTED")]);
    }
    const [, entryId, leaf] = parts.slice(2);
    if (leaf === undefined && call.method === "PATCH") return json({ ...entry(entryId!, String(call.body.state)), revision: 2 });
    if (leaf === "details") {
      if (opts.detailsStatus) return err(opts.detailsStatus);
      if (call.method === "PATCH") return json(detail(entryId!, { ...call.body, revision: 3 }));
      return json(detail(entryId!, entryId === "g1" ? { completed: true, completedAt: at } : { plannedMinutes: null }), 200, '"2"');
    }
    return err(404);
  });
}

describe("live agenda details", () => {
  it("detail: planned minutes (null stays null) and completion for accepted entries; organisers may edit", async () => {
    const meeting = (await createApiMessaging(agendaApi(ORGANIZER).client, USER).meetings.get(M1))!;
    expect(meeting.agenda.map((item) => [item.id, item.minutes, item.done, item.proposed])).toEqual([
      ["g1", 15, true, false],
      ["g2", null, null, true],
    ]);
    expect(meeting.canEditAgenda).toBe(true);
  });

  it("non-organisers cannot edit; unreadable details stay unknown (never 0 / false)", async () => {
    const meeting = (await createApiMessaging(agendaApi(PARTICIPANT, { detailsStatus: 403 }).client, USER).meetings.get(M1))!;
    expect(meeting.canEditAgenda).toBe(false);
    expect(meeting.agenda.map((item) => [item.minutes, item.done])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it("organiser add: create → accept (If-Match created revision) → planned minutes (If-Match accepted revision)", async () => {
    const api = agendaApi(ORGANIZER);
    await createApiMessaging(api.client, USER).meetings.addAgenda(M1, " Budget ", 20);
    const [post, accept, minutes] = api.calls.filter((call) => call.method !== "GET");
    expect(post).toMatchObject({ method: "POST", path: `/meetings/${M1}/agenda`, body: { text: "Budget" } });
    expect(accept).toMatchObject({ method: "PATCH", path: `/meetings/${M1}/agenda/${post!.body.id}`, ifMatch: '"1"', body: { state: "ACCEPTED" } });
    expect(minutes).toMatchObject({ method: "PATCH", path: `/meetings/${M1}/agenda/${post!.body.id}/details`, ifMatch: '"2"', body: { plannedMinutes: 20 } });
    expect(new Set([post!.key, accept!.key, minutes!.key]).size).toBe(3);
  });

  it("an entry the server already accepted is not accepted again", async () => {
    const api = agendaApi(ORGANIZER, { createdState: "ACCEPTED" });
    await createApiMessaging(api.client, USER).meetings.addAgenda(M1, "Budget", 10);
    expect(api.writes()).toEqual([`POST /meetings/${M1}/agenda`, expect.stringMatching(/\/details$/)]);
  });

  it("toggle flips completion with the details ETag; a 409 is reported, never retried", async () => {
    const api = agendaApi(ORGANIZER);
    await createApiMessaging(api.client, USER).meetings.toggleAgenda(M1, "g1");
    const patch = api.calls.find((call) => call.method === "PATCH")!;
    expect(patch).toMatchObject({ path: `/meetings/${M1}/agenda/g1/details`, ifMatch: '"2"', body: { completed: false } });
    expect(patch.key).toBeTruthy();

    const conflict = fakeApi((call, parts) => (call.method === "PATCH" ? err(409) : parts.at(-1) === "details" ? json(detail("g1"), 200, '"2"') : err(404)));
    await expect(createApiMessaging(conflict.client, USER).meetings.toggleAgenda(M1, "g1")).rejects.toBeTruthy();
    expect(conflict.writes()).toHaveLength(1);
  });
});
