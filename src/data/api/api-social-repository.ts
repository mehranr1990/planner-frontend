import { ApiHttpError } from "@/api/errors";
import { newIdempotencyKey, typedAs, type ApiClient, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-social";
import type {
  Circle,
  Connection,
  ConnectionRequest,
  GroupAccess,
  GroupDetail,
  GroupMember,
  GroupPreview,
  GroupSettings,
  GroupSummary,
  JoinRequest,
  NeedsYouItem,
  RequestPrivacy,
  SocialPerson,
  SocialRole,
} from "../social-domain";
import { SocialError, type SocialRepository } from "../social-repositories";
import { revisionTag } from "./api-shared";

/*
 * Social (Phase 6) in live mode, over the P6-01 subset in
 * `src/api/generated/openapi-p6-social.d.ts` (30 paths / 40 operations).
 * Never mock data, never a silent fallback: what P6-01 does not serve is
 * refused with SocialError("unsupported", <exact missing capability>).
 *
 * - People: other users are their user ids; the signed-in user is the seam's
 *   "me". P6-01 payloads carry no display names (connections, join
 *   requests, memberships) → names stay blank (X-S1); only discovery
 *   returns a name.
 * - Groups: P6-01 has no caller membership / role for a group (no access/me;
 *   membership actor ids are space-local) → myRole null, owner-only
 *   capabilities off; admin review rights = the server answering the
 *   join-request list (X-S2). The server re-checks every command.
 * - Revisions: every transition sends the record's current revision as
 *   If-Match (from the last read; unknown → refetch first) and a fresh
 *   Idempotency-Key where the contract asks for one.
 * `API_COVERAGE_MATRIX.md` → "Social".
 */

type Api = ApiClientFor<paths>;
type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiConnection = Data<"/api/v1/social/connections", "get">["items"][number];
type ApiGroup = Data<"/api/v1/social-groups/{id}", "get">;
type ApiMembership = Data<"/api/v1/social-groups/{id}/memberships", "get">["items"][number];
type ApiJoinRequest = Data<"/api/v1/social-groups/{id}/join-requests", "get">["items"][number];

export interface SocialUser {
  id: string;
  name: string;
}

/** Exact P6-01 gaps, recorded in API_COVERAGE_MATRIX.md (Social). */
export const SOCIAL_GAPS = {
  activities: "P6-02 activities / itinerary / RSVP / waitlist / checklist / calendar projections are not in the contract",
  polls: "P6-02 polls and consent-based free/busy are not in the contract",
  expenses: "P6-03 shared expenses, splits, approvals, balances and settlements are not in the contract",
  lending: "P6-04 lending and lost & found are not in the contract",
  albums: "P6-05 private albums are not in the contract",
  challenges: "P6-05 challenges are not in the contract",
  groupCreate: "group create needs the operator-supplied retentionPolicyVersion (OD-1)",
  myMembership: "no caller membership / role for a Social Group (no access/me; actor ids are space-local) (X-S2)",
  events: "no group activity log (P6-06) in the contract",
  invites: "no list of a group's pending invitations (only create / read one / revoke)",
  status: "no per-group member status in the contract",
  chat: "Social Group Chat integration is not available (P6-01 handoff §7)",
  checklist: "leave checklist (open balance, things held, photos) needs P6-03…P6-05",
  deleteGroup: "no group delete; last-member departure uses 30-day shared closure",
  privacyGroups: "privacy has only allowFriendRequests on/off — no “people in my groups” option",
  settings: "group invites / approvers / balance visibility / originals / rules / currency settings are not in the contract",
  topic: "discover / groups expose no topic or size",
} as const;

const fail = (reason: string): never => {
  throw new SocialError("unsupported", reason);
};
const refuse = (reason: string) => () => Promise.reject(new SocialError("unsupported", reason));

/** Every method of a repository refuses with `reason`. */
function refused<T extends object>(reason: string): T {
  return new Proxy({} as T, { get: (_, name) => (typeof name === "string" && name !== "then" ? refuse(reason) : undefined) });
}

/** HTTP statuses → the Social seam's codes; 401 / 5xx / network propagate. */
async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiHttpError) {
      if (error.status === 404) throw new SocialError("not-found");
      if (error.status === 403) throw new SocialError("forbidden");
      if (error.status === 400 || error.status === 422) throw new SocialError("invalid");
      if (error.status === 409 || error.status === 412) throw new SocialError("conflict");
      if (error.status === 429) throw new SocialError("rate-limited");
    }
    throw error;
  }
}

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newIdempotencyKey());

