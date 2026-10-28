import { describe, expect, it } from "vitest";
import { RepositoryError } from "../repositories";
import { createMockRepositories } from "./mock-repositories";

const WEEK = "2026-10-10";

describe("mock review (P16)", () => {
  it("starts empty, upserts field by field and returns clones", async () => {
    const { review } = createMockRepositories();
    expect(await review.get(WEEK)).toBeNull();
    const first = await review.save(WEEK, { step: "carry", wins: [{ id: "w1", title: "Shipped", source: "own" }] });
    expect(first).toMatchObject({ week: WEEK, step: "carry", priorities: [], completedAt: null });
    const second = await review.save(WEEK, { wentWell: "Calm mornings", step: undefined });
    expect(second).toMatchObject({ step: "carry", wentWell: "Calm mornings" });
    expect(second.wins).toHaveLength(1);
    second.wins.push({ id: "x", title: "leak", source: "own" });
    expect((await review.get(WEEK))?.wins).toHaveLength(1);
  });

  it("rejects too many wins or priorities and a bad week", async () => {
    const { review } = createMockRepositories();
    const wins = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, title: `Win ${i}`, source: "own" as const }));
    await expect(review.save(WEEK, { wins })).rejects.toBeInstanceOf(RepositoryError);
    const priorities = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, title: `P ${i}` }));
    await expect(review.save(WEEK, { priorities })).rejects.toMatchObject({ code: "invalid" });
    await expect(review.save("1405-7-18", {})).rejects.toMatchObject({ code: "invalid" });
  });

  it("serves reviews from the fixtures without sharing them", async () => {
    const stored = { week: WEEK, step: "plan" as const, wins: [], priorities: [], routes: {}, wentWell: "", slipped: "", change: "", completedAt: null, updatedAt: "x" };
    const a = createMockRepositories({ fixtures: { reviews: [stored] } });
    await a.review.save(WEEK, { step: "reflect" });
    const b = createMockRepositories({ fixtures: { reviews: [stored] } });
    expect((await b.review.get(WEEK))?.step).toBe("plan");
  });
});
