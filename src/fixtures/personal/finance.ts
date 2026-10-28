/*
 * SAMPLE DATA — Finance (P13) as drawn on the board for the sample day
 * (Tue 21 Mehr 1405 = 2026-10-13): three budget months (Mordad, Shahrivar,
 * Mehr 1405), their transactions, budgets per category and upcoming bills.
 * Mehr reconciles with the board: 46 transactions, spent 31.2M of a 48M
 * budget (Housing 12M · Food 5.8M · Transport 3.9M · Lifestyle 3.2M ·
 * Work 2.6M · Health 2.1M · Other 1.6M), income 48M, balance 186.4M.
 */

import type { FinanceCategory, Transaction, UpcomingBill } from "@/data/domain";
import { addDaysToDay } from "@/lib/dates/clock-time";
import { SAMPLE_DAY, sampleDays } from "./sample-day";

/** Marks every export in this module as sample content. */
export const isSampleData = true;

export interface SampleFinanceMonth {
  /** First day of the Jalali month. */
  start: string;
  budgetToman: number | null;
  savedToman: number;
  savingsGoalToman: number | null;
}

export interface SampleFinance {
  months: readonly SampleFinanceMonth[];
  /** Monthly budget per category (the same every month). */
  categoryBudgets: Readonly<Partial<Record<FinanceCategory, number>>>;
  transactions: readonly Transaction[];
  bills: readonly UpcomingBill[];
  /** All accounts, now, with every sample transaction applied. */
  balanceToman: number;
}

const MORDAD = "2026-07-23";
const SHAHRIVAR = "2026-08-23";
const MEHR = "2026-09-23";

/** Day `n` (1-based) of the month starting on `start`. */
const dayOf = (start: string, n: number) => addDaysToDay(start, n - 1);

const TITLES: Record<Exclude<FinanceCategory, "housing">, readonly string[]> = {
  food: ["Bakery", "Fruit market", "Supermarket", "Lunch", "Coffee beans", "Butcher", "Dinner out"],
  transport: ["Metro card", "Fuel", "Parking", "Tapsi ride", "Snapp ride"],
  lifestyle: ["Cinema", "Book store", "Clothes", "Concert ticket"],
  work: ["Coworking day", "Software subscription", "Office supplies"],
  health: ["Pharmacy", "Dentist", "Gym day pass"],
  other: ["Gift", "Phone top-up", "Donation"],
};

/**
 * `count` expenses of a category adding up to `total`, spread over days
 * 2…`lastDay` of a month — deterministic, so the sample never changes.
 */
function spread(start: string, key: string, category: Exclude<FinanceCategory, "housing">, total: number, count: number, lastDay: number): Transaction[] {
  const weights = Array.from({ length: count }, (_, i) => 1 + ((i * 7 + key.length + category.length) % 5) / 4);
  const sum = weights.reduce((a, b) => a + b, 0);
  let left = total;
  return weights.map((weight, i) => {
    const amount = i === count - 1 ? left : Math.round((total * weight) / sum / 10_000) * 10_000;
    left -= amount;
    const titles = TITLES[category];
    return {
      id: `tx-${key}-${category}-${i + 1}`,
      kind: "expense",
      amountToman: amount,
      category,
      title: titles[i % titles.length]!,
      day: dayOf(start, 2 + ((i * 5 + category.length * 3) % (lastDay - 1))),
      time: `${String(9 + ((i * 3 + category.length) % 11)).padStart(2, "0")}:${i % 2 ? "15" : "40"}`,
    };
  });
}