async function all<T>(page: (after: string | undefined) => Promise<{ items: T[]; nextCursor?: string | null }>): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  do {
    const next = await page(after);
    out.push(...next.items);
    after = next.nextCursor ?? undefined;
  } while (after);
  return out;
}

const DEFAULT_SETTINGS: Omit<GroupSettings, "visibility"> = {
  invites: "admins",
  linkNeedsApproval: true,
  approvers: "admins",
  membersSeeBalances: false,
  originalsUploaderOnly: true,
};

export function createApiSocial(client: ApiClient, user: SocialUser): SocialRepository {
  const api: Api = typedAs<paths>(client);
  const apiUserId = (personId: string) => (personId === "me" ? user.id : personId);
  const person = (userId: string): SocialPerson => (userId === user.id ? { id: "me", name: user.name, initials: initials(user.name) } : { id: userId, name: "", initials: "?" });

  // Last-read records (revisions for If-Match).
  const connections = new Map<string, ApiConnection>();
  const circleRevisions = new Map<string, number>();
  const groups = new Map<string, ApiGroup>();
  const memberships = new Map<string, ApiMembership[]>();
  const joinRequests = new Map<string, ApiJoinRequest>();
  const myJoin = new Map<string, ApiJoinRequest>();
  const previews = new Map<string, GroupPreview>();
  let privacyRevision: number | null = null;

  const loadConnections = async () => {
    const items = await call(() => all((after) => api.request("get", "/api/v1/social/connections", { query: { limit: 100, ...(after ? { after } : {}) } }).then((r) => r.data)));
    connections.clear();
    for (const c of items) connections.set(c.id, c);
    return items;
  };
  const other = (c: ApiConnection) => (c.requesterUserId === user.id ? c.recipientUserId : c.requesterUserId);
  const connectionFor = async (personId: string, state: ApiConnection["state"] = "ACCEPTED") => {
    const userId = apiUserId(personId);
    const find = () => [...connections.values()].find((c) => c.state === state && other(c) === userId);
    const found = find() ?? (await loadConnections(), find());
    if (!found) throw new SocialError("not-found");
    return found;
  };
  const transition = async (c: ApiConnection, action: "accept" | "decline" | "cancel" | "remove") => {
    const { data } = await call(() =>
      api.request("post", "/api/v1/social/connections/{id}/{action}", { path: { id: c.id, action }, header: { "If-Match": revisionTag(c.revision), "Idempotency-Key": newIdempotencyKey() } }),
    );
    connections.set(data.id, data);
  };
  const circleRevision = async (id: string) => {
    if (!circleRevisions.has(id)) {
      const { data } = await call(() => api.request("get", "/api/v1/social/circles/{id}", { path: { id } }));
      circleRevisions.set(id, data.revision);
    }
    return circleRevisions.get(id)!;
  };

  const loadGroup = async (id: string) => {
    const { data } = await call(() => api.request("get", "/api/v1/social-groups/{id}", { path: { id } }));
    groups.set(id, data);
    return data;
  };
  const loadMemberships = async (id: string) => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-groups/{id}/memberships", { path: { id }, query: { limit: 100, ...(after ? { after } : {}) } }).then((r) => r.data)));
    memberships.set(id, rows);
    return rows;
  };
  /** Admin review rights: the server answers the join-request list (403 → no rights). */
  const loadJoinRequests = async (id: string): Promise<ApiJoinRequest[] | null> => {
    try {
      const rows = await call(() => all((after) => api.request("get", "/api/v1/social-groups/{id}/join-requests", { path: { id }, query: { limit: 100, ...(after ? { after } : {}) } }).then((r) => r.data)));
      for (const r of rows) joinRequests.set(r.id, r);
      return rows.filter((r) => r.state === "PENDING");
    } catch (error) {
      if (error instanceof SocialError && (error.code === "forbidden" || error.code === "not-found")) return null;
      throw error;
    }
  };
  const membershipOf = async (groupId: string, personId: string) => {
    const rows = memberships.get(groupId) ?? (await loadMemberships(groupId));
    const row = rows.find((m) => m.actorId === personId);
    if (!row) throw new SocialError("not-found");
    return row;
  };
  const role = (m: ApiMembership): SocialRole | null => (m.role === "OWNER" ? "owner" : m.role === "ADMIN" ? "admin" : m.role === "MEMBER" ? "member" : null);

  const summary = (g: ApiGroup, active: number | null, pending: number): GroupSummary => ({
    id: g.id,
    name: g.name,
    description: g.description ?? "",
    topic: null,
    currency: null,
    memberCount: active,
    myRole: null,
    visibility: g.discoverable ? "discoverable" : "private",
    unread: 0,
    pendingRequests: pending,
    initials: initials(g.name),
  });

  async function detail(g: ApiGroup): Promise<GroupDetail> {
    const [rows, pending] = await Promise.all([loadMemberships(g.id), loadJoinRequests(g.id)]);
    const active = rows.filter((m) => m.state === "ACTIVE");
    const admin = pending !== null;
    const members: GroupMember[] = active.map((m) => ({ person: { id: m.actorId, name: "", initials: "?" }, role: role(m), joinedAt: null, status: null, isSelf: false }));
    return {
      ...summary(g, active.length, pending?.length ?? 0),
      rules: "",
      settings: { ...DEFAULT_SETTINGS, visibility: g.discoverable ? "discoverable" : "private" },
      currencyLocked: true,
      members,
      createdAt: g.createdAt,
      capabilities: {
        createActivity: false,
        invite: admin,
        decideJoins: admin,
        changeRoles: false,
        removeMembers: admin,
        editSettings: admin,
        makeDiscoverable: false,
        approveExpenses: false,
        seeAllBalances: false,
        deleteGroup: false,
        transferOwnership: false,
      },
    };
  }

  const loadPreviews = async () => {
    const items = await call(() => all((after) => api.request("get", "/api/v1/social-groups/discover", { query: { limit: 100, ...(after ? { after } : {}) } }).then((r) => r.data)));
    for (const p of items) previews.set(p.id, { id: p.id, name: p.name, description: p.publicSummary, topic: null, size: null, rules: "", requested: myJoin.has(p.id) && myJoin.get(p.id)!.state === "PENDING" });
    return items.map((p) => previews.get(p.id)!);
  };

  const repo: SocialRepository = {
    connections: {
      async list() {
        const [items, circles] = await Promise.all([loadConnections(), repo.circles.list()]);
        const labels = new Map<string, string[]>();
        for (const circle of circles) {
          const rows = await call(() => all((after) => api.request("get", "/api/v1/social/circles/{id}/members", { path: { id: circle.id }, query: { limit: 100, ...(after ? { after } : {}) } }).then((r) => r.data)));
          for (const row of rows) labels.set(row.connectionId, [...(labels.get(row.connectionId) ?? []), circle.id]);
        }
        return items
          .filter((c) => c.state === "ACCEPTED")
          .map((c): Connection => ({ person: person(other(c)), since: c.updatedAt.slice(0, 10), circleIds: labels.get(c.id) ?? [], sharedGroups: null }));
      },
      async requests() {
        const items = await loadConnections();
        return items
          .filter((c) => c.state === "PENDING")
          .map((c): ConnectionRequest => ({ id: c.id, person: person(other(c)), direction: c.requesterUserId === user.id ? "outgoing" : "incoming", note: "", at: c.createdAt, mutualGroups: null }));
      },
      async request(contact) {
        // Exact verified email only; an empty result looks exactly like a sent request (no account-existence diagnostic).
        const email = contact.trim();
        if (!email.includes("@")) throw new SocialError("invalid", "P6-01 discovery accepts an exact email only (no phone)");
        const { data } = await call(() => api.request("post", "/api/v1/social/discovery", { body: { email } }));
        const target = data.items[0];
        if (target) {
          await call(() => api.request("post", "/api/v1/social/connections", { header: { "Idempotency-Key": newIdempotencyKey() }, body: { id: uuid(), recipientUserId: target.id } })).catch((error) => {
            // An existing / opposing request is not shown as a different answer.
            if (!(error instanceof SocialError && error.code === "conflict")) throw error;
          });
        }
        return { sent: true };
      },
      async accept(requestId) {
        const c = connections.get(requestId) ?? (await loadConnections(), connections.get(requestId));
        if (!c) throw new SocialError("not-found");
        await transition(c, "accept");
      },
      async ignore(requestId) {
        const c = connections.get(requestId) ?? (await loadConnections(), connections.get(requestId));
        if (!c) throw new SocialError("not-found");
        await transition(c, "decline");
      },
      async cancel(requestId) {
        const c = connections.get(requestId) ?? (await loadConnections(), connections.get(requestId));
        if (!c) throw new SocialError("not-found");
        await transition(c, "cancel");
      },
      async remove(personId) {
        await transition(await connectionFor(personId), "remove");
      },
      async block(personId) {
        // Initial own (absent) block state uses revision 1 (P6-01 handoff §7).
        await call(() => api.request("post", "/api/v1/social/blocks", { header: { "If-Match": revisionTag(1), "Idempotency-Key": newIdempotencyKey() }, body: { targetUserId: apiUserId(personId) } }));
      },
      async privacy() {
        const { data } = await call(() => api.request("get", "/api/v1/social/privacy"));
        privacyRevision = data.revision;
        return data.allowFriendRequests ? "everyone" : "nobody";
      },
      async setPrivacy(value: RequestPrivacy) {
        if (value === "groups") fail(SOCIAL_GAPS.privacyGroups);
        if (privacyRevision === null) await repo.connections.privacy();
        const { data } = await call(() =>
          api.request("patch", "/api/v1/social/privacy", { header: { "If-Match": revisionTag(privacyRevision!), "Idempotency-Key": newIdempotencyKey() }, body: { allowFriendRequests: value === "everyone" } }),
        );
        privacyRevision = data.revision;
      },
    },
    circles: {
      async list() {
        const items = await call(() => all((after) => api.request("get", "/api/v1/social/circles", { query: { limit: 100, ...(after ? { after } : {}) } }).then((r) => r.data)));
        for (const c of items) circleRevisions.set(c.id, c.revision);
        return items.map((c): Circle => ({ id: c.id, name: c.name }));
      },
      async create(name) {
        if (!name.trim()) throw new SocialError("invalid");
        const { data } = await call(() => api.request("post", "/api/v1/social/circles", { header: { "Idempotency-Key": newIdempotencyKey() }, body: { id: uuid(), name: name.trim() } }));
        circleRevisions.set(data.id, data.revision);
        return { id: data.id, name: data.name };
      },
      async remove(circleId) {
        const revision = await circleRevision(circleId);
        await call(() => api.request("delete", "/api/v1/social/circles/{id}", { path: { id: circleId }, header: { "If-Match": revisionTag(revision), "Idempotency-Key": newIdempotencyKey() } }));
        circleRevisions.delete(circleId);
      },
      async setMembership(circleId, personId, member) {
        const connection = await connectionFor(personId);
        const revision = await circleRevision(circleId);
        const init = { path: { id: circleId, connectionId: connection.id }, header: { "If-Match": revisionTag(revision), "Idempotency-Key": newIdempotencyKey() } };
        await call(() => (member ? api.request("put", "/api/v1/social/circles/{id}/members/{connectionId}", init) : api.request("delete", "/api/v1/social/circles/{id}/members/{connectionId}", init)));
        // Label commands do not return the refreshed Circle revision: refetch before the next one.
        circleRevisions.delete(circleId);
      },
    },
    groups: {
      async directory() {
        const items = await call(() => all((after) => api.request("get", "/api/v1/social-groups", { query: { limit: 100, ...(after ? { after } : {}) } }).then((r) => r.data)));
        const rows = await Promise.all(
          items.map(async (g) => {
            groups.set(g.id, g);
            const [members, pending] = await Promise.all([loadMemberships(g.id).catch(() => null), loadJoinRequests(g.id)]);
            return summary(g, members ? members.filter((m) => m.state === "ACTIVE").length : null, pending?.length ?? 0);
          }),
        );
        return {
          groups: rows.sort((a, b) => a.name.localeCompare(b.name)),
          incomingRequests: (await repo.connections.requests()).filter((r) => r.direction === "incoming").length,
          joinRequestsPending: [...myJoin.entries()].filter(([, r]) => r.state === "PENDING").map(([groupId]) => ({ groupId, groupName: previews.get(groupId)?.name ?? "" })),
        };
      },
      async access(groupId): Promise<GroupAccess> {
        try {
          return { kind: "member", group: await detail(await loadGroup(groupId)) };
        } catch (error) {
          if (!(error instanceof SocialError) || (error.code !== "forbidden" && error.code !== "not-found")) throw error;
          const mine = myJoin.get(groupId);
          const preview = previews.get(groupId);
          // Pending requesters see the public preview only; everything else is "not available" (no discovery).
          if (mine?.state === "PENDING" && preview) return { kind: "join-requested", preview: { ...preview, requested: true } };
          return { kind: "not-available" };
        }
      },
      async discover(query, topic) {
        if (topic !== "all") fail(SOCIAL_GAPS.topic);
        const q = query.trim().toLocaleLowerCase();
        return (await loadPreviews()).filter((p) => !q || p.name.toLocaleLowerCase().includes(q) || p.description.toLocaleLowerCase().includes(q));
      },
      async requestJoin(groupId) {
        const { data } = await call(() => api.request("post", "/api/v1/social-groups/{id}/join-requests", { path: { id: groupId }, header: { "Idempotency-Key": newIdempotencyKey() }, body: { id: uuid() } }));
        myJoin.set(groupId, data);
        const preview = previews.get(groupId);
        if (preview) previews.set(groupId, { ...preview, requested: true });
      },
      async cancelJoin(groupId) {
        const mine = myJoin.get(groupId);
        if (!mine) fail("the applicant's own pending request id is known only for requests sent in this session (no own-request list)");
        const { data } = await call(() =>
          api.request("post", "/api/v1/social-groups/{id}/join-requests/{requestId}/{action}", { path: { id: groupId, requestId: mine!.id, action: "cancel" }, header: { "If-Match": revisionTag(mine!.revision) } }),
        );
        myJoin.set(groupId, data);
      },
      async joinRequests(groupId) {
        const rows = await loadJoinRequests(groupId);
        if (rows === null) throw new SocialError("forbidden");
        return rows.map((r): JoinRequest => ({ id: r.id, groupId, person: person(r.requesterUserId), note: "", at: null }));
      },
      async decide(requestId, approve) {
        const r = joinRequests.get(requestId);
        if (!r) throw new SocialError("not-found");
        const { data } = await call(() =>
          api.request("post", "/api/v1/social-groups/{id}/join-requests/{requestId}/{action}", { path: { id: r.groupId, requestId, action: approve ? "approve" : "reject" }, header: { "If-Match": revisionTag(r.revision) } }),
        );
        joinRequests.set(requestId, data);
      },
      create: refuse(SOCIAL_GAPS.groupCreate),
      events: refuse(SOCIAL_GAPS.events),
      invites: refuse(SOCIAL_GAPS.invites),
      async invite(groupId, personIds) {
        for (const personId of personIds) {
          await call(() =>
            api.request("post", "/api/v1/social-groups/{id}/invitations", {
              path: { id: groupId },
              header: { "Idempotency-Key": newIdempotencyKey() },
              body: { kind: "MEMBERSHIP", memberRole: "MEMBER", recipient: { userId: apiUserId(personId) } },
            }),
          );
        }
      },
      async cancelInvite(groupId, inviteId) {
        const { data } = await call(() => api.request("get", "/api/v1/social-groups/{id}/invitations/{offerId}", { path: { id: groupId, offerId: inviteId } }));
        await call(() => api.request("post", "/api/v1/social-groups/{id}/invitations/{offerId}/revoke", { path: { id: groupId, offerId: inviteId }, header: { "If-Match": revisionTag(data.revision) } }));
      },
      resendInvite: refuse(SOCIAL_GAPS.invites),
      async setRole(groupId, personId, value) {
        const m = await membershipOf(groupId, personId);
        await call(() =>
          api.request("patch", "/api/v1/social-groups/{id}/memberships/{accessId}", { path: { id: groupId, accessId: m.id }, header: { "If-Match": revisionTag(m.revision) }, body: { state: "ACTIVE", memberRole: value === "admin" ? "ADMIN" : "MEMBER" } }),
        );
        memberships.delete(groupId);
      },
      async removeMember(groupId, personId) {
        const m = await membershipOf(groupId, personId);
        await call(() =>
          api.request("patch", "/api/v1/social-groups/{id}/memberships/{accessId}", {
            path: { id: groupId, accessId: m.id },
            header: { "If-Match": revisionTag(m.revision) },
            body: { state: "REVOKED", memberRole: m.memberRole ?? "MEMBER" },
          }),
        );
        memberships.delete(groupId);
      },
      async transferOwnership(groupId, personId) {
        // Starts a handover; the successor accepts with fresh password reauthentication (not a silent transfer).
        const m = await membershipOf(groupId, personId);
        await call(() => api.request("post", "/api/v1/social-groups/{id}/handovers", { path: { id: groupId }, header: { "Idempotency-Key": newIdempotencyKey() }, body: { successorAccessId: m.id } }));
      },
      async updateSettings(groupId, patch) {
        const g = groups.get(groupId) ?? (await loadGroup(groupId));
        const { name, description, visibility, ...rest } = patch;
        const changed = Object.entries(rest).filter(([key, value]) => value !== undefined && value !== (DEFAULT_SETTINGS as Record<string, unknown>)[key] && !(key === "rules" && value === ""));
        if (changed.length > 0) fail(SOCIAL_GAPS.settings);
        const { data } = await call(() =>
          api.request("patch", "/api/v1/social-groups/{id}", {
            path: { id: groupId },
            header: { "If-Match": revisionTag(g.revision) },
            body: { ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}), ...(visibility !== undefined ? { discoverable: visibility === "discoverable" } : {}) },
          }),
        );
        groups.set(groupId, data);
      },
      setMyStatus: refuse(SOCIAL_GAPS.status),
      leaveChecklist: refuse(SOCIAL_GAPS.checklist),
      leave: refuse(`leave needs the caller's own membership revision as If-Match — ${SOCIAL_GAPS.myMembership}`),
      deleteGroup: refuse(SOCIAL_GAPS.deleteGroup),
      chatMembers: refuse(SOCIAL_GAPS.chat),
    },
    activities: refused(SOCIAL_GAPS.activities),
    checklist: refused(SOCIAL_GAPS.activities),
    files: refused(SOCIAL_GAPS.activities),
    polls: refused(SOCIAL_GAPS.polls),
    freeBusy: refused(SOCIAL_GAPS.polls),
    expenses: refused(SOCIAL_GAPS.expenses),
    balances: refused(SOCIAL_GAPS.expenses),
    settlements: refused(SOCIAL_GAPS.expenses),
    lending: refused(SOCIAL_GAPS.lending),
    lostFound: refused(SOCIAL_GAPS.lending),
    albums: refused(SOCIAL_GAPS.albums),
    challenges: refused(SOCIAL_GAPS.challenges),
    inbox: {
      // Composed only from what P6-01 serves: incoming connection requests and join requests I may review.
      async list() {
        const items: NeedsYouItem[] = (await repo.connections.requests())
          .filter((r) => r.direction === "incoming")
          .map((r) => ({ id: `n-${r.id}`, kind: "connection", person: r.person, subject: "", scopeName: "", href: "/social/connections", money: null }));
        for (const g of groups.values()) {
          const pending = await loadJoinRequests(g.id);
          for (const r of pending ?? []) items.push({ id: `n-${r.id}`, kind: "join-request", person: person(r.requesterUserId), subject: "", scopeName: g.name, href: `/social/groups/${encodeURIComponent(g.id)}/members`, money: null });
        }
        return items;
      },
    },
  };
  return repo;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Live mode without a signed-in session: every call fails, nothing is shown. */
export function createUnavailableSocial(): SocialRepository {
  const reason = "no signed-in session";
  return new Proxy({} as SocialRepository, { get: (_, name) => (typeof name === "string" && name !== "then" ? refused(reason) : undefined) });
}
