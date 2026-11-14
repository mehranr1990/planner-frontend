import { describe, expect, it } from "vitest";
import { createApiCompanyRepository } from "./api-company-repository";
import { fakeApi, json } from "./test-support";

/* Companies Session 4 (overview KPIs, staff, associations, resource requests, expenses, grants, KB create, documents) against contract fakes. */

const C = "c1";
const ROOT = "root-scope";
const company = { id: C, spaceId: "sp1", scopeId: ROOT, title: "Acme", description: null, revision: 3, state: "ACTIVE" };
const ME = { accessId: "m1", actorId: "a1", role: "OWNER", generation: 4, capabilities: ["directory.read", "staff.manage", "finance.manage", "knowledge.manage", "invitation.member"] };
const dept = (id: string) => ({ id, scopeId: `${id}-scope`, title: id.toUpperCase(), kind: "DEPARTMENT", departmentId: null, revision: 1 });
const member = (id: string, name: string, role = "MEMBER") => ({ id, displayName: name, spaceId: "sp1", scopeId: ROOT, actorId: `a-${id}`, memberRole: role, state: "ACTIVE", generation: 2, revision: 1, role });
const kpis = (projects: number, basisPoints: number | null) => ({
  tasks: { projectCount: projects, completion: { numerator: 1, denominator: 2, basisPoints }, overdueTaskCount: 0, completedInWindow: 0 },
  goals: { goalCount: 3, measuredGoals: 2, averageProgress: 40 },
  capacity: { memberCount: 7, knownCapacityDays: 1, unknownCapacityDays: 0, availableMinutes: 1000, estimatedMinutes: 500, unknownEstimates: 0 },
  expenses: { currency: "IRR", spent: "10", budgetCount: 1, budgetSpent: "10", budgetLimit: "100", usageBasisPoints: 1000 },
});

type Call = { method: string; path: string; body: Record<string, unknown>; query: Record<string, string>; ifMatch: string | null };
function companyApi(handle: (call: Call, parts: string[]) => Response | null) {
  return fakeApi((call, parts) => {
    const hit = handle(call, parts);
    if (hit) return hit;
    if (parts.length === 2) return json(company, 200, '"3"');
    if (parts[2] === "settings") return json({ currency: "IRR", currencyLocked: false, legalName: null, fiscalStartMonth: null });
    if (parts[2] === "departments" && parts[4] === "units") return json({ items: [], nextCursor: null });
    if (parts[2] === "departments") return json({ items: [dept("d1")], nextCursor: null });
    if (parts[4] === "access") return json(ME);
    if (parts[4] === "members") return json({ items: [member("m1", "Mehran", "OWNER"), member("m2", "Sara", "ORG_ADMIN")], nextCursor: null });
    return json({ items: [], nextCursor: null });
  });
}

