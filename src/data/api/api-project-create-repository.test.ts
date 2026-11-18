import { describe, expect, it } from "vitest";
import { ProjectCreatePartialError } from "../project-repositories";
import { createApiProjectCreateRepository } from "./api-project-create-repository";
import { err, fakeApi, json } from "./test-support";

/* Contract fake for PJ-90 create: one atomic POST /projects (key, dates, template, team owner), then the summary re-read. */

const input = { name: " Apollo ", key: "APL", description: "Ship it", startDate: "2026-11-14", endDate: "2027-01-13", template: "blank" as const };

const createApi = (over: { createStatus?: number; readStatus?: number; catalog?: string[] } = {}) => {
  let created: string | null = null;
  return fakeApi((call, parts) => {
    if (parts[0] === "retention-policies")
      return json({ items: (over.catalog ?? ["mp-rpc-v1.0-work"]).map((version) => ({ version, applicableContexts: ["PROJECT", "TEAM"] })) });
    if (parts[0] === "me") return json({ items: [], nextCursor: null });
    if (call.method === "POST" && parts.length === 1) return over.createStatus ? err(over.createStatus) : ((created = call.body.id as string), json({ id: created, spaceId: "s1", revision: 1 }, 201));
    if (over.readStatus) return err(over.readStatus);
    const project = { id: created, spaceId: "s1", scopeId: "sc", title: "Apollo", description: "Ship it", revision: 1, state: "ACTIVE", updatedAt: "2026-11-14T09:00:00.000Z" };
    if (parts[2] === "metadata" && call.method === "GET") return json({ id: created, key: null, color: null, startDate: null, endDate: null, statusNote: null, revision: 1 }, 200, '"1"');
    if (parts[3] === "me") return json({ accessId: "m1", actorId: "a-m1", role: "OWNER", state: "ACTIVE", generation: 1, scope: "FULL", projectState: "ACTIVE", capabilities: [] });
    if (parts[2] === "dashboard") return json({ report: {}, progress: { completedTasks: 0, eligibleTasks: 0, percent: 0 }, health: {} });
    if (parts[2] === "members" || parts[2] === "components" || parts[2] === "register-items") return json({ items: [], nextCursor: null });
    if (call.method === "GET" && parts.length === 2) return json(project);
    return err(404);
  });
};

describe("live project create", () => {
  it("creates key, dates, template and team owner in one POST with the catalog policy", async () => {
    const api = createApi();
    const project = await createApiProjectCreateRepository(api.client).create({ ...input, template: "scrum", ownerTeamId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c9" });
    const post = api.calls.find((call) => call.method === "POST")!;
    expect(post.path).toBe("/projects");
    expect(post.key).toBeTruthy();
    expect(post.body).toEqual({
      id: post.body.id,
      title: "Apollo",
      description: "Ship it",
      retentionPolicyVersion: "mp-rpc-v1.0-work",
      key: "APL",
      startDate: "2026-11-14",
      endDate: "2027-01-13",
      template: "SCRUM",
      ownerTeamId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c9",
    });
    expect(project).toMatchObject({ id: post.body.id, name: "Apollo" });
    expect(api.writes()).toEqual(["POST /projects"]);
  });

  it("refuses what the catalogue cannot create before any request; key availability is the server's", async () => {
    const api = createApi();
    const repo = createApiProjectCreateRepository(api.client);
    await expect(repo.create({ ...input, template: "website" })).rejects.toMatchObject({ code: "unsupported", message: "template" });
    await expect(repo.create({ ...input, key: "a b" })).rejects.toMatchObject({ code: "invalid", message: "key-format" });
    await expect(repo.create({ ...input, endDate: "2026-11-01" })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.discard("p1")).rejects.toMatchObject({ code: "unsupported" });
    expect(await repo.isKeyAvailable("APL")).toBe(true);
    expect(api.calls).toEqual([]);
  });

  it("a 409 is key-taken only with the PROJECT_KEY_CONFLICT reason; without details it stays the generic conflict", async () => {
    const reasoned = fakeApi((call, parts) =>
      parts[0] === "retention-policies"
        ? json({ items: [{ version: "mp-rpc-v1.0-work", applicableContexts: ["PROJECT"] }] })
        : json({ error: { code: "CONFLICT", message: "x", requestId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c4", details: [{ path: "", code: "PROJECT_KEY_CONFLICT" }] } }, 409),
    );
    await expect(createApiProjectCreateRepository(reasoned.client).create(input)).rejects.toMatchObject({ code: "invalid", message: "key-taken" });
    await expect(createApiProjectCreateRepository(createApi({ createStatus: 409 }).client).create(input)).rejects.toMatchObject({ code: "conflict" });
  });

  it("no single catalog policy: refused before creating", async () => {
    const api = createApi({ catalog: [] });
    await expect(createApiProjectCreateRepository(api.client).create(input)).rejects.toMatchObject({ code: "unsupported" });
    expect(api.writes()).toEqual([]);
  });

  it("read-back fails after the create: a partial outcome with the created id, never a second create", async () => {
    const api = createApi({ readStatus: 500 });
    const failure = await createApiProjectCreateRepository(api.client).create(input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProjectCreatePartialError);
    const post = api.calls.find((call) => call.method === "POST")!;
    expect(failure).toMatchObject({ code: "partial", stage: "read", projectId: post.body.id, projectName: "Apollo" });
    expect(api.writes().filter((write) => write === "POST /projects")).toHaveLength(1);
  });

  it("a stable attempt id is the project id and Idempotency-Key (a resubmit replays); limits = the server catalogue, team owner, no Undo", async () => {
    const api = createApi();
    const repo = createApiProjectCreateRepository(api.client);
    expect(repo.limits).toEqual({ templates: ["blank", "kanban", "scrum"], teamOwner: true, discard: false });
    await repo.create({ ...input, attemptId: "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c5" });
    const post = api.calls.find((call) => call.method === "POST")!;
    expect([post.body.id, post.key]).toEqual(["6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c5", "6f1c2b8e-3d4a-4b5c-9d6e-7f8091a2b3c5"]);
  });
});
