import { describe, expect, it } from "vitest";
import { jalaliMonthOf } from "../mock/mock-finance";
import { createApiFinanceRepository } from "./api-finance-repository";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Phase 10–11 live check (skipped unless configured, see live-support.ts): add → read → month
 * totals → edit (correction) → remove (reversal) → Undo → budget. The ledger is immutable: every
 * test posting is reversed at the end, so totals return to where they started; the wallet account,
 * the categories and the monthly budget the adapter creates on first use stay on the test account.
 */

describe.skipIf(!liveConfigured)("live finance", () => {
  it("transactions, month totals, correction, reversal, undo, budget", { timeout: 180_000 }, async () => {
    const { client, today, end } = await liveSession();
    const build = () => createApiFinanceRepository(client, { today: () => today });
    const { start, daysInMonth } = jalaliMonthOf(today);
    const live = new Set<string>();
    try {
      const before = await build().month(start);
      expect(before).toMatchObject({ start, daysInMonth });

      const title = `P10 ${Date.now()}`;
      const added = await build().addTransaction({ kind: "expense", amountToman: 125_000, category: "food", title, day: today, time: "09:30", note: "live" });
      live.add(added.id);
      expect(added).toMatchObject({ kind: "expense", amountToman: 125_000, category: "food", title, day: today, time: "09:30", note: "live" });
      expect(await build().transaction(added.id)).toEqual(added);
      expect((await build().transactions(today, today)).some((tx) => tx.id === added.id)).toBe(true);
      const afterAdd = await build().month(start);
      expect(afterAdd.spentToman).toBe(before.spentToman + 125_000);
      expect(afterAdd.balanceToman).toBe(before.balanceToman - 125_000);
      expect(afterAdd.transactionCount).toBe(before.transactionCount + 1);
      expect(afterAdd.categories.find((row) => row.category === "food")?.spentToman).toBe((before.categories.find((row) => row.category === "food")?.spentToman ?? 0) + 125_000);

      // Edit = correction: a new posting replaces the old one.
      const edited = await build().updateTransaction(added.id, { amountToman: 130_500, category: "transport" });
      live.delete(added.id);
      live.add(edited.id);
      expect(edited).toMatchObject({ amountToman: 130_500, category: "transport", title, day: today, time: "09:30" });
      const listed = await build().transactions(today, today);
      expect(listed.filter((tx) => tx.title === title).map((tx) => tx.id)).toEqual([edited.id]);
      expect((await build().month(start)).spentToman).toBe(before.spentToman + 130_500);

      // Income counts as income, not as spending.
      const income = await build().addTransaction({ kind: "income", amountToman: 1_000_000, category: null, title: `${title} in`, day: today, time: null });
      live.add(income.id);
      const withIncome = await build().month(start);
      expect(withIncome.incomeToman).toBe(before.incomeToman + 1_000_000);
      expect(withIncome.spentToman).toBe(before.spentToman + 130_500);

      // Remove = reversal; Undo posts it again.
      const removed = await build().removeTransaction(edited.id);
      live.delete(edited.id);
      expect((await build().month(start)).spentToman).toBe(before.spentToman);
      expect((await build().transactions(today, today)).some((tx) => tx.title === title)).toBe(false);
      const restored = await build().restoreTransaction(removed);
      live.add(restored.id);
      expect(restored).toMatchObject({ amountToman: 130_500, category: "transport", title });
      expect((await build().month(start)).spentToman).toBe(before.spentToman + 130_500);

      // Budget for the month, then the Overview summary reads it.
      const budget = (before.budgetToman ?? 20_000_000) + 500_000;
      expect((await build().setBudget(start, budget)).budgetToman).toBe(budget);
      expect((await build().month(start)).budgetToman).toBe(budget);
      expect(await build().monthSummary(today)).toMatchObject({ monthStart: start, budgetToman: budget, spentToman: before.spentToman + 130_500, daysInMonth });
      expect(Array.isArray(await build().upcomingBills(today))).toBe(true);
    } finally {
      for (const id of live) await build().removeTransaction(id).catch(() => undefined);
      end();
    }
  });
});
