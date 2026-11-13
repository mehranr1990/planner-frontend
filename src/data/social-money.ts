/*
 * Social shared-expense arithmetic (SO-07 / SO-08 / SO-09 / SO-17). Pure and
 * exact: every amount is an integer in the scope currency's minor unit
 * (Toman has none, lira/euro have cents). Splits never round: the remainder
 * of an integer division is handed out one unit at a time, payer first, then
 * in member order (decision S6), and shown. Balances use approved records
 * and confirmed settlements only; nothing is ever summed across currencies.
 */

export type SplitMethod = "equal" | "fixed" | "percent" | "weighted" | "selected";

export const SPLIT_METHODS: readonly SplitMethod[] = ["equal", "fixed", "percent", "weighted", "selected"];

/** Percent values are basis points: 10000 = 100 %, 2500 = 25 %. */
export const PERCENT_SCALE = 10_000;

export interface SplitSpec {
  method: SplitMethod;
  /** Who shares the cost, in member order ("selected": the chosen subset). */
  participants: readonly string[];
  /** fixed: minor amounts · percent: basis points · weighted: integer weights. */
  values?: Readonly<Record<string, number>>;
}

export interface Share {
  personId: string;
  amount: number;
  /** Units received from the remainder (shown in the detail). */
  extra: number;
}

export type SplitError = "no-participants" | "invalid-amount" | "invalid-value" | "sum-mismatch";

