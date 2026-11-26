import { describe, expect, it } from "vitest";
import { RepositoryError } from "../repositories";
import { createApiCompanyRepository } from "./api-company-repository";
import { err, fakeApi, json } from "./test-support";

/* Company gap closure: department transfers, company notifications, pending invitations, corrective-action reviewers (contract fakes). */

const C = "c1";
const ROOT = "root-scope";
const company = { id: C, spaceId: "sp1", scopeId: ROOT, title: "Acme", description: null, revision: 3, state: "ACTIVE" };
const ME = { accessId: "m1", actorId: "a-m1", role: "OWNER", generation: 4, capabilities: ["directory.read", "staff.manage"] };
const dept = (id: string) => ({ id, scopeId: `${id}-scope`, title: id.toUpperCase(), kind: "DEPARTMENT", departmentId: null, revision: 1 });
const member = (id: string, actor: string, role = "MEMBER", scopeId = ROOT, revision = 1) => ({
  id,
  displayName: actor.toUpperCase(),
  spaceId: "sp1",
  scopeId,
  actorId: actor,
  memberRole: role === "OWNER" ? "ORG_ADMIN" : role,
  state: "ACTIVE",
  generation: 2,
  revision,
  role,
});
const ROOT_MEMBERS = [member("m1", "a-m1", "OWNER"), member("m2", "a-m2", "ORG_ADMIN"), member("m3", "a-m3"), member("m4", "a-m4", "ORG_ADMIN")];
/** Sara (a-m3) sits in D1 with her own seat (access id "s3"). */
const D1_MEMBERS = [member("s3", "a-m3", "MEMBER", "d1-scope", 4), member("s5", "a-m5", "DEPT_MANAGER", "d1-scope", 2)];

type Call = { method: string; path: string; body: Record<string, unknown>; query: Record<string, string>; ifMatch: string | null };
function companyApi(handle: (call: Call, parts: string[]) => Response | null) {
  return fakeApi((call, parts) => {
    const hit = handle(call, parts);
    if (hit) return hit;
    if (parts.length === 2) return json(company, 200, '"3"');
    if (parts[2] === "departments" && parts[4] === "units") return json({ items: [], nextCursor: null });
    if (parts[2] === "departments") return json({ items: [dept("d1"), dept("d2")], nextCursor: null });
    if (parts[4] === "access") return json(ME);
    if (parts[4] === "members") return json({ items: parts[3] === "d1-scope" ? D1_MEMBERS : parts[3] === ROOT ? ROOT_MEMBERS : [], nextCursor: null });
    return json({ items: [], nextCursor: null });
  });
}

const preview = { role: "MEMBER", activeAllocations: 0, pendingResourceRequests: 0, pendingExpenseReviews: 0, allowed: true };

