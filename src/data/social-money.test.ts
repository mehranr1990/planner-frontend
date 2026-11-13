import { describe, expect, it } from "vitest";
import { computeBalances, computeSplit, remainderOrder, simplifyTransfers, totalsByCurrency } from "./social-money";

const sum = (shares: { amount: number }[]) => shares.reduce((a, s) => a + s.amount, 0);

describe("computeSplit", () => {
  it("splits equally with the remainder to the payer first, then member order", () => {
    const r = computeSplit(100, { method: "equal", participants: ["a", "b", "c"] }, "b");
    expect(r.error).toBeNull();
    expect(r.remainder).toBe(1);
    expect(r.shares.map((s) => [s.personId, s.amount, s.extra])).toEqual([
      ["a", 33, 0],
      ["b", 34, 1],
      ["c", 33, 0],
    ]);
  });

  it("hands out several remainder units deterministically", () => {
    const r = computeSplit(11, { method: "equal", participants: ["a", "b", "c", "d"] }, "c");
    expect(r.remainder).toBe(3);
    expect(r.shares.map((s) => s.amount)).toEqual([3, 3, 3, 2]);
    expect(remainderOrder(["a", "b", "c", "d"], "c")).toEqual(["c", "a", "b", "d"]);
    expect(sum(r.shares)).toBe(11);
  });

  it("skips a payer who does not take part", () => {
    const r = computeSplit(10, { method: "selected", participants: ["a", "c", "d"] }, "b");
    expect(r.shares.map((s) => s.amount)).toEqual([4, 3, 3]);
  });

  it("matches the weighted board example exactly (remainder 0)", () => {
    const r = computeSplit(3_450_000, { method: "weighted", participants: ["me", "nazanin", "arman", "parisa"], values: { arman: 2 } }, "arman");
    expect(r.shares.map((s) => s.amount)).toEqual([690_000, 690_000, 1_380_000, 690_000]);
    expect(r.remainder).toBe(0);
  });

  it("weighted never gives remainder to a zero weight", () => {
    const r = computeSplit(10, { method: "weighted", participants: ["a", "b", "c"], values: { a: 0, b: 1, c: 2 } }, "a");
    expect(r.shares.map((s) => s.amount)).toEqual([0, 4, 6]);
    expect(sum(r.shares)).toBe(10);
  });

  it("percent requires exactly 100 % and splits by basis points", () => {
    expect(computeSplit(1000, { method: "percent", participants: ["a", "b"], values: { a: 5000, b: 4000 } }, "a").error).toBe("sum-mismatch");
    const r = computeSplit(1001, { method: "percent", participants: ["a", "b", "c"], values: { a: 3334, b: 3333, c: 3333 } }, "c");
    expect(r.error).toBeNull();
    expect(sum(r.shares)).toBe(1001);
    expect(r.shares.map((s) => s.amount)).toEqual([334, 333, 334]);
  });

  it("fixed must sum to the total", () => {
    const bad = computeSplit(500, { method: "fixed", participants: ["a", "b"], values: { a: 200, b: 200 } }, "a");
    expect(bad.error).toBe("sum-mismatch");
    expect(bad.entered).toBe(400);
    const ok = computeSplit(500, { method: "fixed", participants: ["a", "b"], values: { a: 200, b: 300 } }, "a");
    expect(ok.error).toBeNull();
    expect(ok.remainder).toBe(0);
  });

  it("rejects fractions, negatives and empty lists", () => {
    expect(computeSplit(10.5, { method: "equal", participants: ["a"] }, "a").error).toBe("invalid-amount");
    expect(computeSplit(10, { method: "equal", participants: [] }, "a").error).toBe("no-participants");
    expect(computeSplit(10, { method: "fixed", participants: ["a"], values: { a: -10 } }, "a").error).toBe("invalid-value");
    expect(computeSplit(10, { method: "weighted", participants: ["a"], values: { a: 1.5 } }, "a").error).toBe("invalid-value");
  });

  it("stays exact for large amounts", () => {
    const r = computeSplit(9_007_199_254_740_991, { method: "equal", participants: ["a", "b", "c"] }, "a");
    expect(r.shares.map((s) => s.amount)).toEqual([3_002_399_751_580_331, 3_002_399_751_580_330, 3_002_399_751_580_330]);
  });
});

describe("balances", () => {
  const order = ["me", "nazanin", "babak", "sara"];
  it("nets paid minus share plus confirmed settlements", () => {
    const rows = computeBalances(
      [{ payerId: "me", amount: 1200, shares: order.map((personId) => ({ personId, amount: 300 })) }],
      [{ fromId: "sara", toId: "me", amount: 100 }],
      order,
    );
    expect(rows.find((r) => r.personId === "me")).toMatchObject({ paid: 1200, share: 300, settled: -100, net: 800 });
    expect(rows.find((r) => r.personId === "sara")!.net).toBe(-200);
    expect(rows.reduce((a, r) => a + r.net, 0)).toBe(0);
  });

  it("simplifies to minimum transfers with stable order", () => {
    const rows = computeBalances([{ payerId: "me", amount: 900, shares: order.slice(1).map((personId) => ({ personId, amount: 300 })) }], [], order);
    expect(simplifyTransfers(rows, order)).toEqual([
      { fromId: "nazanin", toId: "me", amount: 300 },
      { fromId: "babak", toId: "me", amount: 300 },
      { fromId: "sara", toId: "me", amount: 300 },
    ]);
  });

  it("never adds different currencies", () => {
    expect(totalsByCurrency([{ currency: "toman", net: 5 }, { currency: "try", net: -3 }, { currency: "toman", net: 2 }])).toEqual([
      { currency: "toman", net: 7 },
      { currency: "try", net: -3 },
    ]);
  });
});