export interface SplitResult {
  shares: Share[];
  /** Units handed out after the integer division. */
  remainder: number;
  /** Sum of the entered values (fixed: amount, percent: basis points, weighted: weights). */
  entered: number;
  /** What `entered` must equal (fixed: total, percent: 10000). Null for equal / selected / weighted. */
  expected: number | null;
  error: SplitError | null;
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Remainder order (S6): the payer first when they take part, then everyone else in member order. */
export function remainderOrder(participants: readonly string[], payerId: string | null): string[] {
  return payerId !== null && participants.includes(payerId) ? [payerId, ...participants.filter((id) => id !== payerId)] : [...participants];
}

/** Integer floor of total × weight ÷ sum, exact for safe integers. */
function proportional(total: number, weight: number, sum: number): number {
  return Number((BigInt(total) * BigInt(weight)) / BigInt(sum));
}

/**
 * Splits `total` (minor units) by `spec`. The result always sums to `total`
 * when `error` is null; otherwise `shares` holds what could be computed and
 * the caller keeps Save disabled.
 */
export function computeSplit(total: number, spec: SplitSpec, payerId: string | null): SplitResult {
  const people = [...new Set(spec.participants)];
  const empty = (error: SplitError, entered = 0, expected: number | null = null): SplitResult => ({
    shares: people.map((personId) => ({ personId, amount: 0, extra: 0 })),
    remainder: 0,
    entered,
    expected,
    error,
  });
  if (!isCount(total) || total === 0) return empty("invalid-amount");
  if (people.length === 0) return empty("no-participants");
  const values = spec.values ?? {};

  if (spec.method === "fixed") {
    const amounts = people.map((id) => values[id] ?? 0);
    if (!amounts.every(isCount)) return empty("invalid-value", 0, total);
    const entered = amounts.reduce((a, b) => a + b, 0);
    const shares = people.map((personId, i) => ({ personId, amount: amounts[i]!, extra: 0 }));
    return { shares, remainder: 0, entered, expected: total, error: entered === total ? null : "sum-mismatch" };
  }

  let weights: number[];
  let entered = 0;
  let expected: number | null = null;
  if (spec.method === "percent") {
    weights = people.map((id) => values[id] ?? 0);
    if (!weights.every(isCount)) return empty("invalid-value", 0, PERCENT_SCALE);
    entered = weights.reduce((a, b) => a + b, 0);
    expected = PERCENT_SCALE;
    if (entered !== PERCENT_SCALE) return { ...empty("sum-mismatch", entered, expected) };
  } else if (spec.method === "weighted") {
    weights = people.map((id) => values[id] ?? 1);
    if (!weights.every(isCount)) return empty("invalid-value");
    entered = weights.reduce((a, b) => a + b, 0);
    if (entered === 0) return empty("invalid-value");
  } else {
    // equal · selected (the participant list is the selection)
    weights = people.map(() => 1);
    entered = people.length;
  }

  const sum = weights.reduce((a, b) => a + b, 0);
  const base = weights.map((w) => proportional(total, w, sum));
  let remainder = total - base.reduce((a, b) => a + b, 0);
  const extra = new Map<string, number>();
  // Only people with a non-zero weight can receive remainder units.
  const order = remainderOrder(people, payerId).filter((id) => weights[people.indexOf(id)]! > 0);
  const handedOut = remainder;
  for (let i = 0; remainder > 0; i = (i + 1) % order.length, remainder -= 1) {
    extra.set(order[i]!, (extra.get(order[i]!) ?? 0) + 1);
  }
  const shares = people.map((personId, i) => ({ personId, amount: base[i]! + (extra.get(personId) ?? 0), extra: extra.get(personId) ?? 0 }));
  return { shares, remainder: handedOut, entered, expected, error: null };
}

export interface LedgerExpense {
  payerId: string;
  amount: number;
  shares: readonly { personId: string; amount: number }[];
}

export interface LedgerSettlement {
  fromId: string;
  toId: string;
  amount: number;
}

export interface PersonBalance {
  personId: string;
  paid: number;
  share: number;
  /** Settled to others minus settled from others. */
  settled: number;
  /** Positive = is owed, negative = owes. */
  net: number;
}

/**
 * Net balances of one scope (one currency). Pass approved expenses (their
 * approved version) and confirmed settlements only.
 */
export function computeBalances(expenses: readonly LedgerExpense[], settlements: readonly LedgerSettlement[], memberOrder: readonly string[]): PersonBalance[] {
  const rows = new Map<string, PersonBalance>();
  const row = (personId: string) => {
    let found = rows.get(personId);
    if (!found) {
      found = { personId, paid: 0, share: 0, settled: 0, net: 0 };
      rows.set(personId, found);
    }
    return found;
  };
  memberOrder.forEach(row);
  for (const expense of expenses) {
    row(expense.payerId).paid += expense.amount;
    for (const share of expense.shares) row(share.personId).share += share.amount;
  }
  for (const s of settlements) {
    row(s.fromId).settled += s.amount;
    row(s.toId).settled -= s.amount;
  }
  for (const r of rows.values()) r.net = r.paid - r.share + r.settled;
  return [...rows.values()];
}

export interface Transfer {
  fromId: string;
  toId: string;
  amount: number;
}

/**
 * Minimum-count transfers that clear the balances (greedy: largest debtor
 * pays largest creditor; ties in member order, so the result is stable).
 */
export function simplifyTransfers(balances: readonly PersonBalance[], memberOrder: readonly string[]): Transfer[] {
  const rank = (id: string) => {
    const i = memberOrder.indexOf(id);
    return i === -1 ? memberOrder.length : i;
  };
  const sortBy = (list: { id: string; left: number }[]) => list.sort((a, b) => b.left - a.left || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  const creditors = sortBy(balances.filter((b) => b.net > 0).map((b) => ({ id: b.personId, left: b.net })));
  const debtors = sortBy(balances.filter((b) => b.net < 0).map((b) => ({ id: b.personId, left: -b.net })));
  const transfers: Transfer[] = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c]!.left, debtors[d]!.left);
    if (amount > 0) transfers.push({ fromId: debtors[d]!.id, toId: creditors[c]!.id, amount });
    creditors[c]!.left -= amount;
    debtors[d]!.left -= amount;
    if (creditors[c]!.left === 0) c += 1;
    if (debtors[d]!.left === 0) d += 1;
  }
  return transfers;
}

/** Per-currency totals; amounts in different currencies are never added together. */
export function totalsByCurrency<C extends string>(rows: readonly { currency: C; net: number }[]): { currency: C; net: number }[] {
  const totals = new Map<C, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.net);
  return [...totals].map(([currency, net]) => ({ currency, net }));
}
