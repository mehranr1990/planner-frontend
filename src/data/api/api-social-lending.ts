import type { ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-social";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { ClaimAction, EvidenceNote, Loan, LoanAction, LostFoundClaim, LostFoundPost, RecordHistoryRow, Thing } from "../social-domain";
import { SocialError, type LendingRepo, type LendingServerRepo, type LostFoundRepo } from "../social-repositories";
import { all, call, pageQuery, tag, uuid, wallClock, zonedInstant, type SocialCtx } from "./api-social-shared";

/*
 * Social lending and Lost & Found (P6-04, ADR 0064 A–D). The server decides
 * every transition: loans and claims carry `allowedActions`, and the screens
 * offer exactly those. Ownership and custody are the server's (a lender's
 * "already with borrower" is a statement, not custody). Evidence is text
 * only; categories / condition of the mock "thing" are not in the contract.
 */

type D<P extends keyof paths, M extends "get" | "post" | "put" | "patch" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiAsset = D<"/api/v1/social-assets/{id}", "get">;
type ApiLoan = D<"/api/v1/social-loans/{id}", "get">;
type ApiPost = D<"/api/v1/social-lost-found/{id}", "get">;
type ApiClaim = D<"/api/v1/social-lost-found/{id}/claims/{claimId}", "get">;
type ApiEvidence = D<"/api/v1/social-loans/{id}/evidence", "get">["items"][number];
type ApiHistory = D<"/api/v1/social-loans/{id}/history", "get">["items"][number];

const STEP_ORDER: LoanAction[] = ["handover", "receive", "return", "confirm-return"];

export function createLendingModules(ctx: SocialCtx): { lending: LendingRepo; lostFound: LostFoundRepo; lendingServer: LendingServerRepo } {
  const { api, people, intents } = ctx;
  const assets = new Map<string, ApiAsset>();
  const loans = new Map<string, ApiLoan>();
  const posts = new Map<string, ApiPost>();
  const claims = new Map<string, ApiClaim>();

  const dueInstant = (day: string) => zonedInstant(day, "23:59", getPlannerTimeZone());
  const dayOf = (instant: string | null) => (instant ? wallClock(instant, getPlannerTimeZone()).day : "");

  async function thing(a: ApiAsset): Promise<Thing> {
    assets.set(a.id, a);
    const group = a.groupId ? { id: a.groupId, name: await ctx.groupName(a.groupId) } : null;
    const owner = people.person(a.ownerUserId);
    return { id: a.id, name: a.title, category: "other", condition: "", notes: a.description ?? "", owner, group: null, keeper: owner, sharedWith: a.audience === "GROUP" && group ? [group] : [], activeLoanId: a.available ? null : "", mine: a.isOwner };
  }
  const listAssets = async (query: { view: "MINE" | "CONNECTIONS" | "GROUP"; groupId?: string }) =>
    Promise.all((await call(() => all((after) => api.request("get", "/api/v1/social-assets", { query: { ...pageQuery(after), ...query } }).then((r) => r.data)))).map(thing));
  const asset = async (id: string) => assets.get(id) ?? (await call(() => api.request("get", "/api/v1/social-assets/{id}", { path: { id } }))).data;

  async function loan(l: ApiLoan): Promise<Loan> {
    loans.set(l.id, l);
    const out = ["HANDED_OVER", "RETURN_REQUESTED", "DISPUTED", "LOST", "DAMAGED"].includes(l.state);
    const status: Loan["status"] = l.state === "REQUESTED" || l.state === "OFFERED" ? "requested" : l.state === "ACCEPTED" ? "accepted" : l.state === "RETURNED" ? "returned" : out ? "out" : "declined";
    const issues: Loan["issues"] = [];
    if (l.state === "DISPUTED") issues.push({ id: `${l.id}:dispute`, kind: "disputed", note: l.disputeNote ?? "", by: people.person(l.disputedByUserId), at: l.updatedAt, resolvedByLender: false, resolvedByBorrower: false });
    if (l.pendingOutcome) issues.push({ id: `${l.id}:outcome`, kind: l.pendingOutcome === "LOST" ? "lost" : "damaged", note: "", by: people.person(l.pendingOutcomeByUserId), at: l.updatedAt, resolvedByLender: false, resolvedByBorrower: false });
    return {
      id: l.id,
      thing: { id: l.assetId, name: l.assetTitle, category: "other" },
      group: l.groupId ? { id: l.groupId, name: await ctx.groupName(l.groupId) } : null,
      lender: people.person(l.lenderUserId),
      borrower: people.person(l.borrowerUserId),
      from: dayOf(l.createdAt),
      due: dayOf(l.dueAt),
      place: l.note ?? "",
      status,
      handover: { recordedAt: l.lenderHandoverAt, confirmedAt: l.borrowerReceiptAt },
      return: { recordedAt: l.returnRequestedAt, confirmedAt: l.returnedAt },
      issues,
      overdue: l.overdue,
      myStep: null,
      iAmLender: l.myRole === "LENDER",
      allowedActions: [...l.allowedActions],
      serverState: l.state,
      proposedDue: l.proposedDueAt ? dayOf(l.proposedDueAt) : null,
      moderator: l.myRole === "MODERATOR",
    };
  }
  const listLoans = async (query: { role?: "ANY"; groupId?: string }) =>
    Promise.all((await call(() => all((after) => api.request("get", "/api/v1/social-loans", { query: { ...pageQuery(after), ...query } }).then((r) => r.data)))).map(loan));
  const loanRecord = async (id: string) => loans.get(id) ?? (await call(() => api.request("get", "/api/v1/social-loans/{id}", { path: { id } }))).data;

  const createLoan = async (body: { assetId: string; mode: "REQUEST" | "OFFER"; borrowerUserId?: string; dueAt: string | null; note: string | null }) => {
    const id = uuid();
    const { data } = await intents.run(`loan:${id}`, (key) => call(() => api.request("post", "/api/v1/social-loans", { header: { "Idempotency-Key": key }, body: { id, ...body } })));
    loans.set(data.id, data);
    return data.id;
  };
  const act = async (loanId: string, action: LoanAction, note: string) => {
    const l = await loanRecord(loanId);
    if (!l.allowedActions.includes(action)) throw new SocialError("forbidden", "action not allowed for this loan now");
    const { data } = await intents.run(`loan-action:${loanId}:${action}:${l.revision}`, (key) =>
      call(() => api.request("post", "/api/v1/social-loans/{id}/actions/{action}", { path: { id: loanId, action }, header: { "If-Match": tag(l.revision), "Idempotency-Key": key }, body: { note: note.trim() || null } })),
    );
    loans.set(loanId, data);
  };

  const patchAsset = async (id: string, body: { audience: "PRIVATE" | "CONNECTIONS" | "GROUP"; groupId: string | null }) => {
    const a = await asset(id);
    const { data } = await intents.run(`asset:${id}:${a.revision}:${body.audience}:${body.groupId}`, (key) =>
      call(() => api.request("patch", "/api/v1/social-assets/{id}", { path: { id }, header: { "If-Match": tag(a.revision), "Idempotency-Key": key }, body })),
    );
    assets.set(id, data);
  };

  const lending: LendingRepo = {
    groupThings: (groupId) => listAssets({ view: "GROUP", groupId }),
    mine: () => listAssets({ view: "MINE" }),
    async loans(groupId) {
      if (!groupId) return listLoans({ role: "ANY" });
      try {
        // Group Owner/Admin: read-only moderation view (404 for everyone else).
        return await listLoans({ groupId });
      } catch (error) {
        if (!(error instanceof SocialError) || (error.code !== "not-found" && error.code !== "forbidden")) throw error;
        return (await listLoans({ role: "ANY" })).filter((l) => l.group?.id === groupId);
      }
    },
    async addThing(input) {
      const id = uuid();
      const description = [input.notes.trim(), input.condition.trim()].filter(Boolean).join(" · ") || null;
      const { data } = await intents.run(`asset-create:${id}`, (key) =>
        call(() =>
          api.request("post", "/api/v1/social-assets", {
            header: { "Idempotency-Key": key },
            body: { id, audience: input.groupId ? "GROUP" : "PRIVATE", groupId: input.groupId, title: input.name.trim(), description },
          }),
        ),
      );
      assets.set(data.id, data);
      return data.id;
    },
    async share(thingId, groupId, shared) {
      // One audience per asset: a Group, connections, or private.
      await patchAsset(thingId, shared ? { audience: "GROUP", groupId } : { audience: "PRIVATE", groupId: null });
    },
    request: (thingId, _from, due, place) => createLoan({ assetId: thingId, mode: "REQUEST", dueAt: due ? dueInstant(due) : null, note: place.trim() || null }),
    lendTo: (thingId, personId, due, place) => createLoan({ assetId: thingId, mode: "OFFER", borrowerUserId: people.apiId(personId), dueAt: due ? dueInstant(due) : null, note: place.trim() || null }),
    accept: (loanId, ok) => act(loanId, ok ? "accept" : "reject", ""),
    async step(loanId) {
      const l = await loanRecord(loanId);
      const next = STEP_ORDER.find((a) => l.allowedActions.includes(a));
      if (!next) throw new SocialError("forbidden", "no handover or return step is open for you");
      await act(loanId, next, "");
    },
    reportIssue: (loanId, kind, note) => act(loanId, kind === "lost" ? "report-lost" : kind === "damaged" ? "report-damaged" : "dispute", note),
    async resolveIssue(loanId) {
      const l = await loanRecord(loanId);
      const next = (["accept-outcome", "resume"] as LoanAction[]).find((a) => l.allowedActions.includes(a));
      if (!next) throw new SocialError("forbidden");
      await act(loanId, next, "");
    },
  };

  async function post(p: ApiPost): Promise<LostFoundPost> {
    posts.set(p.id, p);
    return {
      id: p.id,
      group: p.groupId ? { id: p.groupId, name: await ctx.groupName(p.groupId) } : null,
      kind: p.kind === "LOST" ? "missing" : "found",
      title: p.title ?? "",
      note: p.description ?? "",
      by: people.person(p.reporterUserId),
      at: p.createdAt,
      claim: p.myClaimId ? { by: people.person(people.myId), at: p.updatedAt } : null,
      confirmedByPoster: false,
      confirmedByClaimer: false,
      resolved: p.state === "RESOLVED",
      mine: p.isReporter,
      contested: p.contested ?? false,
      openClaims: p.openClaimCount,
      myClaimId: p.myClaimId,
      serverState: p.state === "OPEN" ? "open" : p.state === "RESOLVED" ? "resolved" : p.state === "WITHDRAWN" ? "withdrawn" : "hidden",
    };
  }
  const listPosts = async (query: { view: "MINE" | "CONNECTIONS" | "GROUP" | "CLAIMED"; groupId?: string }) =>
    call(() => all((after) => api.request("get", "/api/v1/social-lost-found", { query: { ...pageQuery(after), ...query } }).then((r) => r.data)));
  const createPost = async (body: { kind: "LOST" | "FOUND"; audience: "CONNECTIONS" | "GROUP"; groupId: string | null; title: string; description: string | null }) => {
    const id = uuid();
    await intents.run(`post:${id}`, (key) => call(() => api.request("post", "/api/v1/social-lost-found", { header: { "Idempotency-Key": key }, body: { id, ...body } })));
  };
  const postRecord = async (id: string) => posts.get(id) ?? (await call(() => api.request("get", "/api/v1/social-lost-found/{id}", { path: { id } }))).data;
  const loadClaims = async (postId: string) => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-lost-found/{id}/claims", { path: { id: postId }, query: pageQuery(after) }).then((r) => r.data)));
    for (const c of rows) claims.set(c.id, c);
    return rows;
  };
  const claimAct = async (postId: string, claimId: string, action: ClaimAction, note: string) => {
    const c = claims.get(claimId) ?? (await loadClaims(postId)).find((x) => x.id === claimId);
    if (!c) throw new SocialError("not-found");
    if (!c.allowedActions.includes(action)) throw new SocialError("forbidden", "action not allowed for this claim now");
    const { data } = await intents.run(`claim-action:${claimId}:${action}:${c.revision}`, (key) =>
      call(() =>
        api.request("post", "/api/v1/social-lost-found/{id}/claims/{claimId}/actions/{action}", {
          path: { id: postId, claimId, action },
          header: { "If-Match": tag(c.revision), "Idempotency-Key": key },
          body: { note: note.trim() || null },
        }),
      ),
    );
    claims.set(claimId, data);
  };

  const lostFound: LostFoundRepo = {
    async list(groupId) {
      if (groupId) return Promise.all((await listPosts({ view: "GROUP", groupId })).map(post));
      const [mine, connections] = await Promise.all([listPosts({ view: "MINE" }), listPosts({ view: "CONNECTIONS" })]);
      const byId = new Map([...connections, ...mine].map((p) => [p.id, p]));
      return Promise.all([...byId.values()].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map(post));
    },
    post: (groupId, kind, title, note) => createPost({ kind: kind === "missing" ? "LOST" : "FOUND", audience: "GROUP", groupId, title: title.trim(), description: note.trim() || null }),
    async claim(postId, note) {
      const text = note?.trim() ?? "";
      if (!text) throw new SocialError("invalid", "a claim needs a short note", "CLAIM_NOTE_REQUIRED");
      const id = uuid();
      await intents.run(`claim:${postId}:${id}`, (key) => call(() => api.request("post", "/api/v1/social-lost-found/{id}/claims", { path: { id: postId }, header: { "Idempotency-Key": key }, body: { id, note: text } })));
      posts.delete(postId);
    },
    async confirm(postId) {
      const rows = await loadClaims(postId);
      for (const action of ["receive", "handover", "acknowledge"] as ClaimAction[]) {
        const c = rows.find((x) => x.allowedActions.includes(action));
        if (c) return claimAct(postId, c.id, action, "");
      }
      throw new SocialError("forbidden", "no claim step is open for you");
    },
  };

  const evidence = (rows: ApiEvidence[]): EvidenceNote[] => rows.map((e) => ({ id: e.id, kind: e.kind, label: e.label, note: e.note ?? "", by: people.person(e.addedByUserId), at: e.createdAt }));
  const historyRows = (rows: ApiHistory[]): RecordHistoryRow[] => rows.map((h) => ({ id: h.id, action: h.action, by: people.person(h.actorUserId), at: h.occurredAt, note: h.note ?? "" }));

  const lendingServer: LendingServerRepo = {
    act,
    async proposeDue(loanId, due, note) {
      const l = await loanRecord(loanId);
      const { data } = await intents.run(`due:${loanId}:${due}:${l.revision}`, (key) =>
        call(() => api.request("post", "/api/v1/social-loans/{id}/due-date", { path: { id: loanId }, header: { "If-Match": tag(l.revision), "Idempotency-Key": key }, body: { dueAt: dueInstant(due), note: note.trim() || null } })),
      );
      loans.set(loanId, data);
    },
    loanEvidence: async (loanId) => evidence((await call(() => api.request("get", "/api/v1/social-loans/{id}/evidence", { path: { id: loanId } }))).data.items),
    async addLoanEvidence(loanId, input) {
      if (!input.label.trim()) throw new SocialError("invalid");
      const id = uuid();
      await intents.run(`evidence:${id}`, (key) =>
        call(() => api.request("post", "/api/v1/social-loans/{id}/evidence", { path: { id: loanId }, header: { "Idempotency-Key": key }, body: { id, kind: input.kind, label: input.label.trim(), note: input.note.trim() || null } })),
      );
    },
    loanHistory: async (loanId) => historyRows((await call(() => api.request("get", "/api/v1/social-loans/{id}/history", { path: { id: loanId } }))).data.items),
    async archiveThing(thingId) {
      const a = await asset(thingId);
      const { data } = await intents.run(`asset-archive:${thingId}`, (key) =>
        call(() => api.request("post", "/api/v1/social-assets/{id}/actions/{action}", { path: { id: thingId, action: "archive" }, header: { "If-Match": tag(a.revision), "Idempotency-Key": key }, body: {} })),
      );
      assets.set(thingId, data);
    },
    async claims(postId) {
      const rows = await loadClaims(postId);
      return rows.map(
        (c): LostFoundClaim => ({ id: c.id, postId, claimant: people.person(c.claimantUserId), note: c.note ?? "", state: c.state.toLowerCase() as LostFoundClaim["state"], allowedActions: [...c.allowedActions], at: c.createdAt }),
      );
    },
    claimAct,
    async postAct(postId, action) {
      const p = await postRecord(postId);
      await intents.run(`post-action:${postId}:${action}:${p.revision}`, (key) =>
        call(() => api.request("post", "/api/v1/social-lost-found/{id}/actions/{action}", { path: { id: postId, action }, header: { "If-Match": tag(p.revision), "Idempotency-Key": key }, body: {} })),
      );
      posts.delete(postId);
    },
    matches: async (postId) =>
      Promise.all((await call(() => all((after) => api.request("get", "/api/v1/social-lost-found/{id}/matches", { path: { id: postId }, query: pageQuery(after) }).then((r) => r.data)))).map(post)),
    postConnections: (kind, title, note) => createPost({ kind: kind === "missing" ? "LOST" : "FOUND", audience: "CONNECTIONS", groupId: null, title: title.trim(), description: note.trim() || null }),
  };

  return { lending, lostFound, lendingServer };
}
