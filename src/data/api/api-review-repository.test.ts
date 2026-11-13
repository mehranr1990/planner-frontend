import { describe, expect, it } from "vitest";
import { createApiReviewRepository, decodeReview, encodeReview } from "./api-review-repository";
import { err, fakeApi, json } from "./test-support";

/* Weekly review adapter against an in-memory fake of /planning/reviews (no network). */

const WEEK = "2026-11-07";

interface FakeReview { id: string; revision: number; kind: string; localDate: string; reflection: string; updatedAt: string }

function setup() {
  const reviews: FakeReview[] = [];
  const state = { stale: false, raceOnCreate: false };
  let seq = 0;
  const seed = (localDate: string, reflection: string, kind = "WEEKLY") => {
    reviews.push({ id: `r${++seq}`, revision: 1, kind, localDate, reflection, updatedAt: `2026-11-12T10:00:0${seq}.000Z` });
    return reviews.at(-1)!;
  };
  const api = fakeApi((call, parts) => {
    const id = parts[2];
    if (call.method === "GET") return json({ items: reviews.filter((item) => item.kind === call.query.kind && item.localDate >= call.query.from! && item.localDate <= call.query.to!), nextCursor: null });
    if (call.method === "POST") {
      if (state.raceOnCreate) {
        state.raceOnCreate = false;
        seed(String(call.body.localDate), "from elsewhere");
        return err(409);
      }
      if (String(call.body.localDate) !== WEEK) return err(400);
      return json(seed(String(call.body.localDate), String(call.body.reflection)), 201);
    }
    const review = reviews.find((item) => item.id === id)!;
    if (state.stale) {
      state.stale = false;
      review.revision += 1;
      review.reflection = encodeReview({ ...decodeReview(review.reflection), slipped: "elsewhere" });
      return err(409);
    }
    if (call.ifMatch !== `"${review.revision}"`) return err(409);
    review.revision += 1;
    review.reflection = String(call.body.reflection);
    return json(review);
  });
  return { ...api, reviews, seed, state, review: createApiReviewRepository(api.client) };
}

describe("review reflection", () => {
  it("round-trips the whole draft through one plain text", () => {
    const draft = {
      step: "plan" as const,
      wins: [{ id: "w1", title: "Shipped", source: "task" as const }],
      priorities: [{ id: "p1", title: "Rest", taskId: "t1" }],
      routes: { t2: { to: "pick", day: "2026-11-15" } },
      wentWell: "A\n## Slipped\n\\## Change\n",
      slipped: "",
      change: "Less\n\nmore",
      completedAt: "2026-11-12T10:00:00.000Z",
    };
    expect(decodeReview(encodeReview(draft))).toEqual(draft);
    expect(decodeReview("plain words")).toMatchObject({ wentWell: "plain words", step: "wins", wins: [], completedAt: null });
  });
});

describe("review adapter", () => {
  it("returns null before the review of the week exists, without writing", async () => {
    const t = setup();
    t.seed(WEEK, "evening", "EVENING");
    expect(await t.review.get(WEEK)).toBeNull();
    expect(t.calls[0].query).toMatchObject({ kind: "WEEKLY", from: WEEK, to: "2026-11-08" });
    expect(t.writes()).toEqual([]);
  });

  it("creates the review, then saves field by field over the stored one", async () => {
    const t = setup();
    const first = await t.review.save(WEEK, { step: "carry", wins: [{ id: "w1", title: "Shipped", source: "own" }] });
    expect(first).toMatchObject({ week: WEEK, step: "carry", wins: [{ id: "w1" }], wentWell: "", completedAt: null });
    expect(t.calls.find((call) => call.method === "POST")!.body).toMatchObject({ kind: "WEEKLY", localDate: WEEK });

    const next = await t.review.save(WEEK, { wentWell: "calm week", step: undefined });
    expect(next).toMatchObject({ step: "carry", wins: [{ id: "w1" }], wentWell: "calm week" });
    expect(t.writes()).toEqual(["POST /planning/reviews", "PATCH /planning/reviews/r1"]);
    expect(t.calls.at(-1)!.ifMatch).toBe('"1"');
    expect(await t.review.get(WEEK)).toEqual(next);
  });

  it("re-applies the patch on fresh data after a 409 and after a create race", async () => {
    const t = setup();
    await t.review.save(WEEK, { wentWell: "mine" });
    t.state.stale = true;
    expect(await t.review.save(WEEK, { change: "plan less" })).toMatchObject({ wentWell: "mine", slipped: "elsewhere", change: "plan less" });

    const other = setup();
    other.state.raceOnCreate = true;
    expect(await other.review.save(WEEK, { slipped: "sleep" })).toMatchObject({ wentWell: "from elsewhere", slipped: "sleep" });
    expect(other.writes()).toEqual(["POST /planning/reviews", "PATCH /planning/reviews/r1"]);
  });

  it("rejects bad input before any request and maps API refusals", async () => {
    const t = setup();
    await expect(t.review.save("nope", {})).rejects.toMatchObject({ code: "invalid" });
    await expect(t.review.save(WEEK, { priorities: [1, 2, 3, 4].map((n) => ({ id: `p${n}`, title: "x" })) })).rejects.toMatchObject({ code: "invalid" });
    expect(t.calls.length).toBe(0);
    await expect(t.review.save(WEEK, { wentWell: "x".repeat(10_001) })).rejects.toMatchObject({ code: "invalid" });
    expect(t.writes()).toEqual([]);
    // Not the account's week start → the API's 400.
    await expect(t.review.save("2026-11-09", { wentWell: "x" })).rejects.toMatchObject({ code: "invalid" });
  });
});
