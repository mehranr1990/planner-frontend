import { FINANCE_CATEGORIES, type FinanceCategory, type FinanceMonth, type Transaction } from "@/data/domain";
import { addDaysToDay, dayToLocalDate, diffDays, localDateToDay } from "@/lib/dates/clock-time";
import { addCalendarMonths, createCalendarDate, getCalendarParts, getDaysInCalendarMonth, startOfCalendarMonth } from "@/lib/dates/month-grid";
import { toLatinDigits } from "@/lib/locale/digits";

/*
 * Finance (P13) rules, pure: tabs and month params, budget pace, the series
 * the River and Flow draw, the observation's facts, and the Quick Add line
 * parser ("250k lunch #food"). Budget months are Jalali months.
 */

export const FINANCE_TABS = ["overview", "trends", "breakdown", "transactions"] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

export function isFinanceTab(value: unknown): value is FinanceTab {
  return typeof value === "string" && (FINANCE_TABS as readonly string[]).includes(value);
}

/** Under this many transactions a month is "sparse": numbers, not River / Flow. */
export const SPARSE_BELOW = 5;

export type RiverPeriod = "month" | "quarter";

// ── Months ───────────────────────────────────────────────────────────────

export interface BudgetMonthRef {
  /** First day, "YYYY-MM-DD". */
  start: string;
  /** Last day, inclusive. */
  end: string;
  daysInMonth: number;
  /** "1405-07", the ?month= value. */
  key: string;
}

export function budgetMonthOf(day: string): BudgetMonthRef {
  const date = dayToLocalDate(day);
  const start = localDateToDay(startOfCalendarMonth(date, "jalali"));
  const daysInMonth = getDaysInCalendarMonth(date, "jalali");
  const { year, month } = getCalendarParts(date, "jalali");
  return { start, end: addDaysToDay(start, daysInMonth - 1), daysInMonth, key: `${year}-${String(month).padStart(2, "0")}` };
}

/** "?month=1405-07" → that month; anything else → null. */
export function parseMonthParam(value: string | null | undefined): BudgetMonthRef | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return budgetMonthOf(localDateToDay(createCalendarDate("jalali", year, month, 1)));
}

export function shiftMonth(ref: BudgetMonthRef, amount: number): BudgetMonthRef {
  return budgetMonthOf(localDateToDay(addCalendarMonths(dayToLocalDate(ref.start), amount, "jalali")));
}

// ── Pace ─────────────────────────────────────────────────────────────────

export interface BudgetPace {
  /** Day of the month the pace is measured at (the last day for a closed month). */
  day: number;
  /** Budget expected to be spent by `day`. */
  expected: number;
  /** spent − expected: negative = under pace. Neutral either way. */
  diff: number;
  /** Fractions of the budget (0–1+). */
  ratio: number;
  expectedRatio: number;
  closed: boolean;
}

export function budgetPace(month: Pick<FinanceMonth, "start" | "daysInMonth" | "budgetToman" | "spentToman">, today: string): BudgetPace | null {
  if (!month.budgetToman) return null;
  const elapsed = diffDays(month.start, today) + 1;
  const closed = elapsed > month.daysInMonth;
  const day = Math.min(month.daysInMonth, Math.max(1, elapsed));
  const expectedRatio = day / month.daysInMonth;
  const expected = month.budgetToman * expectedRatio;
  return { day, expected, diff: month.spentToman - expected, ratio: month.spentToman / month.budgetToman, expectedRatio, closed };
}

/** Categories that spent more than their budget. */
export function overBudget(month: Pick<FinanceMonth, "categories">): FinanceCategory[] {
  return month.categories.filter((item) => item.budgetToman !== null && item.spentToman > item.budgetToman).map((item) => item.category);
}

// ── River & Flow series ──────────────────────────────────────────────────

export interface RiverData {
  /** First day of each point (a day, or a week's first day). */
  points: string[];
  /** Spending per category per point, in FINANCE_CATEGORIES order. */
  values: Record<FinanceCategory, number[]>;
  /** Last point that is not in the future. */
  todayIndex: number;
  unit: "daily" | "weekly";
}

/** Daily spending of one month, or weekly over the three months ending with it. */
export function riverData(transactions: readonly Transaction[], month: BudgetMonthRef, period: RiverPeriod, today: string): RiverData {
  const first = period === "month" ? month.start : shiftMonth(month, -2).start;
  const span = diffDays(first, month.end) + 1;
  const size = period === "month" ? 1 : 7;
  const count = Math.ceil(span / size);
  const points = Array.from({ length: count }, (_, i) => addDaysToDay(first, i * size));
  const values = Object.fromEntries(FINANCE_CATEGORIES.map((category) => [category, Array<number>(count).fill(0)])) as Record<FinanceCategory, number[]>;
  for (const tx of transactions) {
    if (tx.kind !== "expense" || !tx.category || tx.day < first || tx.day > month.end) continue;
    values[tx.category][Math.floor(diffDays(first, tx.day) / size)]! += tx.amountToman;
  }
  const todayIndex = today > month.end ? count - 1 : Math.max(0, Math.floor(diffDays(first, today) / size));
  return { points, values, todayIndex, unit: period === "month" ? "daily" : "weekly" };
}

