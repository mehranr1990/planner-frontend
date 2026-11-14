import { describe, expect, it } from "vitest";
import { createApiCompanyRepository } from "./api-company-repository";
import { err, fakeApi, json } from "./test-support";

/* Company closure batch (rejection reason, budget change requests, unit move, room titles) against in-memory fakes. */

const C = "c1";
const ROOT = "root-scope";
const company = { id: C, spaceId: "sp1", scopeId: ROOT, title: "Acme", description: null, revision: 3, state: "ACTIVE" };
const ME = { accessId: "m1", actorId: "a1", role: "OWNER", generation: 1, capabilities: [] };
const dept = (id: string, kind: "DEPARTMENT" | "UNIT", departmentId: string | null = null) => ({ id, scopeId: `${id}-scope`, title: id.toUpperCase(), kind, departmentId, revision: 1 });

function companyApi(handle: (call: { method: string; path: string; body: Record<string, unknown>; query: Record<string, string>; ifMatch: string | null }, parts: string[]) => Response | null) {
  return fakeApi((call, parts) => {
    const hit = handle(call, parts);
    if (hit) return hit;
    if (parts.length === 2) return json(company, 200, '"3"');
    if (parts[2] === "departments" && parts[4] === "units") return json({ items: parts[3] === "d1" ? [dept("u1", "UNIT", "d1")] : [], nextCursor: null });
    if (parts[2] === "departments") return json({ items: [dept("d1", "DEPARTMENT"), dept("d2", "DEPARTMENT")], nextCursor: null });
    if (parts[4] === "access") return json(ME);
    if (parts[4] === "members") return json({ items: [], nextCursor: null });
    return json({ items: [], nextCursor: null });
  });
}

