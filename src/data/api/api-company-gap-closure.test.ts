import { describe, expect, it } from "vitest";
import { RepositoryError } from "../repositories";
import { createApiCompanyRepository } from "./api-company-repository";
import { fakeApi, json } from "./test-support";

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
  it("lists pending invitations without inventing a recipient email", async () => {
    const invitation = (id: string, state: string, memberRole = "MEMBER") => ({ id, spaceId: "sp1", scopeId: ROOT, memberRole, state, revision: 1, expiresAt: "2026-11-30T00:00:00.000Z" });
    const api = companyApi((_call, parts) => {
      if (parts[4] !== "invitations") return null;
      return json({ items: parts[3] === "d1-scope" ? [invitation("i2", "PENDING", "TEAM_LEAD"), invitation("i3", "ACCEPTED")] : parts[3] === ROOT ? [invitation("i1", "PENDING")] : [], nextCursor: null });
    });
    const list = await createApiCompanyRepository(api.client).pendingInvites(C);
    expect(list).toEqual([
      { id: "i1", email: null, role: "member", departmentName: "Acme" },
      { id: "i2", email: null, role: "lead", departmentName: "D1" },
    ]);
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
