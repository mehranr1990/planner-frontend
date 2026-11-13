import type { ApiClient, ResponseData } from "@/api/client";
import { addDaysToDay, parseDay } from "@/lib/dates/clock-time";
import type { WeeklyReview } from "../domain";
import type { ReviewRepository, WeeklyReviewPatch } from "../repositories";
import { invalid, isConflict, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Weekly review (P16) over /planning/reviews, kind WEEKLY (closes D4):
 * - The API keeps one private plain-text `reflection` per week start. The three
 *   reflection answers are stored as "## Went well / ## Slipped / ## Change"
 *   sections; the draft's structure (step, wins, priorities, carry-over routes,
 *   finished-at) follows as one JSON line under "## Planner data". A user line
 *   that looks like one of those headings is escaped with a backslash.
 * - A review written elsewhere (no data line) reads as "went well" text.
 * - The week must start on the account's saved week start (the API rejects
 *   other dates); carry-over itself is written to Tasks by the UI on Finish, so
 *   /planning/rollover is not called.
 */

type ApiReview = ResponseData<"/api/v1/planning/reviews/{id}", "get">;
type Fields = Omit<WeeklyReview, "week" | "updatedAt">;

const MAX_WINS = 5;
const MAX_PRIORITIES = 3;
const MAX_REFLECTION = 10_000;
const TEXTS = [["wentWell", "## Went well"], ["slipped", "## Slipped"], ["change", "## Change"]] as const;
const DATA = "## Planner data";
const escapeLines = (text: string) => text.replace(/^(\\*## (?:Went well|Slipped|Change|Planner data))$/gm, "\\$1");
const unescapeLines = (text: string) => text.replace(/^\\(\\*## (?:Went well|Slipped|Change|Planner data))$/gm, "$1");

const blank = (): Fields => ({ step: "wins", wins: [], priorities: [], routes: {}, wentWell: "", slipped: "", change: "", completedAt: null });

export function encodeReview(review: Fields): string {
  const { wentWell, slipped, change, ...data } = review;
  const texts = { wentWell, slipped, change };
  const sections = TEXTS.filter(([key]) => texts[key].trim()).map(([key, heading]) => `${heading}\n${escapeLines(texts[key])}`);
  return [...sections, `${DATA}\n${JSON.stringify(data)}`].join("\n\n");
}

export function decodeReview(reflection: string): Fields {
  const lines = reflection.split("\n");
  const at = lines.lastIndexOf(DATA);
  let data: Partial<Fields> | null = null;
  if (at !== -1) {
    try {
      data = JSON.parse(lines[at + 1] ?? "") as Partial<Fields>;
    } catch {
      data = null;
    }
  }
  if (!data || typeof data !== "object") return { ...blank(), wentWell: reflection };
  const out: Fields = { ...blank(), ...data };
  // Without the blank line that separates the text sections from the data line.
  const body = lines.slice(0, Math.max(at - 1, 0));
  const starts = body.flatMap((line, index) => (TEXTS.some(([, heading]) => heading === line) ? [index] : []));
  starts.forEach((start, i) => {
    const key = TEXTS.find(([, heading]) => heading === body[start])![0];
    const next = starts[i + 1];
    out[key] = unescapeLines(body.slice(start + 1, next === undefined ? body.length : next - 1).join("\n"));
  });
  return out;
}

export function createApiReviewRepository(client: ApiClient): ReviewRepository {
  const known = new Map<string, ApiReview>();

  const toReview = (dto: ApiReview): WeeklyReview => ({ ...decodeReview(dto.reflection), week: dto.localDate, updatedAt: dto.updatedAt });

  async function load(week: string): Promise<ApiReview | null> {
    // The contract does not say whether `to` is inclusive: ask one day more and match the date.
    const items = await pageAll(async (cursor) => (await client.request("get", "/api/v1/planning/reviews", { query: { limit: "100", cursor, kind: "WEEKLY", from: week, to: addDaysToDay(week, 1) } })).data);
    const dto = items.find((item) => item.kind === "WEEKLY" && item.localDate === week) ?? null;
    if (dto) known.set(week, dto);
    else known.delete(week);
    return dto;
  }

  return {
    get: (week) =>
      mapErrors(async () => {
        if (parseDay(week) === null) invalid(`Bad week "${week}"`);
        const dto = await load(week);
        return dto ? toReview(dto) : null;
      }),

    save: (week, patch: WeeklyReviewPatch) =>
      mapErrors(async () => {
        if (parseDay(week) === null) invalid(`Bad week "${week}"`);
        if ((patch.wins?.length ?? 0) > MAX_WINS) invalid("At most 5 wins");
        if ((patch.priorities?.length ?? 0) > MAX_PRIORITIES) invalid("At most 3 priorities");
        const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as WeeklyReviewPatch;
        const reflectionOver = (dto: ApiReview | null) => {
          const reflection = encodeReview({ ...(dto ? decodeReview(dto.reflection) : blank()), ...defined });
          if (reflection.length > MAX_REFLECTION) invalid("The review is too long");
          return reflection;
        };
        const patchStored = () =>
          retryOnConflict(
            async () => {
              const dto = known.get(week)!;
              return (await client.request("patch", "/api/v1/planning/reviews/{id}", { path: { id: dto.id }, header: { "If-Match": revisionTag(dto.revision) }, body: { reflection: reflectionOver(dto) } })).data;
            },
            () => load(week),
          );

        if (!known.has(week)) await load(week);
        let saved: ApiReview;
        if (known.has(week)) saved = await patchStored();
        else {
          try {
            saved = (await client.request("post", "/api/v1/planning/reviews", { body: { kind: "WEEKLY", localDate: week, reflection: reflectionOver(null) } })).data;
          } catch (error) {
            // Started elsewhere in the meantime (one review per week): save over that one.
            if (!isConflict(error) || !(await load(week))) throw error;
            saved = await patchStored();
          }
        }
        known.set(week, saved);
        return toReview(saved);
      }),
  };
}
