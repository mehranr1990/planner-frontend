import type { ApiClient, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { addDaysToDay, diffDays, instantAtTime, instantToClockTime, parseClockTime, parseDay } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { FINANCE_CATEGORIES, type FinanceCategory, type FinanceMonth, type Transaction, type UpcomingBill } from "../domain";
import { jalaliMonthOf } from "../mock/mock-finance";
import { RepositoryError, type FinanceRepository, type TransactionInput } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Finance (Phase 10–11) over /finance. The UI knows one wallet in Toman; the
 * API is a multi-account ledger in ISO currencies:
 * - Money: Toman ⇄ IRR (×10), sent as exact decimal strings. Only IRR is read;
 *   other currencies, transfers and adjustments have no UI shape and are left out
 *   of the list (they still move the balance, which is the accounts' own sum).
 * - Account: the oldest active IRR account; the first write creates "Personal"
 *   when there is none. Reads never create anything.
 * - Categories: the seven UI categories are EXPENSE categories matched by name
 *   (created on first use); any other API category reads as "other".
 * - A transaction has one `note`: first line = title, the rest = note. A missing
 *   time is stored as local 00:00 (and read back as "no time").
 * - Posted money is immutable: update = correct (the replacement has a new id),
 *   remove = reverse, undo = a new posting (new id).
 * - Budget: one MONTHLY · JALALI budget without a category; a month's budget is
 *   its period snapshot, or the budget's own limit for the current/future months
 *   that have no period yet. Category budgets are read the same way (no UI to edit).
 * - Bills: unpaid occurrences of active EXPENSE bills in the next 90 days.
 */

type ApiTx = ResponseData<"/api/v1/finance/transactions/{id}", "get">;
type ApiBudget = ResponseData<"/api/v1/finance/budgets/{id}", "get">;
type ApiPeriod = ResponseData<"/api/v1/finance/budgets/{id}/periods", "get">["items"][number];

const CURRENCY = "IRR";
const PAGE = "100";
const BILL_WINDOW_DAYS = 90;
const MAX_NOTE = 4000;

/** Toman → an exact IRR decimal string (no float maths for whole Toman). */
export function tomanToRial(toman: number): string {
  if (!(Number.isFinite(toman) && toman > 0)) invalid("An amount must be positive");
  if (Number.isSafeInteger(toman)) return `${toman}0`;
  const rial = toman * 10;
  if (!Number.isSafeInteger(Math.round(rial * 100))) invalid("The amount is too large");
  return rial.toFixed(2);
}

/** A (signed) IRR decimal string → positive Toman. */
export const rialToToman = (amount: string): number => Math.abs(Number(amount)) / 10;

const label = (category: FinanceCategory) => category[0]!.toUpperCase() + category.slice(1);

function check(tx: TransactionInput): void {
  if (!(Number.isFinite(tx.amountToman) && tx.amountToman > 0)) invalid("An amount must be positive");
  if (parseDay(tx.day) === null) invalid(`Bad day "${tx.day}"`);
  if (tx.time && parseClockTime(tx.time) === null) invalid(`Bad time "${tx.time}"`);
  if (!tx.title.trim()) invalid("A transaction needs a title");
  const ok = tx.kind === "income" ? tx.category === null : tx.category !== null && FINANCE_CATEGORIES.includes(tx.category);
  if (!ok) invalid("Expenses need a category; income has none");
}

export function createApiFinanceRepository(client: ApiClient, { today }: { today: () => string }): FinanceRepository {
  let categoryIds: Map<FinanceCategory, string> | null = null;

  const accounts = async () =>
    (await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/accounts", { query: { limit: PAGE, cursor, currency: CURRENCY, archived: "false" } })).data))
      .filter((account) => account.currency === CURRENCY && !account.archived)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  async function accountId(): Promise<string> {
    const [first] = await accounts();
    if (first) return first.id;
    return (await client.request("post", "/api/v1/finance/accounts", { header: { "Idempotency-Key": newIdempotencyKey() }, body: { name: "Personal", currency: CURRENCY } })).data.id;
  }

  async function categories(): Promise<Map<FinanceCategory, string>> {
    if (categoryIds) return categoryIds;
    const list = await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/categories", { query: { limit: PAGE, cursor, archived: "false" } })).data);
    const map = new Map<FinanceCategory, string>();
    for (const item of list) {
      const key = item.name.trim().toLowerCase() as FinanceCategory;
      if (item.kind === "EXPENSE" && !item.archived && FINANCE_CATEGORIES.includes(key) && !map.has(key)) map.set(key, item.id);
    }
    categoryIds = map;
    return map;
  }

  async function categoryId(category: FinanceCategory): Promise<string> {
    const map = await categories();
    const known = map.get(category);
    if (known) return known;
    const { data } = await client.request("post", "/api/v1/finance/categories", {
      header: { "Idempotency-Key": newIdempotencyKey() },
      body: { name: label(category), kind: "EXPENSE", position: FINANCE_CATEGORIES.indexOf(category) },
    });
    map.set(category, data.id);
    return data.id;
  }

  /** A live income/expense in IRR as the UI's transaction; anything else → null. */
  function toTx(dto: ApiTx, names: Map<string, FinanceCategory>): Transaction | null {
    if (dto.effect !== "POSTED" || dto.state !== "POSTED" || (dto.type !== "INCOME" && dto.type !== "EXPENSE")) return null;
    const posting = dto.postings.find((item) => item.role === dto.type && item.currency === CURRENCY);
    if (!posting) return null;
    const [title = "", ...rest] = (dto.note ?? "").split("\n");
    const time = instantToClockTime(dto.occurredAt);
    const tx: Transaction = {
      id: dto.id,
      kind: dto.type === "INCOME" ? "income" : "expense",
      amountToman: rialToToman(posting.amount),
      category: dto.type === "INCOME" ? null : ((posting.categoryId && names.get(posting.categoryId)) || "other"),
      title,
      day: dto.localDate,
      time: time === "00:00" ? null : time,
    };
    const note = rest.join("\n").trim();
    if (note) tx.note = note;
    return tx;
  }

  const categoryNames = async () => new Map([...(await categories())].map(([key, id]) => [id, key]));

  async function list(from: string, to: string): Promise<Transaction[]> {
    // The contract does not say whether `to` is inclusive: ask one day more and filter.
    const dtos = await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/transactions", { query: { limit: PAGE, cursor, currency: CURRENCY, state: "POSTED", from, to: addDaysToDay(to, 1) } })).data);
    const names = await categoryNames();
    return dtos
      .map((dto) => toTx(dto, names))
      .filter((tx): tx is Transaction => tx !== null && from <= tx.day && tx.day <= to)
      .sort((a, b) => b.day.localeCompare(a.day) || (b.time ?? "").localeCompare(a.time ?? ""));
  }

  const fetchTx = async (id: string) => (await client.request("get", "/api/v1/finance/transactions/{id}", { path: { id } })).data;

  async function loaded(id: string): Promise<{ dto: ApiTx; tx: Transaction }> {
    const dto = await fetchTx(id);
    const tx = toTx(dto, await categoryNames());
    if (!tx) throw new RepositoryError("not-found", `No transaction "${id}"`);
    return { dto, tx };
  }

  async function body(input: TransactionInput) {
    const title = input.title.trim().replace(/\s*\n\s*/g, " ");
    const note = input.note?.trim();
    const text = note ? `${title}\n${note}` : title;
    if (text.length > MAX_NOTE) invalid("The title and note are too long");
    const occurredAt = new Date(instantAtTime(input.day, input.time ?? "00:00"));
    // The ledger refuses postings later than the server clock (400, verified in ledger.service): say so without a request.
    if (occurredAt.getTime() > Date.now()) invalid("A transaction cannot be in the future");
    const base = {
      accountId: await accountId(),
      amount: tomanToRial(input.amountToman),
      // The API accepts instants in UTC ("…Z") only.
      occurredAt: occurredAt.toISOString(),
      timezone: getPlannerTimeZone(),
      localDate: input.day,
      note: text,
    };
    return input.kind === "income" ? { ...base, type: "INCOME" as const, categoryId: null } : { ...base, type: "EXPENSE" as const, categoryId: await categoryId(input.category!) };
  }

  async function add(input: TransactionInput): Promise<Transaction> {
    check(input);
    return mapErrors(async () => {
      const { data } = await client.request("post", "/api/v1/finance/transactions", { header: { "Idempotency-Key": newIdempotencyKey() }, body: await body(input) });
      return toTx(data, await categoryNames())!;
    });
  }

  // ── Budgets ──

  const budgets = async () =>
    (await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/budgets", { query: { limit: PAGE, cursor, currency: CURRENCY, archived: "false" } })).data)).filter(
      (budget) => budget.currency === CURRENCY && !budget.archived && budget.period === "MONTHLY" && budget.calendar === "JALALI",
    );

  const periods = (id: string) => pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/budgets/{id}/periods", { path: { id }, query: { limit: PAGE, cursor } })).data);

  /** The month's limit: its period snapshot, else the budget's limit for a month that has not ended. */
  async function limitOf(budget: ApiBudget | undefined, first: string, daysInMonth: number): Promise<number | null> {
    if (!budget) return null;
    const period = (await periods(budget.id)).find((item) => item.startDate === first);
    if (period) return rialToToman(period.limit);
    return addDaysToDay(first, daysInMonth - 1) >= today() ? rialToToman(budget.limit) : null;
  }

  async function month(start: string): Promise<FinanceMonth> {
    if (parseDay(start) === null) invalid(`Bad day "${start}"`);
    const { start: first, daysInMonth } = jalaliMonthOf(start);
    const [txs, allBudgets, allAccounts, goals, ids] = await Promise.all([
      list(first, addDaysToDay(first, daysInMonth - 1)),
      budgets(),
      accounts(),
      pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/savings-goals", { query: { limit: PAGE, cursor, currency: CURRENCY, archived: "false" } })).data),
      categories(),
    ]);
    const expenses = txs.filter((tx) => tx.kind === "expense");
    const sum = (items: Transaction[]) => items.reduce((total, tx) => total + tx.amountToman, 0);
    const goal = goals.find((item) => item.current && !item.archived && item.currency === CURRENCY);
    const categoryRows = [];
    for (const category of FINANCE_CATEGORIES) {
      const id = ids.get(category);
      categoryRows.push({
        category,
        budgetToman: await limitOf(id ? allBudgets.find((budget) => budget.categoryId === id) : undefined, first, daysInMonth),
        spentToman: sum(expenses.filter((tx) => tx.category === category)),
      });
    }
    return {
      start: first,
      daysInMonth,
      budgetToman: await limitOf(allBudgets.find((budget) => budget.categoryId === null), first, daysInMonth),
      incomeToman: sum(txs.filter((tx) => tx.kind === "income")),
      spentToman: sum(expenses),
      savedToman: goal ? rialToToman(goal.progress) : 0,
      savingsGoalToman: goal ? rialToToman(goal.target) : null,
      balanceToman: allAccounts.reduce((total, account) => total + Number(account.balance), 0) / 10,
      categories: categoryRows,
      transactionCount: txs.length,
    };
  }

  async function upcomingBills(from: string): Promise<UpcomingBill[]> {
    if (parseDay(from) === null) invalid(`Bad day "${from}"`);
    const bills = (await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/bills", { query: { limit: PAGE, cursor, currency: CURRENCY, archived: "false" } })).data)).filter(
      (bill) => bill.current && !bill.archived && bill.type === "EXPENSE" && bill.currency === CURRENCY,
    );
    const to = addDaysToDay(from, BILL_WINDOW_DAYS);
    const due: UpcomingBill[] = [];
    for (const bill of bills) {
      const items = await pageAll(async (cursor) => (await client.request("get", "/api/v1/finance/bills/{id}/preview", { path: { id: bill.id }, query: { limit: PAGE, cursor, from, to } })).data);
      for (const item of items) if (item.state === "UNPAID" && item.dueDate >= from) due.push({ title: bill.name, amountToman: rialToToman(item.amount), dueDay: item.dueDate });
    }
    return due.sort((a, b) => a.dueDay.localeCompare(b.dueDay));
  }

  return {
    monthSummary: (day) =>
      mapErrors(async () => {
        if (parseDay(day) === null) invalid(`Bad day "${day}"`);
        const { start, daysInMonth } = jalaliMonthOf(day);
        const budgetToman = await limitOf((await budgets()).find((budget) => budget.categoryId === null), start, daysInMonth);
        if (budgetToman === null) return null;
        const [txs, bills] = await Promise.all([list(start, addDaysToDay(start, daysInMonth - 1)), upcomingBills(day)]);
        return {
          monthStart: start,
          spentToman: txs.filter((tx) => tx.kind === "expense").reduce((total, tx) => total + tx.amountToman, 0),
          budgetToman,
          dayOfMonth: diffDays(start, day) + 1,
          daysInMonth,
          nextBill: bills[0] ?? null,
        };
      }),

    month: (start) => mapErrors(() => month(start)),

    transactions: (from, to) => mapErrors(() => list(from, to)),

    upcomingBills: (from) => mapErrors(() => upcomingBills(from)),

    transaction: (id) => mapErrors(async () => (await loaded(id)).tx),

    addTransaction: add,

    updateTransaction: (id, patch) =>
      mapErrors(async () => {
        let current = await loaded(id);
        const next: TransactionInput = { ...current.tx, ...patch };
        check(next);
        const replacement = await body(next);
        const data = await retryOnConflict(
          async () =>
            (await client.request("post", "/api/v1/finance/transactions/{id}/correct", { path: { id }, header: { "If-Match": revisionTag(current.dto.revision), "Idempotency-Key": newIdempotencyKey() }, body: { replacement } })).data,
          async () => {
            current = await loaded(id);
          },
        );
        // The response is the replacement, or the corrected original pointing at it.
        const names = await categoryNames();
        const direct = data.id !== id ? toTx(data, names) : null;
        const tx = direct ?? (data.replacementId ? toTx(await fetchTx(data.replacementId), names) : null);
        if (!tx) throw new RepositoryError("partial", "The correction was saved, but the new transaction could not be read");
        return tx;
      }),

    removeTransaction: (id) =>
      mapErrors(async () => {
        let current = await loaded(id);
        await retryOnConflict(
          () => client.request("post", "/api/v1/finance/transactions/{id}/reverse", { path: { id }, header: { "If-Match": revisionTag(current.dto.revision), "Idempotency-Key": newIdempotencyKey() }, body: {} }),
          async () => {
            current = await loaded(id);
          },
        );
        return current.tx;
      }),

    restoreTransaction: (tx) => add({ kind: tx.kind, amountToman: tx.amountToman, category: tx.category, title: tx.title, day: tx.day, time: tx.time, ...(tx.note ? { note: tx.note } : {}) }),

    setBudget: (start, budgetToman) =>
      mapErrors(async () => {
        if (!(budgetToman > 0)) invalid("A budget must be positive");
        if (parseDay(start) === null) invalid(`Bad day "${start}"`);
        const limit = tomanToRial(budgetToman);
        const { start: first } = jalaliMonthOf(start);
        const findBudget = async () => (await budgets()).find((item) => item.categoryId === null);
        let budget: ApiBudget | undefined = await findBudget();
        budget ??= (await client.request("post", "/api/v1/finance/budgets", { header: { "Idempotency-Key": newIdempotencyKey() }, body: { name: "Monthly budget", currency: CURRENCY, limit, period: "MONTHLY", calendar: "JALALI" } })).data;
        const budgetId = budget.id;
        const findPeriod = async () => (await periods(budgetId)).find((item) => item.startDate === first);
        let period: ApiPeriod | undefined = await findPeriod();
        period ??= await retryOnConflict(
          async () => (await client.request("post", "/api/v1/finance/budgets/{id}/periods", { path: { id: budgetId }, header: { "If-Match": revisionTag(budget!.revision), "Idempotency-Key": newIdempotencyKey() }, body: { date: first } })).data,
          async () => {
            budget = (await findBudget()) ?? budget;
          },
        );
        if (Number(period.limit) !== Number(limit)) {
          await retryOnConflict(
            () => client.request("patch", "/api/v1/finance/budgets/{id}/periods/{periodId}", { path: { id: budgetId, periodId: period!.id }, header: { "If-Match": revisionTag(period!.revision) }, body: { limit } }),
            async () => {
              period = (await findPeriod()) ?? period;
            },
          );
        }
        return month(first);
      }),
  };
}
