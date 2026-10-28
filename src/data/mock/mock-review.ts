import type { WeeklyReview } from "../domain";
import { RepositoryError, type ReviewRepository, type WeeklyReviewPatch } from "../repositories";

/*
 * Weekly review (P16) progress for the mock adapter: one record per week,
 * field-level upserts so "Save & exit" and Finish never drop each other's
 * fields. Reads return clones.
 */

export const MAX_REVIEW_WINS = 5;
export const MAX_REVIEW_PRIORITIES = 3;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface MockReviewOptions {
  reviews: readonly WeeklyReview[];
  now: string;
  respond<T>(value: T): Promise<T>;
}

function blank(week: string, now: string): WeeklyReview {
  return { week, step: "wins", wins: [], priorities: [], routes: {}, wentWell: "", slipped: "", change: "", completedAt: null, updatedAt: now };
}

export function createMockReview({ reviews, now, respond }: MockReviewOptions): ReviewRepository {
  const store = new Map<string, WeeklyReview>(reviews.map((review) => [review.week, structuredClone(review)]));
  return {
    get(week) {
      const review = store.get(week);
      return respond(review ? structuredClone(review) : null);
    },
    async save(week, patch: WeeklyReviewPatch) {
      if (!DAY.test(week)) throw new RepositoryError("invalid", `Bad week "${week}"`);
      if ((patch.wins?.length ?? 0) > MAX_REVIEW_WINS) throw new RepositoryError("invalid", "At most 5 wins");
      if ((patch.priorities?.length ?? 0) > MAX_REVIEW_PRIORITIES) throw new RepositoryError("invalid", "At most 3 priorities");
      const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
      const next: WeeklyReview = { ...(store.get(week) ?? blank(week, now)), ...structuredClone(defined), week, updatedAt: now };
      store.set(week, next);
      return respond(structuredClone(next));
    },
  };
}
