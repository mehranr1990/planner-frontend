import type { ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-social";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { Challenge, GoalEntry, RecordHistoryRow } from "../social-domain";
import { SocialError, type ChallengeRepo, type GoalRepo } from "../social-repositories";
import { all, call, pageQuery, refuse, tag, uuid, wallClock, type SocialCtx } from "./api-social-shared";

/*
 * Social Goals and Challenges (P6-05, ADR 0065). Voluntary: membership never
 * enrolls anyone; nobody reviews their own progress; only APPROVED entries
 * count; no rankings, no progress ordering, a badge means "completed" only.
 * Nothing is read from or written to Personal goals / habits.
 */

type D<P extends keyof paths, M extends "get" | "post" | "put" | "patch" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiGoal = D<"/api/v1/social-goals/{id}", "get">;
type ApiEntry = D<"/api/v1/social-goals/{id}/entries", "get">["items"][number];

export function createGoalModules(ctx: SocialCtx): { challenges: ChallengeRepo; goals: GoalRepo } {
  const { api, people, intents } = ctx;
  const goals = new Map<string, ApiGoal>();
  const entries = new Map<string, ApiEntry>();

  const load = async (id: string) => {
    const { data } = await call(() => api.request("get", "/api/v1/social-goals/{id}", { path: { id } }));
    goals.set(id, data);
    return data;
  };
  const goal = async (id: string) => goals.get(id) ?? (await load(id));

  const listEntries = async (goalId: string, participantId?: string) => {
    const rows = await call(() =>
      all((after) => api.request("get", "/api/v1/social-goals/{id}/entries", { path: { id: goalId }, query: { ...pageQuery(after), ...(participantId ? { participantId } : {}) } }).then((r) => r.data)),
    );
    for (const e of rows) entries.set(e.id, e);
    return rows;
  };

  async function toChallenge(g: ApiGoal): Promise<Challenge> {
    goals.set(g.id, g);
    const me = g.viewer.participant;
    const mine = me ? await listEntries(g.id, me.id).catch(() => [] as ApiEntry[]) : [];
    return {
      id: g.id,
      groupId: g.groupId ?? "",
      title: g.title,
      unit: g.unit,
      target: g.target,
      startDay: g.startsOn,
      endDay: g.endsOn,
      total: g.aggregate.approvedTotal,
      participants: g.aggregate.participantCount,
      joined: me?.state === "ACTIVE",
      myTotal: me?.approvedTotal ?? 0,
      individualTotals: null,
      myEntries: mine.filter((e) => e.kind === "SUBMISSION" && e.state !== "RETRACTED").map((e) => ({ id: e.id, day: e.occurredOn ?? "", amount: e.amount })),
      server: {
        kind: g.kind === "GOAL" ? "goal" : "challenge",
        activityId: g.activityId,
        state: g.state === "ACTIVE" ? "active" : g.state === "CLOSED" ? "closed" : "canceled",
        window: g.window === "UPCOMING" ? "upcoming" : g.window === "OPEN" ? "open" : "ended",
        reviewRequired: g.reviewRequired,
        organizer: g.viewer.organizer,
        independentReviewerAvailable: g.viewer.independentReviewerAvailable,
        percent: g.aggregate.percent,
        myPercent: me?.percent ?? null,
        myPending: me?.pendingTotal ?? null,
        completedCount: g.aggregate.completedCount,
        pendingReviewCount: g.aggregate.pendingReviewCount,
        badgeAt: me?.badge?.awardedAt ?? null,
      },
    };
  }

  const listFor = async (context: { groupId: string } | { activityId: string }) => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-goals", { query: { ...pageQuery(after), ...context } }).then((r) => r.data)));
    // Creation order, never by progress (no rankings).
    return Promise.all(rows.sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map(toChallenge));
  };

  const today = () => wallClock(new Date().toISOString(), getPlannerTimeZone()).day;

  const goalsRepo: GoalRepo = {
    listFor,
    async create(input) {
      const id = uuid();
      const { data } = await intents.run(`goal:${input.clientOpId}`, (key) =>
        call(() =>
          api.request("post", "/api/v1/social-goals", {
            header: { "Idempotency-Key": key },
            body: {
              id,
              kind: input.kind === "goal" ? "GOAL" : "CHALLENGE",
              ...("groupId" in input.context ? { groupId: input.context.groupId } : { activityId: input.context.activityId }),
              title: input.title.trim(),
              unit: input.unit.trim(),
              target: input.target,
              startsOn: input.startDay,
              endsOn: input.endDay,
              timezone: getPlannerTimeZone(),
              reviewRequired: input.reviewRequired,
            },
          }),
        ),
      );
      goals.set(data.id, data);
      return data.id;
    },
    async entries(goalId) {
      const g = await goal(goalId);
      const rows = await listEntries(goalId);
      return rows
        .filter((e) => e.state !== "RETRACTED")
        .map(
          (e): GoalEntry => ({
            id: e.id,
            person: people.person(e.participantUserId),
            kind: e.kind === "SUBMISSION" ? "submission" : "correction",
            amount: e.amount,
            day: e.occurredOn,
            note: e.note ?? "",
            state: e.state.toLowerCase() as GoalEntry["state"],
            mine: e.submittedByUserId === people.myId,
            canReview: g.viewer.organizer && e.state === "PENDING" && e.participantUserId !== people.myId,
            participantId: e.participantId,
          }),
        );
    },
    async review(goalId, entryId, action, note) {
      const e = entries.get(entryId) ?? (await listEntries(goalId)).find((x) => x.id === entryId);
      if (!e) throw new SocialError("not-found");
      await intents.run(`entry:${entryId}:${action}:${e.revision}`, (key) =>
        call(() =>
          api.request("post", "/api/v1/social-goals/{id}/entries/{entryId}/actions/{action}", {
            path: { id: goalId, entryId, action },
            header: { "If-Match": tag(e.revision), "Idempotency-Key": key },
            body: { note: note.trim() || null },
          }),
        ),
      );
      entries.delete(entryId);
      goals.delete(goalId);
    },
    async correct(goalId, participantId, delta, reason) {
      if (!reason.trim() || !Number.isInteger(delta) || delta === 0) throw new SocialError("invalid");
      const { data } = await call(() => api.request("get", "/api/v1/social-goals/{id}/participants", { path: { id: goalId }, query: { limit: 100 } }));
      const p = data.items.find((x) => x.id === participantId);
      if (!p) throw new SocialError("not-found");
      const id = uuid();
      await intents.run(`correction:${id}`, (key) =>
        call(() =>
          api.request("post", "/api/v1/social-goals/{id}/corrections", { path: { id: goalId }, header: { "If-Match": tag(p.revision), "Idempotency-Key": key }, body: { id, participantId, delta, reason: reason.trim() } }),
        ),
      );
      goals.delete(goalId);
    },
    async end(goalId, action) {
      const g = await load(goalId);
      await intents.run(`goal-end:${goalId}:${action}`, (key) =>
        call(() => api.request("post", "/api/v1/social-goals/{id}/actions/{action}", { path: { id: goalId, action }, header: { "If-Match": tag(g.revision), "Idempotency-Key": key }, body: {} })),
      );
      goals.delete(goalId);
    },
    async history(goalId) {
      const { data } = await call(() => api.request("get", "/api/v1/social-goals/{id}/history", { path: { id: goalId } }));
      return data.items.map((h): RecordHistoryRow => ({ id: h.id, action: h.action, by: people.person(h.actorUserId), at: h.occurredAt, note: h.amount !== null ? String(h.amount) : "" }));
    },
  };

  const challenges: ChallengeRepo = {
    list: (groupId) => listFor({ groupId }),
    async join(id) {
      await intents.run(`goal-join:${id}`, (key) => call(() => api.request("post", "/api/v1/social-goals/{id}/join", { path: { id }, header: { "Idempotency-Key": key }, body: {} })));
      goals.delete(id);
    },
    async leave(id) {
      const g = await load(id);
      const me = g.viewer.participant;
      if (!me) throw new SocialError("conflict", "NOT_PARTICIPATING", "NOT_PARTICIPATING");
      await intents.run(`goal-withdraw:${id}:${me.revision}`, (key) =>
        call(() => api.request("post", "/api/v1/social-goals/{id}/withdraw", { path: { id }, header: { "If-Match": tag(me.revision), "Idempotency-Key": key }, body: {} })),
      );
      goals.delete(id);
    },
    async log(id, amount, day) {
      if (!Number.isInteger(amount) || amount <= 0) throw new SocialError("invalid");
      const entryId = uuid();
      await intents.run(`goal-entry:${entryId}`, (key) =>
        call(() => api.request("post", "/api/v1/social-goals/{id}/entries", { path: { id }, header: { "Idempotency-Key": key }, body: { id: entryId, amount, occurredOn: day } })),
      );
      goals.delete(id);
    },
    create: (groupId, input) =>
      goalsRepo.create({ kind: "challenge", context: { groupId }, title: input.title, unit: input.unit, target: input.target, startDay: today(), endDay: input.endDay, reviewRequired: false, clientOpId: uuid() }),
    setIndividualTotals: refuse("no individual-totals switch in the contract: participants see peers' approved totals; nothing is ranked"),
  };

  return { challenges, goals: goalsRepo };
}