function month(start: string, key: string, lastDay: number, totals: Record<Exclude<FinanceCategory, "housing">, [number, number]>): Transaction[] {
  return [
    { id: `tx-${key}-rent`, kind: "expense", amountToman: 12_000_000, category: "housing", title: `Rent · ${key[0]!.toUpperCase()}${key.slice(1)}`, day: dayOf(start, 1), time: null },
    { id: `tx-${key}-salary`, kind: "income", amountToman: 48_000_000, category: null, title: "Salary · Araxitis", day: dayOf(start, 20), time: "10:00" },
    ...(Object.entries(totals) as [Exclude<FinanceCategory, "housing">, [number, number]][]).flatMap(([category, [total, count]]) =>
      spread(start, key, category, total, count, lastDay),
    ),
  ];
}

const mehr: Transaction[] = [
  { id: "tx-hyperstar", kind: "expense", amountToman: 1_240_000, category: "food", title: "Hyperstar groceries", day: SAMPLE_DAY, time: "12:10" },
  { id: "tx-snapp", kind: "expense", amountToman: 186_000, category: "transport", title: "Snapp ride", day: SAMPLE_DAY, time: "09:02" },
  { id: "tx-mehr-salary", kind: "income", amountToman: 48_000_000, category: null, title: "Salary · Araxitis", day: sampleDays.yesterday, time: "10:00" },
  { id: "tx-cafe-lamiz", kind: "expense", amountToman: 420_000, category: "lifestyle", title: "Café Lamiz", day: sampleDays.sunday, time: "17:30" },
  { id: "tx-pharmacy", kind: "expense", amountToman: 310_000, category: "health", title: "Pharmacy", day: sampleDays.saturday, time: "11:20" },
  { id: "tx-mehr-rent", kind: "expense", amountToman: 12_000_000, category: "housing", title: "Rent · Mehr", day: MEHR, time: null },
  // The rest of Mehr, before Saturday 18 so the board's recent list stays on top.
  ...spread(MEHR, "mehr", "food", 4_560_000, 10, 17),
  ...spread(MEHR, "mehr", "transport", 3_714_000, 9, 17),
  ...spread(MEHR, "mehr", "lifestyle", 2_780_000, 7, 17),
  ...spread(MEHR, "mehr", "work", 2_600_000, 5, 17),
  ...spread(MEHR, "mehr", "health", 1_790_000, 4, 17),
  ...spread(MEHR, "mehr", "other", 1_600_000, 5, 17),
];

export const sampleTransactions: readonly Transaction[] = [
  ...month(MORDAD, "mordad", 31, {
    food: [6_100_000, 11],
    transport: [3_200_000, 8],
    lifestyle: [2_900_000, 6],
    work: [2_400_000, 5],
    health: [1_200_000, 3],
    other: [1_100_000, 4],
  }),
  ...month(SHAHRIVAR, "shahrivar", 31, {
    food: [6_400_000, 12],
    transport: [3_500_000, 9],
    lifestyle: [2_400_000, 6],
    work: [2_200_000, 5],
    health: [1_400_000, 4],
    other: [1_300_000, 4],
  }),
  ...mehr,
];

export const sampleFinance: SampleFinance = {
  months: [
    { start: MORDAD, budgetToman: 48_000_000, savedToman: 8_400_000, savingsGoalToman: 8_000_000 },
    { start: SHAHRIVAR, budgetToman: 48_000_000, savedToman: 7_100_000, savingsGoalToman: 8_000_000 },
    { start: MEHR, budgetToman: 48_000_000, savedToman: 9_600_000, savingsGoalToman: 8_000_000 },
  ],
  categoryBudgets: {
    housing: 12_000_000,
    food: 7_000_000,
    transport: 4_000_000,
    lifestyle: 2_500_000,
    work: 3_000_000,
    health: 3_000_000,
    other: 2_000_000,
  },
  transactions: sampleTransactions,
  bills: [
    { title: "Internet", amountToman: 650_000, dueDay: sampleDays.thursday },
    { title: "Car insurance", amountToman: 9_400_000, dueDay: sampleDays.friday },
    { title: "Gym membership", amountToman: 1_800_000, dueDay: "2026-10-23" },
  ],
  balanceToman: 186_400_000,
};
