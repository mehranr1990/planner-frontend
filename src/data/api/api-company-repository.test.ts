import { describe, expect, it } from "vitest";
import { createApiCompanyRepository } from "./api-company-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Contract fakes for the Companies subset of the 860-op contract: never mock data in live mode. */

const C = "c1";
const ROOT = "s-root";
const company = (state = "ACTIVE") => ({ id: C, spaceId: C, scopeId: ROOT, title: "Araxis", description: null, revision: 4, state, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z" });
const dept = (id: string, kind: "DEPARTMENT" | "UNIT", parent: string | null = null) => ({ id, spaceId: C, scopeId: `s-${id}`, kind, departmentId: parent, title: id.toUpperCase(), description: null, revision: 2, createdAt: "x", updatedAt: "x" });
const member = (id: string, displayName: string | null, state = "ACTIVE") => ({ displayName, id, spaceId: C, scopeId: ROOT, actorId: `a-${id}`, memberRole: "MEMBER", state, generation: 1, revision: 1, role: "MEMBER" });
const ME = { accessId: "m1", actorId: "a-m1", role: "OWNER", generation: 1, capabilities: ["settings.manage", "custody.archive"] };

function companyApi(extra: (call: FakeCall, parts: string[]) => Response | null = () => null) {
  return fakeApi((call, parts) => {
    const answer = extra(call, parts);
    if (answer) return answer;
    if (call.method !== "GET") return err(500);
    if (parts.length === 1) return json({ items: [company()], nextCursor: null });
    if (parts[1] !== C) return err(404);
    if (parts.length === 2) return json(company(), 200, '"c-4"');
    if (parts[2] === "departments" && parts.length === 3) return json({ items: [dept("d1", "DEPARTMENT"), dept("d2", "DEPARTMENT")], nextCursor: null });
    if (parts[2] === "departments" && parts[4] === "units") return json({ items: parts[3] === "d1" ? [dept("u1", "UNIT", "d1")] : [], nextCursor: null });
    if (parts[2] === "contexts") {
      const scope = parts[3];
      if (parts[4] === "access") {
        if (scope === ROOT) return json(ME);
        if (scope === "s-d1") return json({ ...ME, accessId: "m1-d1", role: "DEPT_MANAGER" });
        return err(403);
      }
      if (parts[4] === "members") return scope === "s-d2" ? err(403) : json({ items: [member("m1", "Mehran Raeeszade"), member("m2", null), member("m3", "Gone", "LEFT")], nextCursor: null });
    }
    return err(404);
  });
}

describe("live Companies repository", () => {
  it("directory and access gate from the API: role, my departments, people; no invented currency or legal name", async () => {
    const api = companyApi();
    const repo = createApiCompanyRepository(api.client);
    const { companies, recentIds } = await repo.list();
    expect(recentIds).toEqual([]);
    expect(companies[0]).toMatchObject({ id: C, name: "Araxis", role: "owner", people: 2, departments: 2, departmentId: "d1", departmentName: "D1", legalName: "", currency: null, fiscalStartMonth: null, approvalsForMe: 0 });
    const access = await repo.access(C);
    expect(access.status).toBe("ok");
    if (access.status !== "ok") return;
    expect(access.me).toEqual({ id: "m1", name: "Mehran Raeeszade", initials: "MR" });
    expect(access.myDepartmentIds).toEqual(["d1"]);
    expect(access.capabilities).toMatchObject({ allDepartments: true, managedDepartmentIds: ["d1"], manageDepartments: true, lifecycle: true, invite: false, approve: false, createExpense: false });
    expect(access.capabilities.modules).toMatchObject({ overview: true, departments: true, settings: true, expenses: false, people: false });
    await expect(repo.access("other")).resolves.toEqual({ status: "not-available" });
    expect(api.writes()).toEqual([]);
  });

  it("departments and units: tree from the API, unreadable contexts count 0; create / rename with Idempotency-Key and If-Match", async () => {
    const api = companyApi((call, parts) => {
      if (call.method === "POST" && parts[4] === "units") return json({ ...dept("u9", "UNIT", "d1"), title: call.body.title }, 201);
      if (call.method === "POST" && parts[2] === "departments") return json({ ...dept("d9", "DEPARTMENT"), title: call.body.title }, 201);
      if (call.method === "PATCH") return json({ ...dept(parts[3], parts[2] === "units" ? "UNIT" : "DEPARTMENT", parts[2] === "units" ? "d1" : null), title: call.body.title, revision: 3 });
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    const tree = await repo.departments(C);
    expect(tree.map((entry) => [entry.id, entry.kind, entry.parentId, entry.people, entry.managerName, entry.budget])).toEqual([
      ["d1", "department", null, 2, null, null],
      ["d2", "department", null, 0, null, null],
      ["u1", "unit", "d1", 2, null, null],
    ]);
    await repo.createDepartment(C, { name: " Sales ", parentId: null, managerId: null });
    await repo.createDepartment(C, { name: "Field", parentId: "d1", managerId: null });
    await repo.updateDepartment(C, "u1", { name: "Field ops", managerId: null });
    await expect(repo.createDepartment(C, { name: "X", parentId: null, managerId: "m2" })).rejects.toMatchObject({ code: "unsupported" });
    const writes = api.calls.filter((call) => call.method !== "GET");
    expect(writes.map((call) => [call.method, call.path, call.body.title, call.ifMatch])).toEqual([
      ["POST", `/companies/${C}/departments`, "Sales", null],
      ["POST", `/companies/${C}/departments/d1/units`, "Field", null],
      ["PATCH", `/companies/${C}/units/u1`, "Field ops", '"2"'],
    ]);
    expect(writes.slice(0, 2).every((call) => call.key)).toBe(true);
  });

  it("archive / restore with the company ETag; deletion checks the typed name first", async () => {
    const api = companyApi((call) => (call.method === "POST" ? json({ id: C, revision: 5 }) : null));
    const repo = createApiCompanyRepository(api.client);
    await repo.archive(C);
    await repo.restore(C);
    await expect(repo.remove(C, "Other", "pw")).rejects.toMatchObject({ code: "invalid" });
    await repo.remove(C, " Araxis ", "pw");
    expect(api.calls.filter((call) => call.method === "POST").map((call) => [call.path, call.ifMatch, call.body])).toEqual([
      [`/companies/${C}/archive`, '"c-4"', {}],
      [`/companies/${C}/restore`, '"c-4"', {}],
      [`/companies/${C}/delete`, '"c-4"', { password: "pw" }],
    ]);
  });

  it("modules: resources, knowledge, cases, audit, exports and reports from the context operations", async () => {
    const R = "/companies/c1/contexts/s-root";
    const api = companyApi((call) => {
      const p = call.path;
      if (p === R + "/resources") return json({ items: [{ id: "r1", title: "Laptop 7", description: "IT shelf", spaceId: C, scopeId: ROOT, state: "ACTIVE", revision: 1, createdAt: "x", updatedAt: "x" }], nextCursor: null });
      if (p.endsWith("/resources")) return json({ items: [], nextCursor: null });
      if (p === R + "/resources/r1/allocations") return json({ items: [{ id: "al1", resourceId: "r1", member: { accessId: "m1", generation: 1 }, startAt: "2020-01-01T00:00:00Z", endAt: "2999-01-01T00:00:00Z", state: "ALLOCATED", endedAt: null, revision: 1 }], nextCursor: null });
      if (p === R + "/knowledge/folders") return json({ items: [{ id: "f1", title: "HR", parentId: null, archived: false }], nextCursor: null });
      if (p === R + "/knowledge/documents") return json({ items: [{ id: "d9", folderId: "f1", title: "Leave policy", description: "How leave works", archived: false, publishedVersionId: "v2", updatedAt: "2026-11-01T00:00:00Z" }], nextCursor: null });
      if (p === R + "/knowledge/documents/d9") return json({ id: "d9", folderId: "f1", title: "Leave policy", description: null, archived: false, publishedVersionId: "v2", updatedAt: "2026-11-01T00:00:00Z" });
      if (p === R + "/knowledge/documents/d9/versions")
        return json({ items: [{ id: "v1", publishedAt: "2026-10-01T00:00:00Z", mimeType: "text/plain", filename: "a.txt", actualSize: 4, description: "first" }, { id: "v2", publishedAt: "2026-11-01T00:00:00Z", mimeType: "text/plain", filename: "a.txt", actualSize: 4, description: "second" }], nextCursor: null });
      if (p === R + "/knowledge/documents/d9/versions/v2/download") return new Response("Body", { status: 200, headers: { "Content-Type": "application/octet-stream" } });
      if (p === R + "/audit") return json({ items: [{ id: "au1", actorDisplayName: "Mehran", actorId: "a", action: "company.export.publish", resourceId: "e1", occurredAt: "x" }, { id: "au2", actorDisplayName: null, actorId: "b", action: "company.department.create", resourceId: null, occurredAt: "y" }], nextCursor: null });
      if (p === R + "/exports" && call.method === "GET") return json({ items: [{ id: "e1", scopeId: ROOT, state: "PUBLISHED", publishedAt: "z", downloadAvailable: false }], nextCursor: null });
      if (p === R + "/exports") return new Response("a,b", { status: 200, headers: { "Content-Type": "text/csv", "X-Export-Id": "e2" } });
      if (p.endsWith("/reports/operations")) return p.includes("s-d2") ? err(403) : json({ basis: "CURRENT", memberCount: 4, availableMinutes: 600 });
      if (p === R + "/employee-cases/k1") return json({ id: "k1", subject: { accessId: "m2", generation: 1, displayName: "S" }, revision: 2 });
      if (p === R + "/employee-cases/k1/entries" && call.method === "POST")
        return json({ entry: {}, case: { id: "k1", author: { displayName: "HR" }, subject: { accessId: "m2", displayName: "S" }, reviewer: { displayName: "Lead" }, reason: "Late", evidence: "Log", state: "OPEN", createdAt: "x", revision: 3 } }, 201);
      if (p === R + "/employee-cases/k1/entries") return json({ items: [{ kind: "RESPONSE", body: "Sorry", createdAt: "x" }], nextCursor: null });
      return null;
    });
    const repo = createApiCompanyRepository(api.client);
    expect(await repo.resources(C)).toMatchObject([{ id: "r1", name: "Laptop 7", status: "assigned", assigneeName: "Mehran Raeeszade", note: "IT shelf", tag: "" }]);
    expect(await repo.kbFolders(C)).toEqual([{ id: "f1", name: "HR", parentId: null, restricted: false, pages: 1 }]);
    expect(await repo.kbPage(C, "d9")).toMatchObject({ title: "Leave policy", version: 2, body: "Body", files: [], versions: [{ version: 1, note: "first" }, { version: 2, note: "second" }] });
    expect(await repo.kbSearch(C, "leave")).toMatchObject([{ pageId: "d9", folderName: "HR", snippet: "How leave works" }]);
    expect((await repo.audit(C)).map((row) => [row.who, row.kind])).toEqual([["Mehran", "export"], ["", null]]);
    expect(await repo.exports(C)).toMatchObject([{ id: "e1", report: null, status: "expired" }]);
    const made = await repo.requestExport(C, "headcount", "csv");
    expect([made.id, made.file?.name, await made.file?.blob.text()]).toEqual(["e2", "Araxis-headcount-e2.csv", "a,b"]);
    await expect(repo.requestExport(C, "goals", "csv")).rejects.toMatchObject({ code: "unsupported" });
    expect((await repo.reports(C, null)).map((report) => [report.id, report.series])).toEqual([
      ["headcount", [{ label: "D1", value: 4 }]],
      ["capacity", [{ label: "D1", value: 10 }]],
    ]);
    expect(await repo.respondCorrective(C, "m2", "k1", "Sorry")).toMatchObject({ status: "responded", response: "Sorry", openedBy: "HR", visibleTo: "Lead" });
    const entry = api.calls.find((call) => call.method === "POST" && call.path.endsWith("/entries"))!;
    expect([entry.ifMatch, entry.body.kind]).toEqual(['"2"', "RESPONSE"]);
    expect(api.calls.find((call) => call.method === "POST" && call.path.endsWith("/exports"))!.body).toMatchObject({ dataset: "OPERATIONS", format: "CSV" });
  });

  it("refuses unmapped and owner-decision modules without a request (no mock fallback, no proof bypass)", async () => {
    const api = fakeApi(() => err(500));
    const repo = createApiCompanyRepository(api.client);
    for (const call of [() => repo.expenses(C), () => repo.goals(C), () => repo.acceptInvitation("i1"), () => repo.employeeFile(C, "p1"), () => repo.settings(C), () => repo.overview(C, null, "owner")])
      await expect(call()).rejects.toMatchObject({ code: "unsupported", message: expect.stringContaining("Companies API:") });
    expect(api.calls).toEqual([]);
  });
});