describe("companies — department transfer", () => {
  it("previews the person's department seat between two contexts of the same company", async () => {
    const api = companyApi((_call, parts) => (parts[2] === "department-transfers" ? json({ ...preview, pendingResourceRequests: 1, allowed: false }) : null));
    const repo = createApiCompanyRepository(api.client);
    const result = await repo.previewTransfer(C, "m3", "d1", "d2");
    expect(result).toEqual({ role: "member", activeAllocations: 0, pendingResourceRequests: 1, pendingExpenseReviews: 0, allowed: false });
    const call = api.calls.find((entry) => entry.path.endsWith("/department-transfers/preview"))!;
    expect(call.query).toEqual({ accessId: "s3", fromScopeId: "d1-scope", toScopeId: "d2-scope" });
  });

  it("moves the seat with its revision as If-Match and keeps the role", async () => {
    const api = companyApi((call, parts) =>
      parts[2] === "department-transfers" && call.method === "POST"
        ? json({ id: call.body.id, from: { scopeId: "d1-scope", accessId: "s3", generation: 2 }, to: { scopeId: "d2-scope", accessId: "s9", generation: 1, revision: 1 }, memberRole: "MEMBER", createdAt: "2026-11-14T08:00:00.000Z" }, 201)
        : null,
    );
    const repo = createApiCompanyRepository(api.client);
    await repo.transferEmployee(C, "m3", "d1", "d2");
    const post = api.calls.find((call) => call.method === "POST")!;
    expect(post.path).toBe(`/companies/${C}/department-transfers`);
    expect(post.ifMatch).toBe('"4"');
    expect(post.body).toMatchObject({ accessId: "s3", fromScopeId: "d1-scope", toScopeId: "d2-scope", memberRole: "MEMBER" });
    expect(typeof post.body.id).toBe("string");
  });

  it("a stale or blocked move answers conflict; a manager's seat never posts", async () => {
    const api = companyApi((call, parts) => (parts[2] === "department-transfers" && call.method === "POST" ? json({ code: "STALE_REVISION" }, 409) : null));
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.transferEmployee(C, "m3", "d1", "d2")).rejects.toMatchObject({ code: "conflict" });
    const before = api.writes().length;
    // a-m5 is D1's manager: managers move through a role change.
    ROOT_MEMBERS.push(member("m5", "a-m5"));
    try {
      await expect(repo.transferEmployee(C, "m5", "d1", "d2")).rejects.toMatchObject({ code: "conflict" });
    } finally {
      ROOT_MEMBERS.pop();
    }
    expect(api.writes().length).toBe(before);
  });

  it("refuses the same department and a person without a seat there", async () => {
    const repo = createApiCompanyRepository(companyApi(() => null).client);
    await expect(repo.previewTransfer(C, "m3", "d1", "d1")).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.previewTransfer(C, "m2", "d1", "d2")).rejects.toBeInstanceOf(RepositoryError);
  });

  it("a forbidden preview maps to forbidden", async () => {
    const api = companyApi((_call, parts) => (parts[2] === "department-transfers" ? json({ code: "FORBIDDEN" }, 403) : null));
    await expect(createApiCompanyRepository(api.client).previewTransfer(C, "m3", "d1", "d2")).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("companies — notifications", () => {
  const row = (id: string, kind: string, createdAt: string, readAt: string | null = null) => ({ id, kind, subjectId: `subject-${id}`, createdAt, readAt });

  it("lists the caller's notifications of every context, newest first, and reads one in its own context", async () => {
    const api = companyApi((call, parts) => {
      if (parts[4] !== "notifications") return null;
      if (parts[6] === "read") return json(row(parts[5]!, "KNOWLEDGE_ACK_REMINDER", "2026-11-13T08:00:00.000Z", "2026-11-14T08:00:00.000Z"));
      if (parts[3] === ROOT) return json({ items: [row("n1", "EMPLOYEE_FILE_REQUEST", "2026-11-12T08:00:00.000Z")], nextCursor: null });
      if (parts[3] === "d1-scope") return json({ items: [row("n2", "KNOWLEDGE_ACK_REMINDER", "2026-11-13T08:00:00.000Z")], nextCursor: null });
      // D2 is not open to the caller.
      return json({ code: "FORBIDDEN" }, 403);
    });
    const repo = createApiCompanyRepository(api.client);
    const list = await repo.notifications(C);
    expect(list).toEqual([
      { id: "n2", kind: "kb-ack-reminder", subjectId: "subject-n2", createdAt: "2026-11-13T08:00:00.000Z", read: false },
      { id: "n1", kind: "file-request", subjectId: "subject-n1", createdAt: "2026-11-12T08:00:00.000Z", read: false },
    ]);
    const read = await repo.readNotification(C, "n2");
    expect(read.read).toBe(true);
    expect(api.writes()).toEqual([`POST /companies/${C}/contexts/d1-scope/notifications/n2/read`]);
  });

  it("an unknown notification is not found and nothing is written", async () => {
    const api = companyApi(() => null);
    await expect(createApiCompanyRepository(api.client).readNotification(C, "nx")).rejects.toMatchObject({ code: "not-found" });
    expect(api.writes()).toEqual([]);
  });
});

describe("companies — pending invitations and corrective reviewers", () => {
  it("lists live pending sent invitations with the recipient email the server returns (null stays null)", async () => {
    const invitation = (id: string, state: string, memberRole = "MEMBER", recipientEmail: string | null = null, expiresAt = "2999-11-30T00:00:00.000Z") =>
      ({ id, scopeId: ROOT, memberRole, recipientEmail, state, revision: 1, createdAt: "2026-11-14T08:00:00.000Z", sentAt: "2026-11-14T08:00:00.000Z", expiresAt });
    const api = companyApi((_call, parts) => {
      if (parts[4] !== "sent-invitations") return null;
      return json({
        items:
          parts[3] === "d1-scope"
            ? [invitation("i2", "PENDING", "TEAM_LEAD", "lead@acme.ir"), invitation("i3", "ACCEPTED"), invitation("i4", "PENDING", "MEMBER", "old@acme.ir", "2020-01-01T00:00:00.000Z")]
            : parts[3] === ROOT
              ? [invitation("i1", "PENDING")]
              : [],
        nextCursor: null,
      });
    });
    const list = await createApiCompanyRepository(api.client).pendingInvites(C);
    expect(list).toEqual([
      { id: "i1", email: null, role: "member", departmentName: "Acme", sentAt: "2026-11-14T08:00:00.000Z", expiresAt: "2999-11-30T00:00:00.000Z" },
      { id: "i2", email: "lead@acme.ir", role: "lead", departmentName: "D1", sentAt: "2026-11-14T08:00:00.000Z", expiresAt: "2999-11-30T00:00:00.000Z" },
    ]);
    expect(api.calls.some((call) => call.path.endsWith("/invitations"))).toBe(false);
  });

  it("resends a pending invitation with its current revision and an Idempotency-Key", async () => {
    const row = { id: "i2", scopeId: "d1-scope", memberRole: "MEMBER", recipientEmail: "a@acme.ir", state: "PENDING", revision: 4, createdAt: "2026-11-14T08:00:00.000Z", sentAt: "2026-11-14T08:00:00.000Z", expiresAt: "2999-11-30T00:00:00.000Z" };
    const api = companyApi((call, parts) => {
      if (parts[4] === "sent-invitations") return json({ items: parts[3] === "d1-scope" ? [row] : [], nextCursor: null });
      if (parts[6] === "resend") return call.ifMatch === '"4"' ? json({ ...row, spaceId: "sp1", revision: 5 }) : err(409);
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    await repo.pendingInvites(C);
    await repo.resendInvite(C, "i2");
    expect(api.calls.find((call) => call.path.endsWith("/resend"))).toMatchObject({ method: "POST", path: expect.stringContaining("d1-scope/invitations/i2/resend"), ifMatch: '"4"', body: {} });
    expect(api.calls.find((call) => call.path.endsWith("/resend"))!.key).toBeTruthy();
    await expect(repo.resendInvite(C, "unknown")).rejects.toMatchObject({ code: "not-found" });
  });

  it("reviewers are other active Owners / Org Admins; the case carries subject and reviewer seats", async () => {
    const api = companyApi((call, parts) =>
      parts[4] === "employee-cases" && call.method === "POST"
        ? json({ id: "k1", spaceId: "sp1", scopeId: ROOT, author: { accessId: "m1", generation: 4, displayName: "Mehran" }, subject: { accessId: "m3", generation: 2 }, reviewer: { accessId: "m2", generation: 2, displayName: "Sara" }, reason: "Late", evidence: "log.csv", state: "OPEN", revision: 1, createdAt: "2026-11-14T08:00:00.000Z" }, 201)
        : null,
    );
    const repo = createApiCompanyRepository(api.client);
    expect(await repo.caseReviewers(C, "m4")).toEqual([{ id: "m2", name: "A-M2" }]);
    const action = await repo.openCorrective(C, "m3", { reason: " Late ", evidence: "log.csv", reviewerId: "m2" });
    expect(action).toMatchObject({ id: "k1", status: "open", reason: "Late", visibleTo: "Sara" });
    const post = api.calls.find((call) => call.method === "POST")!;
    expect(post.body).toMatchObject({ subject: { accessId: "m3", generation: 2 }, reviewer: { accessId: "m2", generation: 2 }, reason: "Late", evidence: "log.csv" });
  });
});

describe("companies — resource types and asset tags", () => {
  const resource = { id: "r9", title: "Laptop 30", description: null, typeId: null as string | null, spaceId: "sp1", scopeId: ROOT, state: "ACTIVE", revision: 1, createdAt: "x", updatedAt: "x" };
  const type = (id: string, title: string, scopeId = ROOT) => ({ id, title, spaceId: "sp1", scopeId, revision: 1, createdAt: "x", updatedAt: "x" });

  it("lists the target context's configured types (department → its own catalog; empty stays empty)", async () => {
    const api = companyApi((_call, parts) => (parts[4] === "resource-types" ? json({ items: parts[3] === ROOT ? [type("t1", "Laptop")] : [], nextCursor: null }) : null));
    const repo = createApiCompanyRepository(api.client);
    expect(await repo.resourceTypes(C, null)).toEqual([{ id: "t1", key: null, title: "Laptop" }]);
    expect(await repo.resourceTypes(C, "d1")).toEqual([]);
    expect(api.calls.filter((call) => call.path.endsWith("/resource-types")).map((call) => call.path.split("/")[4])).toEqual([ROOT, "d1-scope"]);
  });

  it("creates the resource, sets the chosen type, then the asset tag — each on the revision the previous call returned", async () => {
    let state = { ...resource };
    let assetTag: string | null = null;
    const api = companyApi((call, parts) => {
      if (parts[4] === "resource-types") return json({ items: parts[3] === ROOT ? [type("t1", "Laptop")] : [], nextCursor: null });
      if (parts[4] !== "resources" || parts[3] !== ROOT) return null;
      if (parts.length === 5 && call.method === "POST") return json(state, 201);
      if (parts.length === 5) return json({ items: state.typeId ? [state] : [], nextCursor: null });
      if (parts[6] === "type") {
        state = { ...state, typeId: "t1", revision: 2 };
        return json(state);
      }
      if (parts[6] === "asset-tag" && call.method === "POST") {
        assetTag = "EU-LT-030";
        return json({ id: "r9", assetTag, revision: 3 });
      }
      if (parts[6] === "asset-tag") return json({ id: "r9", assetTag, revision: 3 });
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    const added = await repo.addResource(C, { name: " Laptop 30 ", tag: " EU-LT-030 ", typeId: "t1", departmentId: null });
    expect(added).toMatchObject({ id: "r9", tag: "EU-LT-030", name: "Laptop 30", typeTitle: "Laptop", status: "available" });
    const create = api.calls.find((call) => call.method === "POST" && call.path.endsWith("/resources"))!;
    expect(create.key).toBeTruthy();
    expect(create.body).toMatchObject({ title: "Laptop 30" });
    expect(api.calls.find((call) => call.method === "PUT" && call.path.endsWith("/type"))).toMatchObject({ ifMatch: '"1"', body: { typeId: "t1" } });
    expect(api.calls.find((call) => call.method === "POST" && call.path.endsWith("/asset-tag"))).toMatchObject({ ifMatch: '"2"', body: { assetTag: "EU-LT-030" } });
  });

  it("refuses a type outside the context's catalog (incl. an empty catalog) and an empty tag before any write", async () => {
    const api = companyApi((_call, parts) => (parts[4] === "resource-types" ? json({ items: parts[3] === ROOT ? [type("t1", "Laptop")] : [], nextCursor: null }) : null));
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.addResource(C, { name: "Phone", tag: "P-1", typeId: "phone", departmentId: null })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.addResource(C, { name: "Phone", tag: "P-1", typeId: "t1", departmentId: "d1" })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.addResource(C, { name: "Phone", tag: " ", typeId: "t1", departmentId: null })).rejects.toMatchObject({ code: "invalid" });
    expect(api.writes()).toEqual([]);
  });

  it("a taken asset tag (409) retires the resource it just created and reports a conflict", async () => {
    const api = companyApi((call, parts) => {
      if (parts[4] === "resource-types") return json({ items: [type("t1", "Laptop")], nextCursor: null });
      if (parts[4] !== "resources" || parts[3] !== ROOT) return null;
      if (parts.length === 5 && call.method === "POST") return json(resource, 201);
      if (parts[6] === "type") return json({ ...resource, typeId: "t1", revision: 2 });
      if (parts[6] === "asset-tag") return json({ error: { code: "CONFLICT", message: "taken" } }, 409);
      if (parts[6] === "retire") return json({ ...resource, state: "RETIRED", revision: 3 });
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.addResource(C, { name: "Dup", tag: "EU-LT-030", typeId: "t1", departmentId: null })).rejects.toMatchObject({ code: "conflict" });
    expect(api.calls.find((call) => call.path.endsWith("/r9/retire"))).toMatchObject({ method: "POST", ifMatch: '"2"' });
  });
});

describe("companies — create (catalog COMPANY policy, then settings and first departments)", () => {
  const settingsRow = { legalName: null, currency: null, currencyLocked: false, fiscalStartMonth: null, revision: 1 };
  const input = { name: " Acme ", legalName: " Acme LLC ", currency: "toman" as const, fiscalStartMonth: 1, departments: ["Ops", " ops ", "Ops", "", "Sales"] };
  function createApi(options: { policies?: unknown[]; createStatus?: number; failDepartmentsOnce?: boolean } = {}) {
    let failed = false;
    return companyApi((call, parts) => {
      if (parts[0] === "retention-policies") return json({ items: options.policies ?? [{ version: "policy-from-catalog", applicableContexts: ["COMPANY"] }], nextCursor: null });
      if (parts.length === 1 && parts[0] === "companies" && call.method === "POST") {
        if (options.createStatus) return json({ error: { code: "DENIED", message: "denied" } }, options.createStatus);
        return json({ ...company, id: C }, 201);
      }
      if (parts[2] === "settings" && parts.length === 3) return json(settingsRow);
      if (parts[2] === "settings" && parts[3] === "legal") return json({ ...settingsRow, legalName: "Acme LLC", fiscalStartMonth: 1, revision: 2 });
      if (parts[2] === "settings" && parts[3] === "currency") return json({ ...settingsRow, currency: "IRR", revision: 3 });
      if (parts[2] === "departments" && call.method === "POST") {
        if (options.failDepartmentsOnce && !failed) {
          failed = true;
          return json({ error: { code: "UNAVAILABLE", message: "down" } }, 503);
        }
        return json({ ...dept("d9"), title: call.body.title }, 201);
      }
      return null;
    });
  }

  it("creates the company with the catalog's policy, then legal name, fiscal month, currency and unique departments", async () => {
    const api = createApi();
    const summary = await createApiCompanyRepository(api.client).create(input);
    expect(summary).toMatchObject({ id: C, name: "Acme", role: "owner" });
    const post = api.calls.find((call) => call.method === "POST" && call.path === "/companies")!;
    expect(post.body).toEqual({ id: expect.any(String), title: "Acme", retentionPolicyVersion: "policy-from-catalog" });
    expect((post as { key?: string | null }).key).toBeTruthy();
    expect(api.calls.find((call) => call.path.endsWith("/settings/legal"))).toMatchObject({ method: "PUT", ifMatch: '"1"', body: { legalName: "Acme LLC", fiscalStartMonth: 1 } });
    expect(api.calls.find((call) => call.path.endsWith("/settings/currency"))).toMatchObject({ method: "PUT", ifMatch: '"2"', body: { currency: "IRR" } });
    expect(api.calls.filter((call) => call.method === "POST" && call.path.endsWith("/departments")).map((call) => call.body.title)).toEqual(["Ops", "ops", "Sales"]);
  });

  it("a resubmit after an incomplete setup replays the same company id, key and department ids (no duplicate)", async () => {
    const api = createApi({ failDepartmentsOnce: true });
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.create(input)).rejects.toMatchObject({ code: "partial" });
    await repo.create(input);
    const creates = api.calls.filter((call) => call.method === "POST" && call.path === "/companies") as { body: Record<string, unknown>; key?: string | null }[];
    expect(creates).toHaveLength(2);
    expect(creates[1]!.body.id).toBe(creates[0]!.body.id);
    expect(creates[1]!.key).toBe(creates[0]!.key);
    const departments = api.calls.filter((call) => call.method === "POST" && call.path.endsWith("/departments")) as { body: Record<string, unknown>; key?: string | null }[];
    expect(departments[1]!.body.id).toBe(departments[0]!.body.id);
    expect(departments[1]!.key).toBe(departments[0]!.key);
    // A different form is a different company: fresh id.
    await repo.create({ ...input, name: "Other" });
    const third = api.calls.filter((call) => call.method === "POST" && call.path === "/companies")[2]!;
    expect(third.body.id).not.toBe(creates[0]!.body.id);
  });

  it("validates before any request; no or several COMPANY policies refuse without writing", async () => {
    const api = createApi({ policies: [] });
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.create({ ...input, name: "  " })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.create({ ...input, fiscalStartMonth: 13 })).rejects.toMatchObject({ code: "invalid" });
    await expect(repo.create(input)).rejects.toMatchObject({ code: "unsupported" });
    const several = createApi({ policies: [{ version: "a", applicableContexts: ["COMPANY"] }, { version: "b", applicableContexts: ["COMPANY"] }] });
    await expect(createApiCompanyRepository(several.client).create(input)).rejects.toMatchObject({ code: "unsupported" });
    expect([...api.writes(), ...several.writes()]).toEqual([]);
  });

  it("maps server refusals: 403 → forbidden, 409 → conflict (never a fake summary)", async () => {
    await expect(createApiCompanyRepository(createApi({ createStatus: 403 }).client).create(input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(createApiCompanyRepository(createApi({ createStatus: 409 }).client).create(input)).rejects.toMatchObject({ code: "conflict" });
  });
});
