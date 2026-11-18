import type { ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-social";
import { simplifyTransfers, type SplitMethod, type SplitSpec } from "../social-money";
import type { ExpenseRevision, ExpenseScope, ExpenseVersion, ScopeBalance, Settlement, SharedExpense, SocialCurrency, SocialPerson } from "../social-domain";
import { SocialError, type BalanceRepo, type ExpenseFinanceRepo, type NewExpenseInput, type SettlementRepo, type SharedExpenseRepo } from "../social-repositories";
import { all, call, currencyFromApi, currencyToApi, fail, initials, minorFromApi, minorToApi, pageQuery, refuse, tag, uuid, type SocialCtx } from "./api-social-shared";

/*
 * Social shared ledgers (P6-03 + ADR 0061) for Group and Activity scopes —
 * the same operations under `/social-groups/{id}` and `/social-activities/{id}`.
 * Money is exact integer minor units: decimal strings on the wire, checked
 * safe integers in the screens (`minorFromApi` / `minorToApi`), never floats.
 * Proposals are recorded in Rial (IRR, ISO scale 2): Toman is a display unit
 * and a remainder can fall on a single Rial minor unit.
 * Finance posting: preview first, explicit confirm with the previewed
 * revisionId, never for settlements.
 */

type D<P extends keyof paths, M extends "get" | "post" | "put" | "patch" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiExpense = D<"/api/v1/social-groups/{id}/expenses/{expenseId}", "get">;
type ApiRevision = NonNullable<ApiExpense["effective"]>;
type ApiBalanceRow = D<"/api/v1/social-groups/{id}/balances", "get">["items"][number];
type ApiSettlement = D<"/api/v1/social-groups/{id}/settlements", "get">["items"][number];

export const LEDGER_CURRENCY: SocialCurrency = "irr";

const METHOD_FROM: Record<ApiRevision["method"], SplitMethod> = { EQUAL: "equal", PERCENT: "percent", FIXED: "fixed", WEIGHTED: "weighted" };

export interface LedgerModules {
  expenses: SharedExpenseRepo;
  balances: BalanceRepo;
  settlements: SettlementRepo;
  finance: ExpenseFinanceRepo;
  /** Own balance only (also after leaving / deletion while it is nonzero). */
  ownBalance(scope: ExpenseScope): Promise<ScopeBalance | null>;
}

export interface LedgerDeps {
  /** Ids of the viewer's groups and of their activities (for "all my balances"). */
  myScopes(): Promise<{ scope: ExpenseScope; name: string }[]>;
  groupActivities(groupId: string): Promise<{ id: string; title: string }[]>;
  activityParticipants(activityId: string): Promise<{ userId: string | null; state: string }[]>;
  /** Current Group members by Group-scoped actor id (ADR 0067 D3); `me` marks the caller. */
  groupMembers(groupId: string): Promise<{ actorId: string; name: string; me: boolean }[]>;
  scopeName(scope: ExpenseScope): Promise<string>;
}

export function createLedgerModules(ctx: SocialCtx, deps: LedgerDeps): LedgerModules {
  const { api, people, intents } = ctx;
  const scopeOf = new Map<string, ExpenseScope>();
  const records = new Map<string, ApiExpense>();
  const settlementsById = new Map<string, { scope: ExpenseScope; row: ApiSettlement }>();
  /** Group ledgers: user ids seen in the ledger (memberships carry no user id — backend gap X-S3). */
  const seen = new Map<string, Set<string>>();
  /*
   * ADR 0067 (D3): Group ledgers name people by Group actor id (as the member list does)
   * and send actor ids; the caller stays "me". Activity ledgers keep user ids.
   */
  const actorNames = new Map<string, string>();
  const who = (userId: string | null | undefined, actorId?: string | null): SocialPerson => {
    if (!actorId || userId === people.myId) return people.person(userId);
    const name = actorNames.get(actorId) ?? people.person(userId).name;
    return { id: actorId, name, initials: initials(name) };
  };
  const ref = (scope: ExpenseScope, personId: string) =>
    personId === "me" || scope.kind !== "group" ? { userId: people.apiId(personId) } : { actorId: personId };
  const see = (scope: ExpenseScope, ...ids: (string | null | undefined)[]) => {
    const set = seen.get(key(scope)) ?? new Set<string>();
    for (const id of ids) if (id) set.add(id);
    seen.set(key(scope), set);
  };

  // Typed path switches (the contract mirrors both ledgers).
  const g = (s: ExpenseScope) => s.kind === "group";
  const listExpenses = (s: ExpenseScope) =>
    call(() =>
      all((after) =>
        (g(s)
          ? api.request("get", "/api/v1/social-groups/{id}/expenses", { path: { id: s.id }, query: pageQuery(after) })
          : api.request("get", "/api/v1/social-activities/{id}/expenses", { path: { id: s.id }, query: pageQuery(after) })
        ).then((r) => r.data),
      ),
    );
  const getExpense = (s: ExpenseScope, expenseId: string) =>
    call(() =>
      g(s)
        ? api.request("get", "/api/v1/social-groups/{id}/expenses/{expenseId}", { path: { id: s.id, expenseId } })
        : api.request("get", "/api/v1/social-activities/{id}/expenses/{expenseId}", { path: { id: s.id, expenseId } }),
    ).then((r) => r.data);
  const history = (s: ExpenseScope, expenseId: string) =>
    call(() =>
      g(s)
        ? api.request("get", "/api/v1/social-groups/{id}/expenses/{expenseId}/history", { path: { id: s.id, expenseId } })
        : api.request("get", "/api/v1/social-activities/{id}/expenses/{expenseId}/history", { path: { id: s.id, expenseId } }),
    ).then((r) => r.data.items);
  const balanceRows = async (s: ExpenseScope, everyone: boolean): Promise<ApiBalanceRow[]> =>
    (
      await call(() =>
        everyone
          ? g(s)
            ? api.request("get", "/api/v1/social-groups/{id}/balances", { path: { id: s.id } })
            : api.request("get", "/api/v1/social-activities/{id}/balances", { path: { id: s.id } })
          : g(s)
            ? api.request("get", "/api/v1/social-groups/{id}/balances/me", { path: { id: s.id } })
            : api.request("get", "/api/v1/social-activities/{id}/balances/me", { path: { id: s.id } }),
      )
    ).data.items;
  const listSettlements = (s: ExpenseScope) =>
    call(() =>
      all((after) =>
        (g(s)
          ? api.request("get", "/api/v1/social-groups/{id}/settlements", { path: { id: s.id }, query: pageQuery(after) })
          : api.request("get", "/api/v1/social-activities/{id}/settlements", { path: { id: s.id }, query: pageQuery(after) })
        ).then((r) => r.data),
      ),
    );

  const remember = (s: ExpenseScope, e: ApiExpense) => {
    scopeOf.set(e.id, s);
    records.set(e.id, e);
    see(s, e.proposedByUserId, e.effective?.payerUserId, e.pending?.payerUserId, ...(e.effective?.shares ?? []).map((x) => x.userId), ...(e.pending?.shares ?? []).map((x) => x.userId));
    return e;
  };
  const record = async (expenseId: string) => {
    const s = scopeOf.get(expenseId);
    if (!s) throw new SocialError("not-found");
    return { s, e: records.get(expenseId) ?? remember(s, await getExpense(s, expenseId)) };
  };

  function version(r: ApiRevision): ExpenseVersion {
    const amount = minorFromApi(r.amountMinor);
    const shares = r.shares.filter((x) => x.userId).map((x) => ({ personId: who(x.userId, x.actorId).id, amount: minorFromApi(x.shareMinor), extra: 0 }));
    if (r.method === "EQUAL" && shares.length > 0 && !r.sharesRestricted) {
      const base = Math.floor(amount / shares.length);
      for (const s of shares) s.extra = s.amount - base;
    }
    const participants = r.shares.filter((x) => x.userId).map((x) => who(x.userId, x.actorId).id);
    const values: Record<string, number> = {};
    for (const x of r.shares) if (x.userId && x.input !== null) values[who(x.userId, x.actorId).id] = minorFromApi(x.input);
    const split: SplitSpec = { method: METHOD_FROM[r.method], participants, ...(r.method === "EQUAL" ? {} : { values }) };
    return { title: r.title, amount, payerId: who(r.payerUserId, r.payerActorId).id, day: r.incurredOn, split, shares, remainder: shares.reduce((n, s) => n + s.extra, 0) };
  }

  function toExpense(s: ExpenseScope, e: ApiExpense, revisions: ExpenseRevision[] = []): SharedExpense {
    const current = e.effective ?? e.pending;
    if (!current) throw new SocialError("not-found");
    currencyFromApi(current.currency, current.scale);
    const v = version(current);
    const mine = current.shares.find((x) => x.userId === people.myId);
    const editPending = e.state === "APPROVED" && e.pending !== null;
    const rejected = e.state === "REJECTED" ? (e.effective ?? e.pending) : null;
    return {
      id: e.id,
      scope: s,
      activityId: e.activityId,
      status: e.state === "PENDING" ? "proposed" : editPending ? "edit-pending" : e.state === "APPROVED" ? "approved" : "rejected",
      current: v,
      pendingEdit: editPending && e.pending ? { ...version(e.pending), by: people.person(e.pending.proposedByUserId), note: e.pending.note ?? "" } : null,
      payer: who(current.payerUserId, current.payerActorId),
      proposer: people.person(e.proposedByUserId),
      rejectReason: rejected?.decisionNote ?? null,
      receipt: null,
      revisions,
      settled: false,
      postedToFinance: false,
      myShare: mine ? minorFromApi(mine.shareMinor) : 0,
      canApprove: e.canDecide,
      canEdit: e.canDecide || e.proposedByUserId === people.myId,
    };
  }

  function body(scope: ExpenseScope, input: Pick<NewExpenseInput, "title" | "amount" | "payerId" | "day" | "split">, note: string | null) {
    const method = input.split.method;
    const shares = input.split.participants.map((pid) => {
      const value = input.split.values?.[pid];
      return { ...ref(scope, pid), ...(method !== "equal" && method !== "selected" && value !== undefined ? { value: minorToApi(value) } : {}) };
    });
    return {
      title: input.title.trim(),
      note,
      currency: currencyToApi(LEDGER_CURRENCY),
      amountMinor: minorToApi(input.amount),
      ...(() => {
        const payer = ref(scope, input.payerId);
        return "actorId" in payer ? { payerActorId: payer.actorId } : { payerUserId: payer.userId };
      })(),
      method: method === "selected" || method === "equal" ? ("EQUAL" as const) : method === "percent" ? ("PERCENT" as const) : method === "fixed" ? ("FIXED" as const) : ("WEIGHTED" as const),
      incurredOn: input.day,
      shares,
    };
  }

  const decide = async (expenseId: string, action: "approve" | "reject" | "withdraw", note: string | null) => {
    const { s, e } = await record(expenseId);
    const init = { path: { id: s.id, expenseId, action }, header: { "If-Match": tag(e.revision), "Idempotency-Key": "" }, body: { note } };
    const out = await intents.run(`expense-decision:${expenseId}:${action}:${e.revision}`, (key) =>
      call(() =>
        g(s)
          ? api.request("post", "/api/v1/social-groups/{id}/expenses/{expenseId}/decisions/{action}", { ...init, header: { ...init.header, "Idempotency-Key": key } })
          : api.request("post", "/api/v1/social-activities/{id}/expenses/{expenseId}/decisions/{action}", { ...init, header: { ...init.header, "Idempotency-Key": key } }),
      ),
    );
    remember(s, out.data);
  };
  const revise = async (expenseId: string, patch: Pick<NewExpenseInput, "title" | "amount" | "payerId" | "day" | "split">, note: string | null) => {
    const { s, e } = await record(expenseId);
    const payload = body(s, patch, note);
    const out = await intents.run(`expense-revision:${expenseId}:${e.revision}:${JSON.stringify(payload)}`, (key) =>
      call(() =>
        g(s)
          ? api.request("post", "/api/v1/social-groups/{id}/expenses/{expenseId}/revisions", { path: { id: s.id, expenseId }, header: { "If-Match": tag(e.revision), "Idempotency-Key": key }, body: payload })
          : api.request("post", "/api/v1/social-activities/{id}/expenses/{expenseId}/revisions", { path: { id: s.id, expenseId }, header: { "If-Match": tag(e.revision), "Idempotency-Key": key }, body: payload }),
      ),
    );
    remember(s, out.data);
  };

  const expenses: SharedExpenseRepo = {
    async scopes(groupId) {
      const acts = await deps.groupActivities(groupId).catch(() => []);
      return [{ scope: { kind: "group", id: groupId }, name: await deps.scopeName({ kind: "group", id: groupId }) }, ...acts.map((a) => ({ scope: { kind: "activity" as const, id: a.id }, name: a.title }))];
    },
    async list(scope) {
      const rows = await listExpenses(scope);
      return rows.map((e) => toExpense(scope, remember(scope, e))).sort((x, y) => y.current.day.localeCompare(x.current.day));
    },
    async get(expenseId) {
      const s = scopeOf.get(expenseId);
      if (!s) throw new SocialError("not-found");
      const e = remember(s, await getExpense(s, expenseId));
      const rows = await history(s, expenseId).catch(() => []);
      const revisions: ExpenseRevision[] = rows.map((r) => ({
        at: r.decidedAt ?? r.createdAt,
        by: people.person(r.decidedByUserId ?? r.proposedByUserId),
        kind: r.state === "APPROVED" ? (r.number > 1 ? "edit-approved" : "approved") : r.state === "REJECTED" ? (r.number > 1 ? "edit-rejected" : "rejected") : r.number > 1 ? "edit-proposed" : "proposed",
        amount: minorFromApi(r.amountMinor),
        note: r.decisionNote ?? r.note ?? "",
      }));
      return toExpense(s, e, revisions);
    },
    async participants(scope) {
      let ids: string[];
      if (scope.kind === "activity") {
        ids = (await deps.activityParticipants(scope.id)).filter((p) => p.state === "ACTIVE" && p.userId).map((p) => p.userId!);
      } else {
        // ADR 0067 (D3): current members by Group actor id; the server resolves them.
        const members = await deps.groupMembers(scope.id);
        for (const m of members) actorNames.set(m.actorId, m.name);
        return members.map((m) => (m.me ? people.person(people.myId) : who(null, m.actorId)));
      }
      return [...new Set(ids)].map((id) => people.person(id));
    },
    async propose(input) {
      const id = uuid();
      const payload = { ...body(input.scope, input, null), id };
      const s = input.scope;
      const out = await intents.run(`expense:${input.clientOpId}`, (k) =>
        call(() =>
          g(s)
            ? api.request("post", "/api/v1/social-groups/{id}/expenses", { path: { id: s.id }, header: { "Idempotency-Key": k }, body: payload })
            : api.request("post", "/api/v1/social-activities/{id}/expenses", { path: { id: s.id }, header: { "Idempotency-Key": k }, body: payload }),
        ),
      );
      remember(s, out.data);
      return out.data.id;
    },
    approve: (id) => decide(id, "approve", null),
    async editAndApprove(id, patch) {
      await revise(id, patch, null);
      await decide(id, "approve", null);
    },
    reject: (id, reason) => decide(id, "reject", reason.trim() || null),
    revise: (id, patch, note) => revise(id, patch, note.trim() || null),
    decideEdit: (id, approve) => decide(id, approve ? "approve" : "reject", null),
    claimFinancePosting: refuse("live posting to Personal Finance is an explicit preview + confirm per expense (finance.preview / finance.post)"),
    releaseFinancePosting: refuse("live posting to Personal Finance is an explicit preview + confirm per expense"),
  };

  async function scopeBalance(scope: ExpenseScope, ownOnly: boolean): Promise<ScopeBalance | null> {
    let rows: ApiBalanceRow[];
    let everyone = !ownOnly;
    if (ownOnly) rows = await balanceRows(scope, false);
    else
      try {
        rows = await balanceRows(scope, true);
      } catch (error) {
        if (!(error instanceof SocialError && error.code === "forbidden")) throw error;
        everyone = false;
        rows = await balanceRows(scope, false);
      }
    const currencies = new Set(rows.map((r) => r.currency));
    if (currencies.size > 1) fail("this ledger holds several currencies; the balance screen shows one currency per scope");
    const currency = rows[0] ? currencyFromApi(rows[0].currency) : LEDGER_CURRENCY;
    for (const r of rows) people.learn(r.userId, r.displayName);
    const toBalance = (r: ApiBalanceRow) => {
      const paid = minorFromApi(r.paidMinor);
      const share = minorFromApi(r.shareMinor);
      const net = minorFromApi(r.netMinor);
      return { personId: who(r.userId, r.actorId).id, paid, share, settled: net - paid + share, net };
    };
    const balances = rows.map(toBalance);
    const mine = balances.find((b) => b.personId === "me") ?? { personId: "me", paid: 0, share: 0, settled: 0, net: 0 };
    let counted = 0;
    let proposedCount = 0;
    let pendingEditCount = 0;
    let approvedTotal = 0;
    if (!ownOnly)
      for (const e of await listExpenses(scope).catch(() => [])) {
        remember(scope, e);
        if (e.state === "APPROVED") {
          counted++;
          if (e.effective) approvedTotal += minorFromApi(e.effective.amountMinor);
          if (e.pending) pendingEditCount++;
        } else if (e.state === "PENDING") proposedCount++;
      }
    const order = balances.map((b) => b.personId);
    return {
      scope,
      name: await deps.scopeName(scope),
      currency,
      left: ownOnly,
      members: rows.map((r) => who(r.userId, r.actorId)),
      mine: { paid: mine.paid, share: mine.share, settled: mine.settled, net: mine.net },
      transfers: everyone ? simplifyTransfers(balances, order) : [],
      everyone: everyone ? balances.map((b, i) => ({ person: who(rows[i]!.userId, rows[i]!.actorId), net: b.net })) : null,
      counted,
      proposedCount,
      pendingEditCount,
      approvedTotal,
    };
  }

  const balances: BalanceRepo = {
    forScope: async (scope) => (await scopeBalance(scope, false))!,
    mine: async (groupId) => (await scopeBalance({ kind: "group", id: groupId }, false))!,
    async mineAll() {
      const scopes = await deps.myScopes();
      const out: ScopeBalance[] = [];
      for (const { scope } of scopes) {
        const b = await scopeBalance(scope, true).catch(() => null);
        if (b && (b.mine.net !== 0 || b.mine.paid !== 0 || b.mine.share !== 0)) out.push({ ...b, left: false });
      }
      return out;
    },
    between: refuse("the contract has no balance between two people across scopes"),
  };

  const toSettlement = async (scope: ExpenseScope, r: ApiSettlement): Promise<Settlement> => ({
    id: r.id,
    scope,
    scopeName: await deps.scopeName(scope),
    currency: currencyFromApi(r.currency, r.scale),
    from: who(r.payerUserId, r.payerActorId),
    to: who(r.payeeUserId, r.payeeActorId),
    amount: minorFromApi(r.amountMinor),
    note: r.note ?? "",
    recordedBy: who(r.payerUserId, r.payerActorId),
    status: r.state === "CONFIRMED" ? "confirmed" : r.state === "DISPUTED" ? "disputed" : "recorded",
    disputeNote: r.disputeNote,
    at: r.createdAt,
    confirmedAt: r.state === "CONFIRMED" ? r.decidedAt : null,
    awaitingMe: r.payeeUserId === people.myId && (r.state === "RECORDED" || r.state === "DISPUTED"),
    postedToFinance: false,
  });
  const settlementDecision = async (settlementId: string, action: "confirm" | "dispute" | "cancel", note: string | null) => {
    const hit = settlementsById.get(settlementId);
    if (!hit) throw new SocialError("not-found");
    const { scope: s, row } = hit;
    const init = { path: { id: s.id, settlementId, action }, body: { note } };
    const out = await intents.run(`settlement:${settlementId}:${action}:${row.revision}`, (k) =>
      call(() =>
        g(s)
          ? api.request("post", "/api/v1/social-groups/{id}/settlements/{settlementId}/decisions/{action}", { ...init, header: { "If-Match": tag(row.revision), "Idempotency-Key": k } })
          : api.request("post", "/api/v1/social-activities/{id}/settlements/{settlementId}/decisions/{action}", { ...init, header: { "If-Match": tag(row.revision), "Idempotency-Key": k } }),
      ),
    );
    settlementsById.set(settlementId, { scope: s, row: out.data });
  };

  const settlements: SettlementRepo = {
    async list(scope) {
      const scopes = scope ? [scope] : (await deps.myScopes()).map((x) => x.scope);
      const out: Settlement[] = [];
      for (const s of scopes) {
        const rows = await listSettlements(s).catch((error) => {
          if (scope) throw error;
          return [];
        });
        for (const r of rows) {
          settlementsById.set(r.id, { scope: s, row: r });
          if (r.state !== "CANCELED") out.push(await toSettlement(s, r));
        }
      }
      return out.sort((x, y) => y.at.localeCompare(x.at));
    },
    async record(input) {
      if (people.apiId(input.fromId) !== people.myId) fail("only the payer records a settlement; the payee confirms it");
      const s = input.scope;
      const payee = ref(s, input.toId);
      const payload = { id: uuid(), ...("actorId" in payee ? { payeeActorId: payee.actorId } : { payeeUserId: payee.userId }), currency: currencyToApi(LEDGER_CURRENCY), amountMinor: minorToApi(input.amount), note: input.note.trim() || null };
      const out = await intents.run(`settlement:${input.clientOpId}`, (k) =>
        call(() =>
          g(s)
            ? api.request("post", "/api/v1/social-groups/{id}/settlements", { path: { id: s.id }, header: { "Idempotency-Key": k }, body: payload })
            : api.request("post", "/api/v1/social-activities/{id}/settlements", { path: { id: s.id }, header: { "Idempotency-Key": k }, body: payload }),
        ),
      );
      settlementsById.set(out.data.id, { scope: s, row: out.data });
      return out.data.id;
    },
    confirm: (id) => settlementDecision(id, "confirm", null),
    dispute: (id, note) => {
      if (!note.trim()) throw new SocialError("invalid", "DISPUTE_NOTE_REQUIRED", "DISPUTE_NOTE_REQUIRED");
      return settlementDecision(id, "dispute", note.trim());
    },
    cancel: (id) => settlementDecision(id, "cancel", null),
  };

  const finance: ExpenseFinanceRepo = {
    async preview(expenseId, accountId) {
      const { s } = await record(expenseId);
      const init = { path: { id: s.id, expenseId }, body: { accountId, categoryId: null } };
      const { data } = await call(() =>
        g(s)
          ? api.request("post", "/api/v1/social-groups/{id}/expenses/{expenseId}/finance-posting/preview", init)
          : api.request("post", "/api/v1/social-activities/{id}/expenses/{expenseId}/finance-posting/preview", init),
      );
      return { expenseId, revisionId: data.revisionId, currency: data.currency, amount: data.amount, localDate: data.localDate, accountId: data.accountId, accountName: data.accountName, alreadyPosted: data.alreadyPosted !== null };
    },
    async post(expenseId, accountId, revisionId) {
      const { s } = await record(expenseId);
      const payload = { accountId, categoryId: null, revisionId, confirm: true as const };
      const { data } = await intents.run(`finance-post:${expenseId}:${revisionId}`, (k) =>
        call(() =>
          g(s)
            ? api.request("post", "/api/v1/social-groups/{id}/expenses/{expenseId}/finance-posting", { path: { id: s.id, expenseId }, header: { "Idempotency-Key": k }, body: payload })
            : api.request("post", "/api/v1/social-activities/{id}/expenses/{expenseId}/finance-posting", { path: { id: s.id, expenseId }, header: { "Idempotency-Key": k }, body: payload }),
        ),
      );
      return { created: data.created };
    },
    async accounts() {
      const out: { id: string; name: string; currency: string }[] = [];
      let cursor: string | undefined;
      do {
        const { data } = await call(() => ctx.client.request("get", "/api/v1/finance/accounts", { query: { limit: "100", cursor, archived: "false" } }));
        for (const a of data.items) if (!a.archived) out.push({ id: a.id, name: a.name, currency: a.currency });
        cursor = data.nextCursor ?? undefined;
      } while (cursor);
      return out;
    },
  };

  return { expenses, balances, settlements, finance, ownBalance: (scope) => scopeBalance(scope, true).catch(() => null) };
}

const key = (s: ExpenseScope) => `${s.kind}:${s.id}`;

export type { SocialPerson };
