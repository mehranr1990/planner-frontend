import type { SampleFinance } from "@/fixtures/personal/finance";
import { addDaysToDay, dayToLocalDate, diffDays, localDateToDay, parseClockTime, parseDay } from "@/lib/dates/clock-time";
import { getDaysInCalendarMonth, startOfCalendarMonth } from "@/lib/dates/month-grid";
import { FINANCE_CATEGORIES, type FinanceMonth, type FinanceMonthSummary, type Transaction } from "../domain";
import { RepositoryError, type FinanceRepository, type TransactionInput } from "../repositories";

/*
 * In-memory Finance (P13). Budget months are Jalali months; every total is
 * derived from the transactions, so adding or removing one moves the month,
 * the categories, Overview's summary and the balance together.
 */

interface MockFinanceOptions {
  finance: SampleFinance | null;
  respond<T>(value: T): Promise<T>;
}

/** First day of the Jalali month containing `day`, and its length. */
export function jalaliMonthOf(day: string): { start: string; daysInMonth: number } {
  const date = dayToLocalDate(day);
  return { start: localDateToDay(startOfCalendarMonth(date, "jalali")), daysInMonth: getDaysInCalendarMonth(date, "jalali") };
}

const signed = (tx: Transaction) => (tx.kind === "income" ? tx.amountToman : -tx.amountToman);

function check(input: Partial<TransactionInput>): void {
  if (input.amountToman !== undefined && !(Number.isFinite(input.amountToman) && input.amountToman > 0)) {
    throw new RepositoryError("invalid", "An amount must be positive");
  }
  if (input.day !== undefined && parseDay(input.day) === null) throw new RepositoryError("invalid", `Bad day "${input.day}"`);
  if (input.time && parseClockTime(input.time) === null) throw new RepositoryError("invalid", `Bad time "${input.time}"`);
  if (input.title !== undefined && !input.title.trim()) throw new RepositoryError("invalid", "A transaction needs a title");
}

function checkCategory(tx: Pick<Transaction, "kind" | "category">): void {
  const ok = tx.kind === "income" ? tx.category === null : tx.category !== null && FINANCE_CATEGORIES.includes(tx.category);
  if (!ok) throw new RepositoryError("invalid", "Expenses need a category; income has none");
}

export function createMockFinance({ finance, respond }: MockFinanceOptions): FinanceRepository {
  const transactions: Transaction[] = structuredClone([...(finance?.transactions ?? [])]);
  const months = new Map((finance?.months ?? []).map((month) => [month.start, { ...month }]));
  const categoryBudgets = { ...finance?.categoryBudgets };
  const bills = structuredClone([...(finance?.bills ?? [])]);
  // The balance before every sample transaction; "now" = base + all movements.
  const balanceBase = (finance?.balanceToman ?? 0) - transactions.reduce((sum, tx) => sum + signed(tx), 0);
  let counter = 0;

  const inRange = (from: string, to: string) => transactions.filter((tx) => from <= tx.day && tx.day <= to);
  const byNewest = (a: Transaction, b: Transaction) => b.day.localeCompare(a.day) || (b.time ?? "").localeCompare(a.time ?? "");

  function monthOf(start: string): FinanceMonth {
    const { start: first, daysInMonth } = jalaliMonthOf(start);
    const list = inRange(first, addDaysToDay(first, daysInMonth - 1));
    const stored = months.get(first);
    const expenses = list.filter((tx) => tx.kind === "expense");
    return {
      start: first,
      daysInMonth,
      budgetToman: stored?.budgetToman ?? null,
      incomeToman: list.filter((tx) => tx.kind === "income").reduce((sum, tx) => sum + tx.amountToman, 0),
      spentToman: expenses.reduce((sum, tx) => sum + tx.amountToman, 0),
      savedToman: stored?.savedToman ?? 0,
      savingsGoalToman: stored?.savingsGoalToman ?? null,
      balanceToman: balanceBase + transactions.reduce((sum, tx) => sum + signed(tx), 0),
      categories: FINANCE_CATEGORIES.map((category) => ({
        category,
        budgetToman: categoryBudgets[category] ?? null,
        spentToman: expenses.filter((tx) => tx.category === category).reduce((sum, tx) => sum + tx.amountToman, 0),
      })),
      transactionCount: list.length,
    };
  }

  function txOrThrow(id: string): number {
    const index = transactions.findIndex((tx) => tx.id === id);
    if (index === -1) throw new RepositoryError("not-found", `No transaction "${id}"`);
    return index;
  }

  const clean = (tx: Transaction): Transaction => {
    const next: Transaction = { ...tx, title: tx.title.trim() };
    if (next.note !== undefined) {
      const note = next.note.trim();
      if (note) next.note = note;
      else delete next.note;
    }
    return next;
  };

  return {
    monthSummary(day) {
      const { start } = jalaliMonthOf(day);
      const month = months.get(start);
      if (!month || month.budgetToman === null) return respond(null);
      const { daysInMonth, spentToman, budgetToman } = monthOf(start);
      const summary: FinanceMonthSummary = {
        monthStart: start,
        spentToman,
        budgetToman: budgetToman!,
        dayOfMonth: diffDays(start, day) + 1,
        daysInMonth,
        nextBill: [...bills].filter((bill) => bill.dueDay >= day).sort((a, b) => a.dueDay.localeCompare(b.dueDay))[0] ?? null,
      };
      return respond(summary);
    },
    month(start) {
      if (parseDay(start) === null) return Promise.reject(new RepositoryError("invalid", `Bad day "${start}"`));
      return respond(monthOf(start));
    },
    transactions(from, to) {
      return respond(inRange(from, to).sort(byNewest));
    },
    upcomingBills(from) {
      return respond(bills.filter((bill) => bill.dueDay >= from).sort((a, b) => a.dueDay.localeCompare(b.dueDay)));
    },
    transaction(id) {
      try {
        return respond(transactions[txOrThrow(id)]!);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    addTransaction(input) {
      try {
        check(input);
        checkCategory(input);
      } catch (error) {
        return Promise.reject(error);
      }
      counter += 1;
      const tx = clean({ ...input, id: `tx-new-${counter}` });
      transactions.push(tx);
      return respond(tx);
    },
    updateTransaction(id, patch) {
      try {
        const index = txOrThrow(id);
        check(patch);
        const next = clean({ ...transactions[index]!, ...patch, id });
        checkCategory(next);
        transactions[index] = next;
        return respond(next);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    removeTransaction(id) {
      try {
        const [removed] = transactions.splice(txOrThrow(id), 1);
        return respond(removed!);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    restoreTransaction(tx) {
      if (transactions.some((item) => item.id === tx.id)) return Promise.reject(new RepositoryError("invalid", `"${tx.id}" exists`));
      transactions.push(structuredClone(tx));
      return respond(tx);
    },
    setBudget(start, budgetToman) {
      if (!(budgetToman > 0)) return Promise.reject(new RepositoryError("invalid", "A budget must be positive"));
      const { start: first } = jalaliMonthOf(start);
      const month = months.get(first) ?? { start: first, budgetToman: null, savedToman: 0, savingsGoalToman: null };
      months.set(first, { ...month, budgetToman });
      return respond(monthOf(first));
    },
  };
}