/** Points after today carry the average of the past points (the faded forecast). */
export function withForecast(data: RiverData): RiverData {
  if (data.todayIndex >= data.points.length - 1) return data;
  const past = data.todayIndex + 1;
  const values = Object.fromEntries(
    FINANCE_CATEGORIES.map((category) => {
      const series = data.values[category];
      const average = series.slice(0, past).reduce((a, b) => a + b, 0) / past;
      return [category, series.map((value, i) => (i < past ? value : average))];
    }),
  ) as Record<FinanceCategory, number[]>;
  return { ...data, values };
}

/** The busiest point and its top category, for the observation sentence. */
export function riverPeak(data: RiverData): { index: number; category: FinanceCategory } | null {
  let best: { index: number; category: FinanceCategory; total: number } | null = null;
  for (let i = 0; i <= data.todayIndex; i += 1) {
    let total = 0;
    let top: FinanceCategory = FINANCE_CATEGORIES[0];
    for (const category of FINANCE_CATEGORIES) {
      total += data.values[category][i] ?? 0;
      if ((data.values[category][i] ?? 0) > (data.values[top][i] ?? 0)) top = category;
    }
    if (total > 0 && (!best || total > best.total)) best = { index: i, category: top, total };
  }
  return best ? { index: best.index, category: best.category } : null;
}

// ── Transactions ─────────────────────────────────────────────────────────

export const signedAmount = (tx: Pick<Transaction, "kind" | "amountToman">) => (tx.kind === "income" ? tx.amountToman : -tx.amountToman);

export interface TransactionFilter {
  query: string;
  category: FinanceCategory | "all";
  kind: "all" | "expense" | "income";
}

export function filterTransactions(list: readonly Transaction[], { query, category, kind }: TransactionFilter, categoryLabel: (category: FinanceCategory) => string): Transaction[] {
  const needle = query.trim().toLocaleLowerCase();
  return list.filter(
    (tx) =>
      (kind === "all" || tx.kind === kind) &&
      (category === "all" || tx.category === category) &&
      (!needle ||
        tx.title.toLocaleLowerCase().includes(needle) ||
        (tx.note ?? "").toLocaleLowerCase().includes(needle) ||
        (tx.category !== null && categoryLabel(tx.category).toLocaleLowerCase().includes(needle))),
  );
}

// ── Quick Add line ───────────────────────────────────────────────────────

export interface ParsedExpense {
  /** Toman (or Rial when the user types in Rial; the caller converts). */
  amount: number | null;
  category: FinanceCategory | null;
  title: string;
}

const MULTIPLIERS: Record<string, number> = { k: 1_000, هزار: 1_000, m: 1_000_000, میلیون: 1_000_000 };

/**
 * "250k lunch #food" → 250000 · Food · "lunch". The first number (with an
 * optional k / m / هزار / میلیون) is the amount; "#tag" picks a category by
 * id or by a localised name; the rest is the description.
 */
export function parseExpenseLine(line: string, names: Readonly<Record<FinanceCategory, string>> = {} as Record<FinanceCategory, string>): ParsedExpense {
  let text = toLatinDigits(line).replace(/[٬،]/g, ",");
  let amount: number | null = null;
  const number = /(^|\s)(\d[\d,]*(?:\.\d+)?)\s*(k|m|هزار|میلیون)?(?=\s|$)/i.exec(text);
  if (number) {
    const value = Number(number[2]!.replace(/,/g, ""));
    const unit = number[3]?.toLowerCase();
    if (Number.isFinite(value) && value > 0) amount = Math.round(value * (unit ? MULTIPLIERS[unit]! : 1));
    text = text.replace(number[0], " ");
  }
  let category: FinanceCategory | null = null;
  const tag = /#(\S+)/u.exec(text);
  if (tag) {
    const wanted = tag[1]!.toLocaleLowerCase();
    category =
      FINANCE_CATEGORIES.find((id) => id === wanted || names[id]?.toLocaleLowerCase().replace(/\s+/g, "") === wanted.replace(/[_-]/g, "")) ?? null;
    text = text.replace(tag[0], " ");
  }
  return { amount, category, title: text.replace(/\s+/g, " ").trim() };
}
