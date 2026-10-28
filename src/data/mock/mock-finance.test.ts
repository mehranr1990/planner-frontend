import { describe, expect, it } from "vitest";
import { sampleDays } from "@/fixtures/personal";
import { createMockRepositories } from "./mock-repositories";

const MEHR = "2026-09-23";

describe("mock finance (P13)", () => {
  it("derives Mehr from the transactions, matching the board", async () => {
    const { finance } = createMockRepositories();
    const month = await finance.month(sampleDays.today);
    expect(month).toMatchObject({
      start: MEHR,
      daysInMonth: 30,
      budgetToman: 48_000_000,
      incomeToman: 48_000_000,
      spentToman: 31_200_000,
      savedToman: 9_600_000,
      balanceToman: 186_400_000,
      transactionCount: 46,
    });
    expect(month.categories.map((item) => [item.category, item.spentToman, item.budgetToman])).toEqual([
      ["housing", 12_000_000, 12_000_000],
      ["food", 5_800_000, 7_000_000],
      ["transport", 3_900_000, 4_000_000],
      ["lifestyle", 3_200_000, 2_500_000],
      ["work", 2_600_000, 3_000_000],
      ["health", 2_100_000, 3_000_000],
      ["other", 1_600_000, 2_000_000],
    ]);
    const recent = await finance.transactions(MEHR, sampleDays.today);
    expect(recent.slice(0, 4).map((tx) => tx.title)).toEqual(["Hyperstar groceries", "Snapp ride", "Salary · Araxitis", "Café Lamiz"]);
    expect((await finance.upcomingBills(sampleDays.today)).map((bill) => bill.title)).toEqual(["Internet", "Car insurance", "Gym membership"]);
  });

  it("adds, updates, removes and restores a transaction; totals and the summary follow", async () => {
    const { finance } = createMockRepositories();
    const added = await finance.addTransaction({ kind: "expense", amountToman: 250_000, category: "food", title: " Lunch ", day: sampleDays.today, time: null, note: "  " });
    expect(added).toEqual({ id: expect.any(String), kind: "expense", amountToman: 250_000, category: "food", title: "Lunch", day: sampleDays.today, time: null });
    expect((await finance.monthSummary(sampleDays.today))!.spentToman).toBe(31_450_000);
    await finance.updateTransaction(added.id, { amountToman: 300_000, category: "work" });
    const month = await finance.month(MEHR);
    expect(month.categories.find((item) => item.category === "work")!.spentToman).toBe(2_900_000);
    expect(month.balanceToman).toBe(186_100_000);
    const removed = await finance.removeTransaction(added.id);
    expect((await finance.month(MEHR)).spentToman).toBe(31_200_000);
    await finance.restoreTransaction(removed);
    expect((await finance.month(MEHR)).transactionCount).toBe(47);
  });

  it("validates writes and sets a budget for an empty month", async () => {
    const { finance } = createMockRepositories();
    const base = { kind: "expense" as const, category: "food" as const, title: "x", day: sampleDays.today, time: null };
    await expect(finance.addTransaction({ ...base, amountToman: 0 })).rejects.toMatchObject({ code: "invalid" });
    await expect(finance.addTransaction({ ...base, amountToman: 1, category: null })).rejects.toMatchObject({ code: "invalid" });
    await expect(finance.removeTransaction("nope")).rejects.toMatchObject({ code: "not-found" });
    expect(await finance.monthSummary("2026-12-01")).toBeNull();
    const aban = await finance.setBudget("2026-10-23", 40_000_000);
    expect(aban).toMatchObject({ start: "2026-10-23", budgetToman: 40_000_000, spentToman: 0, transactionCount: 0 });
  });

  it("serves nothing without finance fixtures", async () => {
    const { finance } = createMockRepositories({ fixtures: { finance: null } });
    expect(await finance.monthSummary(sampleDays.today)).toBeNull();
    expect(await finance.month(MEHR)).toMatchObject({ budgetToman: null, spentToman: 0, transactionCount: 0, balanceToman: 0 });
  });
});
