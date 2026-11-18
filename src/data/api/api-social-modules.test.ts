import { describe, expect, it } from "vitest";
import { createApiSocial } from "./api-social-repository";
import { err, fakeApi, json } from "./test-support";

/*
 * Contract fakes for the Social activity, ledger, lending and goal modules:
 * exact paths, IANA instants, exact minor-unit strings, allowedActions,
 * review rules. Not live evidence.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222222";
const at = "2026-11-10T10:00:00.000Z";
const me = { participantId: "p-me", role: "ORGANIZER", state: "ACTIVE", rsvp: "GOING", seat: "HELD", guest: false, offerExpiresAt: null, reminderMinutes: null, generation: 1, revision: 2 };
const activity = {
  id: "a1",
  groupId: null,
  template: "TRAVEL",
  title: "Dizin trip",
  timezone: "Asia/Tehran",
  startsAt: "2999-11-20T05:30:00.000Z",
  endsAt: "2999-11-21T20:29:00.000Z",
  state: "PLANNED",
  capacity: 4,
  seatsTaken: 2,
  waitlistCount: 1,
  me,
  description: "Snow",
  location: "Dizin",
  conversationId: null,
  conversationManaged: false,
  successorParticipantId: null,
  orphanedAt: null,
  deletedAt: null,
  recoverUntil: null,
  manage: true,
  revision: 6,
  createdAt: at,
  updatedAt: at,
};
const participant = (id: string, userId: string, extra: object = {}) => ({ id, userId, displayName: userId === ANA ? "Ana" : "Mehran R.", role: "PARTICIPANT", state: "ACTIVE", rsvp: "GOING", seat: "HELD", guest: false, waitlistedAt: null, offerExpiresAt: null, revision: 3, ...extra });
const revision = (amount: string, extra: object = {}) => ({
  id: "rev1",
  number: 1,
  state: "APPROVED",
  title: "Fuel",
  note: null,
  currency: "IRR",
  scale: 2,
  amountMinor: amount,
  payerUserId: ME,
  method: "EQUAL",
  incurredOn: "2026-11-20",
  proposedByUserId: ME,
  decidedByUserId: ANA,
  decidedAt: at,
  decisionNote: null,
  createdAt: at,
  sharesRestricted: false,
  shares: [
    { position: 0, userId: ME, input: null, shareMinor: "50001" },
    { position: 1, userId: ANA, input: null, shareMinor: "50000" },
  ],
  ...extra,
});
const expense = { id: "e1", groupId: null, activityId: "a1", state: "PENDING", proposedByUserId: ANA, revision: 4, createdAt: at, updatedAt: at, canDecide: true, effective: null, pending: revision("100001", { state: "PENDING" }) };
const loan = (allowedActions: string[]) => ({
  id: "l1",
  assetId: "as1",
  assetTitle: "Tent",
  groupId: null,
  lenderUserId: ME,
  borrowerUserId: ANA,
  myRole: "LENDER",
  origin: "REQUEST",
  state: "REQUESTED",
  dueAt: null,
  overdue: false,
  custodyConfirmed: false,
  note: null,
  lenderHandoverAt: null,
  borrowerReceiptAt: null,
  handedOverAt: null,
  returnRequestedAt: null,
  returnedAt: null,
  closedAt: null,
  pendingOutcome: null,
  pendingOutcomeByUserId: null,
  proposedDueAt: null,
  dueProposedByUserId: null,
  dueProposedAt: null,
  stateBeforeDispute: null,
  disputedByUserId: null,
  disputeNote: null,
  orphaned: false,
  allowedActions,
  revision: 2,
  createdAt: at,
  updatedAt: at,
});
const goal = (viewer: object) => ({
  id: "go1",
  kind: "CHALLENGE",
  groupId: "g1",
  activityId: null,
  title: "10k steps",
  description: null,
  unit: "steps",
  target: 100,
  startsOn: "2026-11-01",
  endsOn: "2026-11-30",
  timezone: "Asia/Tehran",
  reviewRequired: true,
  state: "ACTIVE",
  window: "OPEN",
  createdByUserId: ME,
  completedAt: null,
  closedAt: null,
  aggregate: { participantCount: 2, completedCount: 0, approvedTotal: 40, percent: 40, pendingReviewCount: 1 },
  viewer,
  revision: 3,
  createdAt: at,
  updatedAt: at,
});

function setup() {
  const fake = fakeApi((call, parts) => {
    const path = parts.join("/");
    if (path === "social-groups" && call.method === "GET") return json({ items: [], nextCursor: null });
    if (path === "social-activities" && call.method === "GET") return json({ items: [activity], nextCursor: null });
    if (path === "social-activities" && call.method === "POST") return json({ ...activity, id: call.body.id }, 201);
    if (path === "social-activities/a1") return json(activity);
    if (path === "social-activities/a1/participants") return json({ items: [participant("p-me", ME, { role: "ORGANIZER" }), participant("p-ana", ANA, { seat: "WAITLISTED", waitlistedAt: at })], nextCursor: null });
    if (path === "social-activities/a1/items" && call.method === "GET")
      return json({
        items: [
          { id: "i1", activityId: "a1", kind: "CHECKLIST", title: "Chains", notes: null, location: null, startsAt: null, endsAt: null, localDate: null, dayIndex: null, position: 0, done: false, assigneeParticipantId: "p-ana", createdByParticipantId: "p-me", revision: 5, createdAt: at, updatedAt: at },
        ],
        nextCursor: null,
      });
    if (path === "social-activities/a1/items/i1/task") return json({ itemId: "i1", taskId: "t9", created: true }, 201);
    if (path === "social-activities/a1/items" && call.method === "POST") return json({}, 201);
    if (path === "social-activities/a1/polls") return json({ items: [{ id: "po1", activityId: "a1", kind: "SCHEDULE", question: "When?", multiple: false, state: "OPEN", chosenOptionId: null, revision: 2, createdAt: at, closedAt: null, options: [{ id: "o1", label: "Fri", startsAt: "2999-11-22T05:30:00.000Z", endsAt: null, votes: 2 }], myOptionIds: ["o1"] }], nextCursor: null });
    if (path === "social-activities/a1/polls/po1/close") return json({}, 201);
    if (path === "social-activities/a1/rsvp") return json({ ...activity, me: { ...me, seat: "WAITLISTED", rsvp: "PENDING" } }, 201);
    if (path === "social-activities/a1/lifecycle/cancel" || path === "social-activities/a1/restore") return json({ ...activity, revision: 7 }, 201);
    if (path === "social-activities/a1/conversation/open") return json(activity, 201);
    if (path === "retention-policies") return json({ items: [{ version: "conv-1", applicableContexts: ["CONVERSATION"] }] });
    if (path === "social-activities/a1/expenses" && call.method === "GET") return json({ items: [expense], nextCursor: null });
    if (path === "social-activities/a1/expenses" && call.method === "POST") return json({ ...expense, id: "e2" }, 201);
    if (path === "social-activities/a1/expenses/e1/decisions/approve") return json({ ...expense, state: "APPROVED", effective: revision("100001"), pending: null, revision: 5 }, 201);
    if (path === "social-activities/a1/balances") return err(403, "BALANCE_PERMISSION_REQUIRED");
    if (path === "social-activities/a1/balances/me") return json({ items: [{ userId: ME, displayName: null, currency: "IRR", paidMinor: "100001", shareMinor: "50001", settledOutMinor: "0", settledInMinor: "0", netMinor: "50000", owedMinor: "0", receivableMinor: "50000" }] });
    if (path === "social-activities/a1/expenses/e1/finance-posting/preview")
      return json({ expenseId: "e1", revisionId: "rev1", currency: "IRR", scale: 2, amountMinor: "50001", amount: "500.01", localDate: "2026-11-20", transactionType: "EXPENSE", accountId: "acc1", accountName: "Wallet", categoryId: null, alreadyPosted: null }, 201);
    if (path === "social-activities/a1/expenses/e1/finance-posting") return json({ expenseId: "e1", revisionId: "rev1", transactionId: "tx1", created: true }, 201);
    if (path === "social-loans" && call.method === "GET") return json({ items: [loan(["accept", "reject"])], nextCursor: null });
    if (path === "social-loans/l1") return json(loan(["accept", "reject"]));
    if (path === "social-loans/l1/actions/accept") return json(loan(["handover", "cancel"]), 201);
    if (path === "social-goals" && call.method === "GET")
      return json({ items: [goal({ organizer: true, independentReviewerAvailable: false, participant: { id: "gp1", goalId: "go1", userId: ME, state: "ACTIVE", joinedAt: at, withdrawnAt: null, approvedTotal: 20, pendingTotal: 5, percent: 20, completed: false, badge: null, revision: 4 } })], nextCursor: null });
    if (path === "social-goals/go1") return json(goal({ organizer: true, independentReviewerAvailable: false, participant: null }));
    if (path === "social-goals/go1/entries" && call.method === "GET")
      return json({
        items: [
          { id: "en1", goalId: "go1", participantId: "gp1", participantUserId: ME, kind: "SUBMISSION", amount: 5, occurredOn: "2026-11-05", note: null, state: "PENDING", submittedByUserId: ME, submittedAt: at, reviewedByUserId: null, reviewedAt: null, reviewNote: null, correctsEntryId: null, revision: 1 },
          { id: "en2", goalId: "go1", participantId: "gp2", participantUserId: ANA, kind: "SUBMISSION", amount: 7, occurredOn: "2026-11-06", note: null, state: "PENDING", submittedByUserId: ANA, submittedAt: at, reviewedByUserId: null, reviewedAt: null, reviewNote: null, correctsEntryId: null, revision: 1 },
        ],
        nextCursor: null,
      });
    if (path === "social-goals/go1/entries/en2/actions/approve") return json({}, 201);
    return err(404);
  });
  return { ...fake, repo: createApiSocial(fake.client, { id: ME, name: "Mehran R." }) };
}

describe("api-social modules — activities", () => {
  it("maps instants to the activity's wall clock, templates, waitlist order and server state", async () => {
    const { repo } = setup();
    const a = await repo.activities.get("a1");
    expect(a).toMatchObject({ template: "trip", startDay: "2999-11-20", startTime: "09:00", place: "Dizin", goingCount: 2, waitlistCount: 1, myRsvp: "going", organisedByMe: true, pollId: "po1", hasOpenPoll: true, files: [] });
    expect(a.waitlist.map((w) => w.person.name)).toEqual(["Ana"]);
    expect(a.checklist[0]).toMatchObject({ title: "Chains", assignee: { name: "Ana" } });
    expect(a.server).toMatchObject({ state: "planned", timezone: "Asia/Tehran", manage: true, myParticipantId: "p-me" });
  });

  it("create sends IANA timezone + Gregorian instants; weekly recurrence is refused", async () => {
    const { repo, calls } = setup();
    const input = { title: "Hike", template: "sport" as const, groupId: null, startDay: "2026-12-01", endDay: "2026-12-01", startTime: "08:00", place: "", capacity: null, recurringWeekly: false, currency: "irr" as const, guestIds: [], withPoll: false, clientOpId: "op" };
    await repo.activities.create(input);
    const post = calls.find((c) => c.method === "POST" && c.path === "/social-activities")!;
    expect(post.body).toMatchObject({ template: "SPORT", title: "Hike", timezone: expect.any(String), startsAt: expect.stringMatching(/Z$/), endsAt: expect.stringMatching(/Z$/), location: null });
    expect(post.key).toEqual(expect.any(String));
    await expect(repo.activities.create({ ...input, recurringWeekly: true, clientOpId: "op2" })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("RSVP GOING when full answers waitlisted; cancel / restore send the activity revision", async () => {
    const { repo, calls } = setup();
    expect(await repo.activities.rsvp("a1", "going")).toEqual({ waitlisted: true });
    await repo.activities.cancel("a1", "weather");
    expect(calls.at(-1)).toMatchObject({ path: "/social-activities/a1/lifecycle/cancel", ifMatch: '"6"', body: {} });
    await repo.activityAdmin.restore("a1");
    expect(calls.at(-1)).toMatchObject({ path: "/social-activities/a1/restore", ifMatch: '"7"' });
  });

  it("checklist → Personal task is created by the server, once; linkTask is refused", async () => {
    const { repo, calls } = setup();
    expect(await repo.checklist.makeTask!("a1", "i1")).toEqual({ taskId: "t9", created: true });
    expect(calls.at(-1)).toMatchObject({ path: "/social-activities/a1/items/i1/task", key: expect.any(String) });
    await expect(repo.checklist.linkTask("a1", "i1", "t1")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("polls: counts only; pick final closes a SCHEDULE poll with chosenOptionId; “if needed” is refused", async () => {
    const { repo, calls } = setup();
    await repo.activities.get("a1");
    expect(await repo.polls.get("po1")).toMatchObject({ kind: "date", anonymous: true, myVotes: { o1: "yes" }, canClose: true, options: [{ yes: 2, voters: [], day: "2999-11-22" }] });
    await repo.polls.pickFinal("po1", "o1");
    expect(calls.at(-1)).toMatchObject({ path: "/social-activities/a1/polls/po1/close", ifMatch: '"2"', body: { chosenOptionId: "o1" } });
    await expect(repo.polls.vote("po1", { o1: "if-needed" })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("opening the activity conversation takes the CONVERSATION catalog policy", async () => {
    const { repo, calls } = setup();
    await repo.activityAdmin.openConversation("a1");
    expect(calls.at(-1)).toMatchObject({ path: "/social-activities/a1/conversation/open", ifMatch: '"6"', body: { retentionPolicyVersion: "conv-1", id: expect.any(String) } });
  });
});

describe("api-social modules — ledger", () => {
  it("exact minor units end to end; proposals in IRR with ordered shares", async () => {
    const { repo, calls } = setup();
    const [e] = await repo.expenses.list({ kind: "activity", id: "a1" });
    expect(e).toMatchObject({ status: "proposed", current: { amount: 100001, payerId: "me" }, myShare: 50001, canApprove: true });
    expect(e!.current.shares).toEqual([
      { personId: "me", amount: 50001, extra: 1 },
      { personId: ANA, amount: 50000, extra: 0 },
    ]);
    await repo.expenses.propose({ scope: { kind: "activity", id: "a1" }, activityId: "a1", title: "Food", amount: 300000, payerId: "me", day: "2026-11-20", split: { method: "percent", participants: ["me", ANA], values: { me: 2500, [ANA]: 7500 } }, receipt: null, clientOpId: "op" });
    expect(calls.at(-1)!.body).toMatchObject({ currency: "IRR", amountMinor: "300000", method: "PERCENT", payerUserId: ME, shares: [{ userId: ME, value: "2500" }, { userId: ANA, value: "7500" }] });
    await repo.expenses.approve("e1");
    expect(calls.at(-1)).toMatchObject({ path: "/social-activities/a1/expenses/e1/decisions/approve", ifMatch: '"4"', key: expect.any(String) });
  });

  it("balances: own row when the whole scope is not permitted (403 → balances/me)", async () => {
    const { repo } = setup();
    const b = await repo.balances.forScope({ kind: "activity", id: "a1" });
    expect(b).toMatchObject({ currency: "irr", everyone: null, transfers: [], mine: { paid: 100001, share: 50001, net: 50000, settled: 0 } });
  });

  it("finance posting: preview first, then explicit confirm with the previewed revision; never automatic", async () => {
    const { repo, calls } = setup();
    await repo.expenses.list({ kind: "activity", id: "a1" });
    const preview = await repo.finance.preview("e1", "acc1");
    expect(preview).toMatchObject({ amount: "500.01", revisionId: "rev1", alreadyPosted: false });
    expect(calls.at(-1)!.key).toBeNull();
    expect(await repo.finance.post("e1", "acc1", preview.revisionId)).toEqual({ created: true });
    expect(calls.at(-1)).toMatchObject({ body: { accountId: "acc1", revisionId: "rev1", confirm: true }, key: expect.any(String) });
    await expect(repo.expenses.claimFinancePosting("k")).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("api-social modules — lending & goals", () => {
  it("loans render exactly the server's allowedActions; a disallowed action is not sent", async () => {
    const { repo, calls } = setup();
    const [l] = await repo.lending.loans(null);
    expect(l).toMatchObject({ status: "requested", iAmLender: true, allowedActions: ["accept", "reject"], thing: { name: "Tent" } });
    await repo.lending.accept("l1", true);
    expect(calls.at(-1)).toMatchObject({ path: "/social-loans/l1/actions/accept", ifMatch: '"2"', key: expect.any(String) });
    const before = calls.length;
    await expect(repo.lendingServer.act("l1", "return", "")).rejects.toMatchObject({ code: "forbidden" });
    expect(calls.length).toBe(before);
  });

  it("goals: no ranking, pending excluded, organisers cannot review their own entry", async () => {
    const { repo, calls } = setup();
    const [c] = await repo.challenges.list("g1");
    expect(c).toMatchObject({ myTotal: 20, total: 40, individualTotals: null, server: { reviewRequired: true, independentReviewerAvailable: false, myPending: 5, organizer: true } });
    const entries = await repo.goals.entries("go1");
    expect(entries.map((e) => [e.id, e.canReview])).toEqual([
      ["en1", false],
      ["en2", true],
    ]);
    await repo.goals.review("go1", "en2", "approve", "");
    expect(calls.at(-1)).toMatchObject({ path: "/social-goals/go1/entries/en2/actions/approve", ifMatch: '"1"' });
    await expect(repo.challenges.setIndividualTotals("go1", true)).rejects.toMatchObject({ code: "unsupported" });
  });
});