describe("companies — session 4", () => {
  it("overview uses real KPIs and leaves unserved figures null", async () => {
    const api = companyApi((_call, parts) => {
      if (parts[5] === "kpis") return json(parts[3] === ROOT ? kpis(4, null) : kpis(2, 5000));
      if (parts[4] === "association-summaries" && parts[3] === ROOT)
        return json({ items: [{ associationId: "as1", kind: "TEAM", sourceId: "t1", state: "ATTACHED", source: { title: "Core", lifecycleState: "ACTIVE", responsibleDisplayName: "Sara", memberCount: 5 } }], nextCursor: null });
      if (parts[5] === "finance")
        return json({ currencies: [], budgets: [{ id: "b1", currency: "IRR", scale: 0, limit: "100", spent: "30", reserved: "20", available: "50", archived: false }] });
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    const data = await repo.overview(C, null, "owner");
    expect(data.portfolio).toMatchObject({ active: 4, onTrack: null, history: [] });
    expect(data.kpis).toMatchObject({ teams: 1, people: 7, goals: 3, goalsProgress: 40, goalsOnPace: null, teamsSentPlan: null, joinedThisQuarter: null });
    expect(data.departments).toEqual([{ departmentId: "d1", name: "D1", progress: 50, status: null, capacity: 50 }]);
    expect(data.budget).toMatchObject({ budget: 100, approved: 30, committed: 20, left: 50, pending: null });
    expect(data.watch).toBeNull();
  });

  it("staff comes from the directory; an edit sends position then work details with the profile revision", async () => {
    const row = { profileId: "p2", scopeId: ROOT, member: { accessId: "m2", generation: 2, displayName: "Sara" }, position: "Lead", workStatus: "ACTIVE", workEmail: "s@acme.ir", workPhone: null, workLocation: "HQ", workHours: null };
    const profile = { id: "p2", member: row.member, position: "Lead", supervisor: { accessId: "m1", generation: 4, displayName: "Mehran" }, workStatus: "ACTIVE", workEmail: null, redactedAt: null, revision: 5 };
    const api = companyApi((call, parts) => {
      if (parts[4] === "directory") return json({ items: parts[3] === ROOT ? [row] : [], nextCursor: null });
      if (parts[4] === "staff-profiles" && parts.length === 5) return json({ items: parts[3] === ROOT ? [profile] : [], nextCursor: null });
      if (parts[4] === "staff-profiles" && parts[6] === "work-details") return json({ profileId: "p2", revision: 7 });
      if (parts[4] === "staff-profiles" && call.method === "PATCH") return json({ ...profile, position: "Head", revision: 6 });
      if (parts[4] === "staff-profiles") return json(profile);
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    const [person] = await repo.staff(C, "owner");
    expect(person).toMatchObject({ id: "m2", role: "admin", position: "Lead", supervisorName: "Mehran", location: "HQ", bookedPercent: null, equipment: null });
    await repo.updateWorkProfile(C, "m2", { position: "Head", location: "HQ 2", workHours: "9–17", phone: null });
    const patch = api.calls.find((call) => call.method === "PATCH")!;
    const put = api.calls.find((call) => call.path.endsWith("/work-details"))!;
    expect(patch).toMatchObject({ ifMatch: '"5"', body: { position: "Head" } });
    expect(put).toMatchObject({ ifMatch: '"6"', body: { workLocation: "HQ 2", workHours: "9–17", workPhone: null } });
  });

  it("resource requests: whole local days, withdraw with If-Match", async () => {
    const request = { id: "rr1", resourceId: "r1", workflowVersionId: "wv", requester: { accessId: "m1", generation: 4, displayName: "Mehran" }, startAt: "2026-11-20T20:30:00.000Z", endAt: "2026-11-22T20:30:00.000Z", reason: "Trip", state: "PENDING", step: 0, stepCount: 1, pendingRoles: ["DEPT_MANAGER"], allocationId: null, decidedAt: null, revision: 2, createdAt: "2026-11-14T08:00:00.000Z" };
    const api = companyApi((call, parts) => {
      if (parts[4] === "resources" && parts.length === 5) return json({ items: parts[3] === ROOT ? [{ id: "r1", title: "Laptop", state: "ACTIVE", typeId: null, revision: 1 }] : [], nextCursor: null });
      if (parts[4] === "resources" && parts[6] === "requests") return json(request, 201);
      if (parts[4] === "resource-requests" && parts.length === 5) return json({ items: parts[3] === ROOT ? [request] : [], nextCursor: null });
      if (parts[4] === "resource-requests" && parts[6] === "withdraw") return json({ ...request, state: "WITHDRAWN" });
      if (parts[4] === "resource-requests") return json(request);
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    const created = await repo.requestResource(C, { resourceId: "r1", from: "2026-11-21", to: "2026-11-22", reason: "Trip" });
    expect(created).toMatchObject({ id: "rr1", resourceName: "Laptop", status: "pending" });
    const post = api.calls.find((call) => call.path.endsWith("/requests"))!;
    expect(post.body).toMatchObject({ reason: "Trip" });
    expect(Date.parse(post.body.endAt as string) - Date.parse(post.body.startAt as string)).toBe(2 * 86_400_000);
    await repo.withdrawResourceRequest(C, "rr1");
    expect(api.calls.find((call) => call.path.endsWith("/withdraw"))).toMatchObject({ ifMatch: '"2"' });
  });

  it("an expense is saved with the fixed currency, uploads real receipt bytes and submits through the published chain", async () => {
    const version = { id: "v1", state: "DRAFT", requester: { accessId: "m1", generation: 4 }, reviewer: null, payer: { accessId: "m1", generation: 4 }, amount: "250000", currency: "IRR", scale: 0, categoryId: "cat1", occurredDate: "2026-11-10", timezone: "Asia/Tehran", vendor: "Taxi", projectReferenceId: null, allocations: [], submittedAt: null, decidedAt: null };
    const expense = { id: "e1", revision: 1, state: "PENDING", effectiveVersionId: null, current: version, createdAt: "2026-11-10T08:00:00.000Z" };
    let listed = false;
    const api = companyApi((call, parts) => {
      if (parts[5] === "categories") return json({ items: [{ id: "cat1", title: "Travel", archived: false }], nextCursor: null });
      if (parts[4] === "expenses" && parts.length === 5 && call.method === "POST") return json(expense, 201);
      if (parts[4] === "expenses" && parts.length === 5) return json({ items: listed && parts[3] === "d1-scope" ? [expense] : [], nextCursor: null });
      if (parts[8] === "receipts" && call.method === "POST" && parts.length === 9) return json({ id: "rc1", revision: 1, status: "INITIATED" }, 201);
      if (parts[10] === "complete") return json({ id: "rc1", revision: 2, status: "READY" });
      if (parts[5] === "approval-workflows" && parts.length === 6) return json({ items: [{ id: "wf1", kind: "EXPENSE", title: "Expenses" }], nextCursor: null });
      if (parts[5] === "approval-workflows" && parts[7] === "versions") return json({ items: [{ id: "wv2", number: 2, state: "PUBLISHED" }], nextCursor: null });
      if (parts[6] === "workflow-submit") {
        listed = true;
        return json({ id: "ap1", state: "ACTIVE" });
      }
      if (parts[4] === "expenses" && parts.length === 6) return json(expense, 200, '"1"');
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    const file = new Blob(["%PDF"], { type: "application/pdf" });
    await repo.saveExpense(C, { title: "Taxi", amount: 250000, date: "2026-11-10", category: "travel", departmentId: "d1", projectId: null, payer: "me", receipt: { name: "r.pdf", file } }, true);
    const create = api.calls.find((call) => call.method === "POST" && call.path.endsWith("/expenses"))!;
    expect(create.body).toMatchObject({ amount: "250000", currency: "IRR", categoryId: "cat1", vendor: "Taxi", payer: { accessId: "m1", generation: 4 } });
    expect(api.calls.find((call) => call.path.endsWith("/complete"))).toMatchObject({ ifMatch: '"1"' });
    expect(api.calls.find((call) => call.path.endsWith("/workflow-submit"))).toMatchObject({ ifMatch: '"1"', body: { workflowVersionId: "wv2" } });
  });

  it("a submission without a published chain reports a saved draft, never a full success", async () => {
    const expense = { id: "e1", revision: 1, state: "PENDING", effectiveVersionId: null, current: { id: "v1", state: "DRAFT", requester: { accessId: "m1", generation: 4 }, payer: null, amount: "5", currency: "IRR", scale: 0, categoryId: "cat1", occurredDate: "2026-11-10", vendor: "X", projectReferenceId: null }, createdAt: "x" };
    const api = companyApi((call, parts) => {
      if (parts[5] === "categories") return json({ items: [{ id: "cat1", title: "meals", archived: false }], nextCursor: null });
      if (parts[4] === "expenses" && parts.length === 5 && call.method === "POST") return json(expense, 201);
      if (parts[4] === "expenses" && parts.length === 6) return json(expense);
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.saveExpense(C, { title: "X", amount: 5, date: "2026-11-10", category: "meals", departmentId: "d1", projectId: null, payer: "card", receipt: null }, true)).rejects.toMatchObject({ message: "saved-as-draft" });
    expect(api.calls.some((call) => call.path.endsWith("/workflow-submit"))).toBe(false);
  });

  it("a category that is not configured is refused before any write", async () => {
    const api = companyApi(() => null);
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.saveExpense(C, { title: "X", amount: 5, date: "2026-11-10", category: "software", departmentId: "d1", projectId: null, payer: "card", receipt: null }, false)).rejects.toMatchObject({ code: "invalid", message: "category-unavailable" });
    expect(api.writes()).toEqual([]);
  });

  it("grants always expire, never to oneself; a handover names an eligible Org Admin", async () => {
    const api = companyApi((call, parts) => {
      if (parts[2] === "employee-grants" && call.method === "POST") return json({ id: "g1" }, 201);
      if (parts[2] === "employee-grants") return json({ items: [] });
      if (parts[2] === "ownership-handovers") return json({ id: "h1", state: "PENDING" }, 201);
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.setGrant(C, "m2", "hr", null, true)).rejects.toMatchObject({ message: "until-required" });
    await expect(repo.setGrant(C, "m1", "hr", "2099-01-01", true)).rejects.toMatchObject({ message: "self-grant" });
    await repo.setGrant(C, "m2", "finance", "2099-01-01", true);
    expect(api.calls.find((call) => call.path.endsWith("/employee-grants") && call.method === "POST")!.body).toMatchObject({ grantee: { accessId: "m2", generation: 2 }, kind: "FINANCE" });
    const settings = await repo.requestTransfer(C, "m2", "ignored");
    expect(api.calls.find((call) => call.path.endsWith("/ownership-handovers"))!.body).toEqual({ successorAccessId: "m2" });
    expect(settings.transfer).toEqual({ toName: "Sara", status: "pending" });
  });

  it("an employee document uploads the picked bytes; KB create makes the document then publishes its page", async () => {
    const api = companyApi((call, parts) => {
      if (parts[2] === "employee-files" && parts[4] === "documents" && parts.length === 5) return json({ id: "doc1", revision: 1, status: "INITIATED" }, 201);
      if (parts[2] === "employee-files" && parts[6] === "complete") return json({ id: "doc1", revision: 2, status: "READY" });
      if (parts[2] === "employee-files") return json({ status: "open", subjectAccessId: "m2", own: false, access: { kind: "HR", expiresAt: null }, canAddDocument: true, documents: [], log: [] });
      if (parts[5] === "documents" && parts.length === 6 && call.method === "POST") return json({ id: "kd1", folderId: "f1", title: "Policy", archived: false, publishedVersionId: null, updatedAt: "x" }, 201);
      if (parts[7] === "page" && parts[8] === "versions") return json({ revision: 2, number: 1, ackRequired: false });
      if (parts[7] === "page" && parts[8] === "publish") return json({ revision: 3 });
      if (parts[7] === "page") return json({ revision: 1, body: "# Hi", versions: [], canEdit: true, acknowledged: false, remindedNumber: null });
      if (parts[5] === "documents" && parts.length === 6) return json({ items: [], nextCursor: null });
      if (parts[5] === "documents" && parts.length === 7) return json({ id: "kd1", folderId: "f1", title: "Policy", archived: false, publishedVersionId: null, updatedAt: "x" });
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.addDocument(C, "m2", "x.exe", new Blob(["x"], { type: "application/x-msdownload" }))).rejects.toMatchObject({ message: "file-type" });
    const access = await repo.addDocument(C, "m2", "contract.pdf", new Blob(["%PDF"], { type: "application/pdf" }));
    expect(access).toMatchObject({ status: "open", canAddDocument: true });
    expect(api.calls.find((call) => call.path.endsWith("/documents") && call.method === "POST")!.body).toMatchObject({ kind: "OTHER", upload: { filename: "contract.pdf", mimeType: "application/pdf", expectedSize: 4 } });
    const page = await repo.kbCreate(C, { folderId: "f1", title: "Policy", body: "# Hi" });
    expect(page).toMatchObject({ id: "kd1", body: "# Hi" });
    expect(api.calls.find((call) => call.path.endsWith("/page/versions"))).toMatchObject({ ifMatch: '"1"', body: { body: "# Hi" } });
  });

  describe("resource approvals in the inbox", () => {
    const request = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      resourceId: "r1",
      workflowVersionId: "rw1",
      requester: { accessId: "m2", generation: 2, displayName: "Sara" },
      startAt: "2026-11-20T20:30:00.000Z",
      endAt: "2026-11-21T20:30:00.000Z",
      reason: "Trip",
      state: "PENDING",
      step: 1,
      stepCount: 2,
      pendingRoles: ["OWNER"],
      allocationId: null,
      decidedAt: null,
      revision: 6,
      createdAt: "2026-11-14T08:00:00.000Z",
      ...extra,
    });
    const workflow = { id: "rw1", typeId: "t1", state: "PUBLISHED", steps: [{ roles: ["DEPT_MANAGER"] }, { roles: ["OWNER", "ORG_ADMIN"] }], publishedAt: "x", revision: 1 };
    const history = [{ id: "h1", requestId: "rq1", actorId: "a9", actorDisplayName: "Reza", kind: "APPROVE", step: 0, reason: null, createdAt: "2026-11-14T09:00:00.000Z" }];
    function inboxApi(decided: { state: string }) {
      return companyApi((call, parts) => {
        if (parts[3] !== ROOT) return null;
        if (parts[4] === "resource-requests" && parts.length === 5)
          return json({ items: [request("rq1", { state: decided.state }), request("rq2", { requester: { accessId: "m1", generation: 4, displayName: "Mehran" } })], nextCursor: null });
        if (parts[4] === "resource-requests" && parts[6] === "history") return json({ items: history });
        if (parts[4] === "resource-requests" && parts[6] === "decision") {
          decided.state = call.body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
          return json(request("rq1", { state: decided.state }));
        }
        if (parts[4] === "resource-requests") return json(request(parts[5], { state: decided.state }));
        if (parts[4] === "resource-workflows") return json(workflow);
        if (parts[4] === "resources") return json({ items: [{ id: "r1", title: "Projector", state: "ACTIVE", typeId: null, revision: 1 }], nextCursor: null });
        return null;
      });
    }

    it("lists role-based steps for the authorized approver (never my own request) and approves with the request revision", async () => {
      const decided = { state: "PENDING" };
      const api = inboxApi(decided);
      const repo = createApiCompanyRepository(api.client);
      const rows = await repo.approvals(C);
      const row = rows.find((entry) => entry.id === "rq1")!;
      expect(row).toMatchObject({ subject: "resources", title: "Projector", status: "pending", forMe: true, mine: false, chainVersion: null, currentStep: 2 });
      expect(row.steps.map((step) => [step.roles, step.state])).toEqual([
        [["manager"], "done"],
        [["owner", "admin"], "current"],
      ]);
      expect(row.steps[0].decision).toMatchObject({ kind: "approved", by: "Reza" });
      expect(rows.find((entry) => entry.id === "rq2")).toMatchObject({ forMe: false, mine: true });
      const approved = await repo.decide(C, "rq1", "approved", null);
      expect(approved.status).toBe("approved");
      const post = api.calls.find((call) => call.path.endsWith("/decision"))!;
      expect(post).toMatchObject({ ifMatch: '"6"', body: { decision: "APPROVE" } });
      expect(post.path).toContain("/resource-requests/rq1/decision");
    });

    it("a rejection needs a reason (no request without one) and sends it; a decided request is not decided again", async () => {
      const decided = { state: "PENDING" };
      const api = inboxApi(decided);
      const repo = createApiCompanyRepository(api.client);
      await repo.approvals(C);
      await expect(repo.decide(C, "rq1", "rejected", " ")).rejects.toMatchObject({ code: "invalid", message: "reason-required" });
      expect(api.writes()).toEqual([]);
      const rejected = await repo.decide(C, "rq1", "rejected", "Already booked");
      expect(rejected.status).toBe("rejected");
      expect(api.calls.find((call) => call.path.endsWith("/decision"))).toMatchObject({ ifMatch: '"6"', body: { decision: "REJECT", reason: "Already booked" } });
      await expect(repo.decide(C, "rq1", "approved", null)).rejects.toMatchObject({ code: "conflict" });
      expect(api.writes().filter((write) => write.endsWith("/decision"))).toHaveLength(1);
    });
  });

  it("invitations go by email to the chosen department; position / supervisor are refused before sending", async () => {
    const api = companyApi((_call, parts) => (parts[4] === "invitations" ? json({ invitation: { id: "i1" }, proof: "secret" }, 201) : null));
    const repo = createApiCompanyRepository(api.client);
    await expect(repo.invite(C, { email: "a@b.ir", role: "member", departmentId: "d1", position: "Dev", supervisorId: null })).rejects.toMatchObject({ code: "unsupported" });
    expect(api.writes()).toEqual([]);
    await repo.invite(C, { email: "a@b.ir", role: "member", departmentId: "d1", position: "", supervisorId: null });
    expect(api.calls.find((call) => call.path.endsWith("/invitations"))).toMatchObject({ path: expect.stringContaining("d1-scope"), body: { memberRole: "MEMBER", recipient: { email: "a@b.ir" } } });
  });
});
