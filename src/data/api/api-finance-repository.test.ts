import { describe, expect, it } from "vitest";
import { jalaliMonthOf } from "../mock/mock-finance";
import { createApiFinanceRepository, rialToToman, tomanToRial } from "./api-finance-repository";
import { err, fakeApi, json, type FakeCall } from "./test-support";

/* Finance adapter against an in-memory fake of the documented /finance ledger (no network). */

const TODAY = "2026-11-12";
const MONTH = jalaliMonthOf(TODAY);

interface FakeTx { id: string; revision: number; type: string; effect: "POSTED" | "REVERSAL"; state: "POSTED" | "REVERSED"; occurredAt: string; localDate: string; timezone: string; note: string | null; replacementId: string | null; postings: { role: string; currency: string; amount: string; categoryId: string | null }[] }
interface FakeRow { id: string; revision: number; [key: string]: unknown }

function setup() {
  const accounts: FakeRow[] = [];
  const categories: FakeRow[] = [];
  const txs: FakeTx[] = [];
  const budgets: FakeRow[] = [];
  const periods: FakeRow[] = [];
  const bills: FakeRow[] = [];
  const previews: Record<string, unknown[]> = {};
  const goals: FakeRow[] = [];
  const state = { stale: false };
  let seq = 0;
  const page = (items: unknown[]) => json({ items, nextCursor: null });

  const post = (body: FakeCall["body"]): FakeTx => {
    const tx: FakeTx = {
      id: `tx${++seq}`, revision: 1, type: String(body.type), effect: "POSTED", state: "POSTED", occurredAt: String(body.occurredAt), localDate: String(body.localDate), timezone: String(body.timezone), note: (body.note as string) ?? null, replacementId: null,
      postings: [{ role: String(body.type), currency: "IRR", amount: `${body.type === "EXPENSE" ? "-" : ""}${Number(body.amount).toFixed(2)}`, categoryId: (body.categoryId as string) ?? null }],
    };
    txs.push(tx);
    return tx;
  };

  const api = fakeApi((call, parts) => {
    const { method, body } = call;
    const [, resource, id, action] = parts;
    if (resource === "accounts") {
      if (method === "GET") return page(accounts);
      accounts.push({ id: "acc1", revision: 1, createdAt: "2026-01-01T00:00:00.000Z", currency: "IRR", archived: false, balance: "0.00", ...body });
      return json(accounts.at(-1), 201);
    }
    if (resource === "categories") {
      if (method === "GET") return page(categories);
      categories.push({ id: `cat-${String(body.name).toLowerCase()}`, revision: 1, archived: false, ...body });
      return json(categories.at(-1), 201);
    }
    if (resource === "savings-goals") return page(goals);
    if (resource === "bills") return action === "preview" ? page(previews[id!] ?? []) : page(bills);
    if (resource === "budgets") {
      if (!id) {
        if (method === "GET") return page(budgets);
        budgets.push({ id: "b1", revision: 1, categoryId: null, archived: false, ...body });
        return json(budgets.at(-1), 201);
      }
      const budget = budgets.find((item) => item.id === id)!;
      if (method === "GET") return page(periods.filter((item) => item.budgetId === id));
      if (parts[4]) {
        const period = periods.find((item) => item.id === parts[4])!;
        if (call.ifMatch !== `"${period.revision}"`) return err(409);
        period.revision += 1;
        period.limit = body.limit;
        return json(period);
      }
      if (call.ifMatch !== `"${budget.revision}"`) return err(409);
      periods.push({ id: `p${++seq}`, revision: 1, budgetId: id, startDate: body.date, limit: budget.limit });
      return json(periods.at(-1), 201);
    }
    // transactions
    if (!id) {
      if (method === "GET") return page(txs.filter((tx) => tx.state === call.query.state && tx.localDate >= call.query.from! && tx.localDate < call.query.to!));
      return json(post(body), 201);
    }
    const tx = txs.find((item) => item.id === id);
    if (!tx) return err(404);
    if (method === "GET") return json(tx);
    if (state.stale) {
      state.stale = false;
      tx.revision += 1;
      return err(409);
    }
    if (call.ifMatch !== `"${tx.revision}"` || tx.state === "REVERSED") return err(409);
    tx.revision += 1;
    tx.state = "REVERSED";
    txs.push({ ...tx, id: `rev${++seq}`, effect: "REVERSAL", state: "POSTED" });
    if (action === "correct") tx.replacementId = post(body.replacement as FakeCall["body"]).id;
    return json(tx);
  });
  return { ...api, accounts, categories, txs, budgets, periods, bills, previews, goals, state, finance: createApiFinanceRepository(api.client, { today: () => TODAY }) };
}

