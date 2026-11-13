import { describe, expect, it } from "vitest";
import { companyCapabilities, createMockCompanies } from "./mock-companies";

describe("mock Companies (Phase 4)", () => {
  it("lists my companies and keeps each one its own custody boundary", async () => {
    const repo = createMockCompanies();
    const { companies } = await repo.list();
    expect(companies.map((company) => company.id)).toEqual(["euroly", "araxitis"]);
    // Araxitis never sees Euroly's data.
    expect(await repo.expenses("araxitis")).toEqual([]);
    expect((await repo.staff("araxitis", "member")).map((person) => person.id)).toEqual(["p-mehran"]);
    expect(await repo.access("nova-labs")).toMatchObject({ status: "invite-pending" });
    expect(await repo.access("old-co")).toEqual({ status: "left" });
    expect(await repo.access("nope")).toEqual({ status: "not-available" });
  });

  it("derives capabilities from the role; special grants never come from it", () => {
    const admin = companyCapabilities("admin", [], []);
    expect(admin.modules.settings).toBe(true);
    expect(admin.lifecycle).toBe(false);
    expect(admin.editWorkProfile).toBe(true);
    const member = companyCapabilities("member", [], []);
    expect(member.modules.approvals).toBe(false);
    expect(member.modules.budgets).toBe(false);
    expect(member.allDepartments).toBe(false);
    expect(companyCapabilities("viewer", [], []).modules.expenses).toBe(false);
    expect(companyCapabilities("owner", [], []).lifecycle).toBe(true);
  });

  it("keeps employee files sealed without an explicit grant, even for Org Admin, and audits every open", async () => {
    const repo = createMockCompanies();
    expect(await repo.employeeFile("euroly", "p-harry")).toMatchObject({ status: "sealed", requested: false });
    await repo.requestFileAccess("euroly", "p-harry");
    expect(await repo.employeeFile("euroly", "p-harry")).toMatchObject({ status: "sealed", requested: true });
    const open = await repo.employeeFile("euroly", "p-katy");
    expect(open.status).toBe("open");
    if (open.status === "open") expect(open.log[0]).toMatchObject({ who: "Mehran R.", what: "opened file (grant: HR reviewer)" });
    expect((await repo.audit("euroly"))[0]).toMatchObject({ kind: "file", subject: "Katy F. · employee file" });
  });

  it("never lets the requester approve their own item and routes past them", async () => {
    const repo = createMockCompanies();
    await expect(repo.decide("euroly", "ap-catering", "approved", null)).rejects.toMatchObject({ code: "forbidden" });
    const created = await repo.saveExpense(
      "euroly",
      { title: "Ops tools", amount: 80_000_000, date: "2026-10-13", category: "software", departmentId: "d-ops", projectId: null, payer: "card", receipt: { name: "r.pdf" } },
      true,
    );
    const approval = (await repo.approvals("euroly")).find((item) => item.id === created.approvalId)!;
    // Finance step: I hold the grant but requested it → next eligible holder.
    expect(approval.steps[1]).toMatchObject({ reviewerName: "Tina S." });
    expect(approval.forMe).toBe(false);
  });

  it("counts an expense in the budget only after final approval and creates the reimbursement", async () => {
    const repo = createMockCompanies();
    const before = (await repo.budgets("euroly")).find((line) => line.id === "b-design")!;
    await repo.decide("euroly", "ap-licences", "approved", null);
    const after = (await repo.budgets("euroly")).find((line) => line.id === "b-design")!;
    expect(after.approved - before.approved).toBe(46_000_000);
    expect((await repo.expenses("euroly")).find((item) => item.id === "ex-licences")?.status).toBe("approved");
  });

  it("requires a reason to reject and a comment to request changes", async () => {
    const repo = createMockCompanies();
    await expect(repo.decide("euroly", "ap-travel", "rejected", " ")).rejects.toMatchObject({ code: "invalid" });
    const changed = await repo.decide("euroly", "ap-travel", "changes", "Split per person");
    expect(changed.status).toBe("changes");
  });

  it("settles only on confirmation and records in Personal only when asked, once", async () => {
    const repo = createMockCompanies();
    const run = await repo.createRun("euroly", ["rb-books"]);
    expect((await repo.reimbursements("euroly")).find((item) => item.id === "rb-books")?.status).toBe("in-run");
    await expect(repo.confirmRun("euroly", run.id, "")).rejects.toMatchObject({ code: "invalid" });
    await repo.confirmRun("euroly", run.id, "TRX-1");
    expect((await repo.reimbursements("euroly")).find((item) => item.id === "rb-books")?.status).toBe("settled");
    const first = await repo.markRecordedInPersonal("euroly", "rb-taxi");
    const second = await repo.markRecordedInPersonal("euroly", "rb-taxi");
    expect([first.alreadyRecorded, second.alreadyRecorded]).toEqual([false, true]);
  });

  it("hides restricted knowledge folders and their search hits without a grant", async () => {
    const repo = createMockCompanies();
    expect((await repo.kbFolders("euroly")).some((folder) => folder.id === "kf-hr")).toBe(false);
    expect(await repo.kbSearch("euroly", "hiring")).toEqual([]);
    expect(await repo.kbPage("euroly", "kp-hiring")).toBeNull();
  });

  it("only lets Default policies be overridden, with a reason, and audits it", async () => {
    const repo = createMockCompanies();
    await expect(repo.overridePolicy("euroly", "d-design", "pol-2fa", "Off", "x")).rejects.toMatchObject({ code: "forbidden" });
    await expect(repo.overridePolicy("euroly", "d-design", "pol-week", "Sat – Thu", "")).rejects.toMatchObject({ code: "invalid" });
    const policies = await repo.overridePolicy("euroly", "d-design", "pol-week", "Sat – Thu", "Launch week");
    expect(policies.find((policy) => policy.id === "pol-week")?.override?.reason).toBe("Launch week");
  });
});