describe("company closure batch", () => {
  it("a rejection needs a reason (no request without one); the reason is sent with If-Match", async () => {
    const approval = { id: "ap1", revision: 4, workflowVersionId: "wv1", expenseVersionId: null, reimbursementId: null, requester: { accessId: "m2", generation: 1, displayName: "Sara" }, beneficiary: null, attempt: 1, state: "ACTIVE", stepIndex: 0, escalated: false, sourceRevision: 1, createdAt: "2026-11-10T08:00:00.000Z", updatedAt: "x", spaceId: "sp1", scopeId: ROOT };
    const api = companyApi((call, parts) => {
      if (parts[5] === "approvals" && parts.length === 6) return json({ items: [approval], nextCursor: null });
      if (parts[5] === "approvals" && parts[7] === "history") return json({ items: [], nextCursor: null });
      if (parts[5] === "approvals" && parts[7] === "decision") return json({ ...approval, state: "REJECTED" });
      if (parts[5] === "approvals" && parts.length === 7) return json(approval);
      if (parts[5] === "approval-workflow-versions") return json({ id: "wv1", number: 2, title: "Expenses", state: "PUBLISHED", steps: [{ id: "s1", label: "Manager", position: 0, primary: { accessId: "m1", generation: 1 }, alternate: null }] });
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    const [row] = await repo.approvals(C);
    expect(row).toMatchObject({ id: "ap1", status: "pending", forMe: true, chainVersion: 2, currentStep: 1 });
    const before = api.writes().length;
    await expect(repo.decide(C, "ap1", "rejected", "  ")).rejects.toMatchObject({ code: "invalid", message: "reason-required" });
    expect(api.writes().length).toBe(before);
    await expect(repo.decide(C, "ap1", "changes", "x")).rejects.toMatchObject({ code: "unsupported" });
    await repo.decide(C, "ap1", "rejected", "Missing receipt").catch(() => undefined);
    const post = api.calls.find((call) => call.path.endsWith("/decision"))!;
    expect(post).toMatchObject({ ifMatch: '"4"', body: { decision: "REJECT", reason: "Missing receipt" } });
  });

  it("a budget change is a versioned change request (delta + direction), never a direct amount edit", async () => {
    const budget = { id: "b1", title: "Ops", currency: "IRR", scale: 2, limit: "1000.00", spent: "200.00", reserved: "100.00", available: "700.00", archived: false, projectReferenceId: null, revision: 2 };
    const api = companyApi((call, parts) => {
      if (parts[5] === "budgets" && parts.length === 6) return json({ items: [budget], nextCursor: null });
      if (parts[5] === "budgets" && parts[7] === "change-requests" && call.method === "POST") return json({ id: "cr1" }, 201);
      if (parts[5] === "budgets" && parts[7] === "change-requests") return json({ items: [], nextCursor: null });
      if (parts[5] === "budgets" && parts.length === 7) return json(budget);
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    const [line] = await repo.budgets(C);
    expect(line).toMatchObject({ id: "b1", budget: 1000, approved: 200, committed: 100, changeRequest: null });
    await repo.requestBudgetChange(C, "b1", 1250, "Q4 hiring");
    const post = api.calls.find((call) => call.method === "POST" && call.path.endsWith("/change-requests"))!;
    expect(post.body).toMatchObject({ amount: "250.00", direction: "INCREASE", reason: "Q4 hiring" });
    expect(api.calls.some((call) => call.path.endsWith("/adjustments"))).toBe(false);
  });

  it("moves a unit under another department with the preview's revision; a refused preview is an error", async () => {
    const api = companyApi((call, parts) => {
      if (parts[2] === "context-moves" && parts[3] === "preview") {
        const allowed = call.query.parentId === "d2-scope";
        return json({ scopeId: call.query.scopeId, kind: "UNIT", fromParentId: "d1-scope", parentId: call.query.parentId ?? null, people: 4, teams: 1, budgets: [{ currency: "IRR", limit: "50.00" }], accessChanges: 2, revision: 7, allowed, refusal: allowed ? null : "MOVE_LEVEL_CHANGE" });
      }
      if (parts[2] === "context-moves") return json({ id: "mv1" }, 201);
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    expect(await repo.previewMove(C, "u1", "d2")).toEqual({ departmentId: "u1", newParentId: "d2", people: 4, teams: 1, budget: 50 });
    await expect(repo.previewMove(C, "u1", null)).rejects.toMatchObject({ code: "invalid", message: "MOVE_LEVEL_CHANGE" });
    await repo.moveDepartment(C, "u1", "d2");
    const move = api.calls.find((call) => call.method === "POST" && call.path.endsWith("/context-moves"))!;
    expect(move).toMatchObject({ ifMatch: '"7"', body: { scopeId: "u1-scope", parentId: "d2-scope" } });
  });

  it("books a room for me with a private title (If-Match 1 while unset)", async () => {
    const room = { id: "r1", name: "Sky", seats: 6, floor: "3", revision: 1, bookings: [] as unknown[] };
    const api = companyApi((call, parts) => {
      if (parts[4] === "rooms") return json({ day: "2026-11-15", timezone: "Asia/Tehran", items: call.query.day ? [room] : [] });
      if (parts[6] === "allocations") return json({ id: "al1" }, 201);
      if (parts[6] === "title") return json({ allocationId: "al1", title: "1:1", shared: false, revision: 2 });
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    await repo.bookRoom(C, { roomId: "r1", day: "2026-11-15", from: "10:00", to: "11:00", title: "1:1" });
    const title = api.calls.find((call) => call.path.endsWith("/title"))!;
    expect(title).toMatchObject({ ifMatch: '"1"', body: { title: "1:1", shared: false } });
    expect(api.calls.find((call) => call.path.endsWith("/allocations"))!.body).toMatchObject({ member: { accessId: "m1", generation: 1 } });
  });

  it("settings read the fixed currency, legal name and fiscal month; no invented retention years", async () => {
    const api = companyApi((_call, parts) => (parts[2] === "settings" ? json({ companyId: C, currency: "IRR", scale: 2, currencyLocked: true, legalName: "Acme LLC", fiscalStartMonth: 1, revision: 5 }) : null));
    const settings = await createApiCompanyRepository(api.client).settings(C);
    expect(settings).toMatchObject({ name: "Acme", legalName: "Acme LLC", currency: "rial", currencyLocked: true, fiscalStartMonth: 1, retentionYears: null, policies: [] });
    void err;
  });
});