const lunch = { kind: "expense", amountToman: 250_000, category: "food", title: " Lunch ", day: TODAY, time: "13:30", note: "with Sara" } as const;

describe("finance money", () => {
  it("converts Toman and IRR exactly", () => {
    expect(tomanToRial(250_000)).toBe("2500000");
    expect(tomanToRial(0.5)).toBe("5.00");
    expect(rialToToman("-2500000.00")).toBe(250_000);
    expect(() => tomanToRial(0)).toThrow();
  });
});

describe("finance adapter", () => {
  it("reads an empty ledger honestly and writes nothing", async () => {
    const t = setup();
    expect(await t.finance.monthSummary(TODAY)).toBeNull();
    expect(await t.finance.month(TODAY)).toMatchObject({ start: MONTH.start, budgetToman: null, spentToman: 0, incomeToman: 0, balanceToman: 0, savingsGoalToman: null, transactionCount: 0 });
    expect(await t.finance.transactions(MONTH.start, TODAY)).toEqual([]);
    expect(await t.finance.upcomingBills(TODAY)).toEqual([]);
    expect(t.writes()).toEqual([]);
  });

  it("refuses a posting later than now without a request (the ledger answers 400)", async () => {
    const t = setup();
    await expect(t.finance.addTransaction({ ...lunch, day: "2100-01-01" })).rejects.toMatchObject({ code: "invalid" });
    expect(t.writes()).toEqual([]);
  });

  it("posts an expense in IRR, creating the account and category once", async () => {
    const t = setup();
    const tx = await t.finance.addTransaction(lunch);
    expect(tx).toMatchObject({ kind: "expense", amountToman: 250_000, category: "food", title: "Lunch", day: TODAY, time: "13:30", note: "with Sara" });
    expect(t.writes()).toEqual(["POST /finance/accounts", "POST /finance/categories", "POST /finance/transactions"]);
    const post = t.calls.findLast((call) => call.method === "POST")!;
    expect(post.body).toMatchObject({ type: "EXPENSE", accountId: "acc1", amount: "2500000", categoryId: "cat-food", localDate: TODAY, note: "Lunch\nwith Sara", timezone: "Asia/Tehran" });
    expect(post.key).toBeTruthy();

    const pay = await t.finance.addTransaction({ kind: "income", amountToman: 1_000_000, category: null, title: "Pay", day: TODAY, time: null });
    expect(pay).toMatchObject({ kind: "income", category: null, time: null });
    expect(t.writes().length).toBe(4);
    expect((await t.finance.transactions(MONTH.start, TODAY)).map((item) => item.title)).toEqual(["Lunch", "Pay"]);
    expect(t.calls.findLast((call) => call.method === "GET" && call.path === "/finance/transactions")!.query).toMatchObject({ from: MONTH.start, to: "2026-11-13", currency: "IRR", state: "POSTED" });
  });

  it("corrects instead of editing and returns the replacement", async () => {
    const t = setup();
    const tx = await t.finance.addTransaction(lunch);
    t.state.stale = true;
    const next = await t.finance.updateTransaction(tx.id, { amountToman: 300_000, category: "lifestyle" });
    expect(next.id).not.toBe(tx.id);
    expect(next).toMatchObject({ amountToman: 300_000, category: "lifestyle", title: "Lunch", note: "with Sara" });
    const corrections = t.calls.filter((call) => call.path.endsWith("/correct"));
    expect(corrections.map((call) => call.ifMatch)).toEqual(['"1"', '"2"']);
    expect(corrections[1]!.body).toMatchObject({ replacement: { type: "EXPENSE", amount: "3000000", categoryId: "cat-lifestyle" } });
    expect(await t.finance.transactions(MONTH.start, TODAY)).toMatchObject([{ id: next.id }]);
    await expect(t.finance.transaction(tx.id)).rejects.toMatchObject({ code: "not-found" });
  });

  it("reverses on remove and restores as a new posting", async () => {
    const t = setup();
    const tx = await t.finance.addTransaction(lunch);
    const removed = await t.finance.removeTransaction(tx.id);
    expect(removed).toMatchObject({ id: tx.id, amountToman: 250_000 });
    expect(t.calls.findLast((call) => call.method === "POST")).toMatchObject({ path: `/finance/transactions/${tx.id}/reverse`, ifMatch: '"1"', body: {} });
    expect(await t.finance.transactions(MONTH.start, TODAY)).toEqual([]);
    await expect(t.finance.removeTransaction(tx.id)).rejects.toMatchObject({ code: "not-found" });

    const restored = await t.finance.restoreTransaction(removed);
    expect(restored.id).not.toBe(tx.id);
    expect(restored).toMatchObject({ title: "Lunch", time: "13:30" });
  });

  it("derives the month from the ledger, budgets, accounts and savings", async () => {
    const t = setup();
    t.accounts.push({ id: "acc1", revision: 1, createdAt: "2026-01-01T00:00:00.000Z", currency: "IRR", archived: false, balance: "50000000.00" }, { id: "usd", revision: 1, createdAt: "2025-01-01T00:00:00.000Z", currency: "USD", archived: false, balance: "9.00" });
    t.categories.push({ id: "cat-food", revision: 1, name: "Food", kind: "EXPENSE", archived: false }, { id: "cat-x", revision: 1, name: "Gifts", kind: "EXPENSE", archived: false });
    t.goals.push({ id: "g", revision: 1, current: true, archived: false, currency: "IRR", target: "100000000.00", progress: "20000000.00" });
    t.budgets.push({ id: "b1", revision: 3, currency: "IRR", limit: "80000000.00", categoryId: null, period: "MONTHLY", calendar: "JALALI", archived: false }, { id: "b2", revision: 1, currency: "IRR", limit: "30000000.00", categoryId: "cat-food", period: "MONTHLY", calendar: "JALALI", archived: false });
    t.periods.push({ id: "p1", revision: 1, budgetId: "b1", startDate: MONTH.start, limit: "60000000.00" });
    await t.finance.addTransaction(lunch);
    await t.finance.addTransaction({ ...lunch, category: "other", amountToman: 100_000 });
    t.txs.at(-1)!.postings[0]!.categoryId = "cat-x";
    await t.finance.addTransaction({ kind: "income", amountToman: 9_000_000, category: null, title: "Pay", day: MONTH.start, time: null });
    t.bills.push({ id: "bill1", revision: 1, current: true, archived: false, type: "EXPENSE", currency: "IRR", name: "Rent" });
    t.previews.bill1 = [{ dueDate: "2026-11-15", amount: "70000000.00", state: "PAID" }, { dueDate: "2026-12-15", amount: "70000000.00", state: "UNPAID" }];

    const month = await t.finance.month(TODAY);
    expect(month).toMatchObject({ budgetToman: 6_000_000, incomeToman: 9_000_000, spentToman: 350_000, savedToman: 2_000_000, savingsGoalToman: 10_000_000, balanceToman: 5_000_000, transactionCount: 3 });
    expect(month.categories.find((row) => row.category === "food")).toEqual({ category: "food", budgetToman: 3_000_000, spentToman: 250_000 });
    expect(month.categories.find((row) => row.category === "other")).toEqual({ category: "other", budgetToman: null, spentToman: 100_000 });
    // A past month without a period has no budget; the summary carries the next unpaid bill.
    expect((await t.finance.month("2026-08-01")).budgetToman).toBeNull();
    expect(await t.finance.monthSummary(TODAY)).toMatchObject({ monthStart: MONTH.start, budgetToman: 6_000_000, spentToman: 350_000, daysInMonth: MONTH.daysInMonth, nextBill: { title: "Rent", amountToman: 7_000_000, dueDay: "2026-12-15" } });
  });

  it("sets the month's budget through the budget and its period", async () => {
    const t = setup();
    expect((await t.finance.setBudget(TODAY, 5_000_000)).budgetToman).toBe(5_000_000);
    expect(t.writes()).toEqual(["POST /finance/budgets", "POST /finance/budgets/b1/periods"]);
    expect(t.calls.find((call) => call.path === "/finance/budgets" && call.method === "POST")!.body).toEqual({ name: "Monthly budget", currency: "IRR", limit: "50000000", period: "MONTHLY", calendar: "JALALI" });
    expect(t.periods[0]).toMatchObject({ startDate: MONTH.start });

    expect((await t.finance.setBudget(TODAY, 7_000_000)).budgetToman).toBe(7_000_000);
    expect(t.writes().slice(2)).toEqual([`PATCH /finance/budgets/b1/periods/${t.periods[0]!.id}`]);
    await t.finance.setBudget(TODAY, 7_000_000);
    expect(t.writes().length).toBe(3);
  });

  it("rejects bad input before any request", async () => {
    const t = setup();
    await expect(t.finance.addTransaction({ ...lunch, amountToman: 0 })).rejects.toMatchObject({ code: "invalid" });
    await expect(t.finance.addTransaction({ ...lunch, category: null })).rejects.toMatchObject({ code: "invalid" });
    await expect(t.finance.addTransaction({ ...lunch, title: " " })).rejects.toMatchObject({ code: "invalid" });
    await expect(t.finance.setBudget(TODAY, 0)).rejects.toMatchObject({ code: "invalid" });
    await expect(t.finance.month("nope")).rejects.toMatchObject({ code: "invalid" });
    expect(t.calls.length).toBe(0);
  });
});
