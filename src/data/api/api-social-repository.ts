import { typedAs, type ApiClient, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-social";
import type {
  Circle,
  Connection,
  ConnectionRequest,
  ExpenseScope,
  GroupAccess,
  GroupCapabilities,
  GroupDetail,
  GroupEvent,
  GroupEventKind,
  GroupMember,
  GroupPreview,
  GroupSettings,
  GroupSummary,
  JoinRequest,
  NeedsYouItem,
  RequestPrivacy,
  SocialNotice,
  SocialPerson,
  SocialRole,
} from "../social-domain";
import { SocialError, type SocialRepository } from "../social-repositories";
import { createActivityModules } from "./api-social-activities";
import { createGoalModules } from "./api-social-goals";
import { createLedgerModules, LEDGER_CURRENCY } from "./api-social-ledger";
import { createLendingModules } from "./api-social-lending";
import {
  all,
  call,
  currencyFromApi,
  fail,
  initials,
  Intents,
  minorFromApi,
  pageQuery,
  People,
  refuse,
  refused,
  retentionVersion,
  Revisions,
  tag,
  uuid,
  type SocialCtx,
} from "./api-social-shared";

/*
 * Social (Phase 6) in live mode over the full Social contract
 * (`src/api/generated/openapi-p6-social.d.ts`, 149 operations, backend
 * `33ef598`). Never mock data, never a silent fallback: what the contract
 * does not serve is refused with SocialError("unsupported", <exact gap>).
 *
 * - People: user ids; the signed-in user is the seam's "me". Display names
 *   come from the server (connections, memberships, participants, balances).
 * - Groups: the caller's role and rights come from `access/me` capabilities —
 *   never inferred from a request that happened to succeed.
 * - Revisions: If-Match from the last read; Idempotency-Key per user intent.
 * - Retention: group create and activity conversations take the operator
 *   catalog's single policy (`GET /retention-policies`), or are refused.
 * Module adapters: activities / ledger / lending / goals (`api-social-*.ts`).
 * `API_COVERAGE_MATRIX.md` → "Social".
 */

type D<P extends keyof paths, M extends "get" | "post" | "put" | "patch" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiConnection = D<"/api/v1/social/connections", "get">["items"][number];
type ApiGroup = D<"/api/v1/social-groups/{id}", "get">;
type ApiMembership = D<"/api/v1/social-groups/{id}/memberships", "get">["items"][number];
type ApiJoinRequest = D<"/api/v1/social-groups/{id}/join-requests", "get">["items"][number];
type ApiAccess = D<"/api/v1/social-groups/{id}/access/me", "get">;
type ApiExitCheck = D<"/api/v1/social-groups/{id}/exit-check", "get">;
type ApiHandover = D<"/api/v1/social-groups/{id}/handovers/{handoverId}", "get">;

export interface SocialUser {
  id: string;
  name: string;
}

/** What the contract still does not serve (recorded in API_COVERAGE_MATRIX.md, Social). */
export const SOCIAL_GAPS = {
  albums: "Albums are deferred: no album routes in the contract (social-albums-deferred-contract.md)",
  files: "Activity files / receipts / media are disabled (ADR 0063: contract only)",
  chat: "Social Group chat uses openChat (ADR 0067): one primary Messages conversation per group",
  invites: "no list of a group's pending invitations and no resend (create / read one / revoke only)",
  status: "no per-group member status in the contract",
  topic: "groups and discover previews expose no topic or size",
  privacyGroups: "privacy has only allowFriendRequests on/off — no “people in my groups” option",
  settings: "invite policy / approvers / balance visibility / originals / rules / group currency settings are not in the contract",
  between: "no balance between two people across scopes",
  leaveChecklist: "use the exit check (own obligations only)",
} as const;

const DEFAULT_SETTINGS: Omit<GroupSettings, "visibility"> = {
  invites: "admins",
  linkNeedsApproval: true,
  approvers: "admins",
  membersSeeBalances: false,
  originalsUploaderOnly: true,
};

const HISTORY_KIND: Record<string, GroupEventKind> = {
  "social.group.create": "created",
  "social.group.update": "updated",
  "social.group.private": "updated",
  "social.group.public": "updated",
  "membership.admit": "joined",
  "membership.change": "role",
  "membership.leave": "left",
  "handover.accept": "handover",
};

export function createApiSocial(client: ApiClient, user: SocialUser): SocialRepository {
  const api = typedAs<paths>(client);

  /** Accept / decline with a proof (X-Invitation-Proof) and its revision (If-Match). */
  async function respondWithProof(invitationId: string, proof: string, revision: number, accept: boolean): Promise<{ groupId: string | null }> {
    const header = { "If-Match": tag(revision), "X-Invitation-Proof": proof };
    if (accept) {
      const { data } = await call(() => api.request("post", "/api/v1/social-group-invitations/{id}/accept", { path: { id: invitationId }, header, body: {} }));
      const g = (await loadGroups().catch(() => [])).find((x) => x.spaceId === data.invitation.spaceId);
      return { groupId: g?.id ?? null };
    }
    await call(() => api.request("post", "/api/v1/social-group-invitations/{id}/decline", { path: { id: invitationId }, header, body: {} }));
    return { groupId: null };
  }
  const people = new People(user);
  const revisions = new Revisions();
  const intents = new Intents();

  // Last-read records.
  const connections = new Map<string, ApiConnection>();
  const groups = new Map<string, ApiGroup>();
  const access = new Map<string, ApiAccess | null>();
  const memberships = new Map<string, ApiMembership[]>();
  const joinRequests = new Map<string, ApiJoinRequest>();
  const myJoin = new Map<string, ApiJoinRequest>();
  const previews = new Map<string, GroupPreview>();
  const exitChecks = new Map<string, ApiExitCheck>();
  const handovers = new Map<string, ApiHandover>();
  let privacyRevision: number | null = null;

  const loadGroups = async () => {
    const items = await call(() => all((after) => api.request("get", "/api/v1/social-groups", { query: pageQuery(after) }).then((r) => r.data)));
    for (const g of items) groups.set(g.id, g);
    return items;
  };
  const groupName = async (id: string | null) => {
    if (!id) return "";
    if (!groups.has(id)) await loadGroups().catch(() => null);
    return groups.get(id)?.name ?? "";
  };

  const ctx: SocialCtx = { client, api, people, revisions, intents, groupName };

  const loadConnections = async () => {
    const items = await call(() => all((after) => api.request("get", "/api/v1/social/connections", { query: pageQuery(after) }).then((r) => r.data)));
    connections.clear();
    for (const c of items) {
      connections.set(c.id, c);
      people.learn(c.requesterUserId, c.requesterDisplayName);
      people.learn(c.recipientUserId, c.recipientDisplayName);
    }
    return items;
  };
  const other = (c: ApiConnection) => (c.requesterUserId === user.id ? c.recipientUserId : c.requesterUserId);
  const connectionFor = async (personId: string, state: ApiConnection["state"] = "ACCEPTED") => {
    const userId = people.apiId(personId);
    const find = () => [...connections.values()].find((c) => c.state === state && other(c) === userId);
    const found = find() ?? (await loadConnections(), find());
    if (!found) throw new SocialError("not-found");
    return found;
  };
  const transition = async (c: ApiConnection, action: "accept" | "decline" | "cancel" | "remove") => {
    const { data } = await intents.run(`connection:${c.id}:${action}`, (key) =>
      call(() => api.request("post", "/api/v1/social/connections/{id}/{action}", { path: { id: c.id, action }, header: { "If-Match": tag(c.revision), "Idempotency-Key": key } })),
    );
    connections.set(data.id, data);
  };
  const connectionById = async (id: string) => {
    const c = connections.get(id) ?? (await loadConnections(), connections.get(id));
    if (!c) throw new SocialError("not-found");
    return c;
  };
  const circleRevision = async (id: string) => {
    const known = revisions.get(`circle:${id}`);
    if (known !== undefined) return known;
    const { data } = await call(() => api.request("get", "/api/v1/social/circles/{id}", { path: { id } }));
    revisions.set(`circle:${id}`, data.revision);
    return data.revision;
  };
  const acceptedConnections = async (): Promise<SocialPerson[]> => (await loadConnections()).filter((c) => c.state === "ACCEPTED").map((c) => people.person(other(c)));

  const loadGroup = async (id: string) => {
    const { data } = await call(() => api.request("get", "/api/v1/social-groups/{id}", { path: { id } }));
    groups.set(id, data);
    return data;
  };
  /** The caller's own membership and server capabilities; null = not a current member. */
  const loadAccess = async (id: string): Promise<ApiAccess | null> => {
    try {
      const { data } = await call(() => api.request("get", "/api/v1/social-groups/{id}/access/me", { path: { id } }));
      access.set(id, data);
      return data;
    } catch (error) {
      if (error instanceof SocialError && (error.code === "forbidden" || error.code === "not-found")) {
        access.set(id, null);
        return null;
      }
      throw error;
    }
  };
  const loadMemberships = async (id: string) => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-groups/{id}/memberships", { path: { id }, query: pageQuery(after) }).then((r) => r.data)));
    memberships.set(id, rows);
    return rows;
  };
  const loadJoinRequests = async (id: string): Promise<ApiJoinRequest[]> => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-groups/{id}/join-requests", { path: { id }, query: pageQuery(after) }).then((r) => r.data)));
    for (const r of rows) joinRequests.set(r.id, r);
    return rows.filter((r) => r.state === "PENDING");
  };
  const membershipOf = async (groupId: string, personId: string) => {
    const rows = memberships.get(groupId) ?? (await loadMemberships(groupId));
    const row = rows.find((m) => m.actorId === personId) ?? (await loadMemberships(groupId)).find((m) => m.actorId === personId);
    if (!row) throw new SocialError("not-found");
    return row;
  };
  const role = (r: string | null | undefined): SocialRole | null => (r === "OWNER" ? "owner" : r === "ADMIN" ? "admin" : r === "MEMBER" ? "member" : null);

  function capabilities(a: ApiAccess | null): GroupCapabilities {
    const has = (c: ApiAccess["capabilities"][number]) => !!a?.capabilities.includes(c);
    const approver = a?.role === "OWNER" || a?.role === "ADMIN";
    return {
      createActivity: a?.state === "ACTIVE",
      invite: has("membership.member"),
      decideJoins: has("membership.member"),
      changeRoles: has("membership.admin"),
      removeMembers: has("membership.member"),
      editSettings: has("settings.manage"),
      makeDiscoverable: has("settings.manage"),
      approveExpenses: approver,
      seeAllBalances: approver,
      deleteGroup: a?.role === "OWNER",
      transferOwnership: has("custody.handover"),
    };
  }

  const summary = (g: ApiGroup, a: ApiAccess | null, active: number | null, pending: number): GroupSummary => ({
    id: g.id,
    name: g.name,
    description: g.description ?? "",
    topic: null,
    // Proposals in live ledgers are recorded in Rial (IRR); other currencies are read back exactly.
    currency: LEDGER_CURRENCY,
    memberCount: active,
    myRole: role(a?.role),
    visibility: g.discoverable ? "discoverable" : "private",
    unread: 0,
    pendingRequests: pending,
    initials: initials(g.name),
  });

  async function detail(g: ApiGroup, a: ApiAccess): Promise<GroupDetail> {
    const caps = capabilities(a);
    const [rows, pending] = await Promise.all([loadMemberships(g.id), caps.decideJoins ? loadJoinRequests(g.id) : Promise.resolve([] as ApiJoinRequest[])]);
    const active = rows.filter((m) => m.state === "ACTIVE");
    const members: GroupMember[] = active.map((m) => {
      const name = m.actorId === a.actorId ? user.name : (m.displayName ?? "");
      return { person: m.actorId === a.actorId ? { id: m.actorId, name, initials: initials(name) } : { id: m.actorId, name, initials: initials(name) }, role: role(m.role), joinedAt: null, status: null, isSelf: m.actorId === a.actorId };
    });
    return {
      ...summary(g, a, active.length, pending.length),
      rules: "",
      settings: { ...DEFAULT_SETTINGS, visibility: g.discoverable ? "discoverable" : "private" },
      currencyLocked: true,
      members,
      createdAt: g.createdAt,
      capabilities: caps,
    };
  }

  const loadPreviews = async () => {
    const items = await call(() => all((after) => api.request("get", "/api/v1/social-groups/discover", { query: pageQuery(after) }).then((r) => r.data)));
    for (const p of items) previews.set(p.id, { id: p.id, name: p.name, description: p.publicSummary, topic: null, size: null, rules: "", requested: myJoin.get(p.id)?.state === "PENDING" });
    return items.map((p) => previews.get(p.id)!);
  };

  const myActivityScopes = async () => {
    const rows = await call(() => all((after) => api.request("get", "/api/v1/social-activities", { query: pageQuery(after) }).then((r) => r.data)));
    return rows.filter((a) => a.me?.state === "ACTIVE").map((a) => ({ scope: { kind: "activity" as const, id: a.id }, name: a.title }));
  };
  const groupActivities = async (groupId: string) =>
    (await call(() => all((after) => api.request("get", "/api/v1/social-activities", { query: { ...pageQuery(after), groupId } }).then((r) => r.data)))).map((a) => ({ id: a.id, title: a.title }));

  const activityModules = createActivityModules(ctx, acceptedConnections);
  const scopeName = async (scope: ExpenseScope) => (scope.kind === "group" ? groupName(scope.id) : activityModules.activityTitle(scope.id));
  const ledger = createLedgerModules(ctx, {
    myScopes: async () => [...(await loadGroups()).map((g) => ({ scope: { kind: "group" as const, id: g.id }, name: g.name })), ...(await myActivityScopes().catch(() => []))],
    groupActivities,
    activityParticipants: (id) => activityModules.participantsOf(id),
    groupMembers: async (groupId) => {
      const [rows, me] = await Promise.all([loadMemberships(groupId), loadAccess(groupId)]);
      return rows.filter((m) => m.state === "ACTIVE").map((m) => ({ actorId: m.actorId, name: m.displayName ?? "", me: m.actorId === me?.actorId }));
    },
    scopeName,
  });
  const lendingModules = createLendingModules(ctx);
  const goalModules = createGoalModules(ctx);

  /** Exit / removal / deletion: forget every cached record of the group. */
  const forgetGroup = (groupId: string) => {
    groups.delete(groupId);
    access.delete(groupId);
    memberships.delete(groupId);
    exitChecks.delete(groupId);
    revisions.drop(`group:${groupId}`);
  };
  const exitCheck = async (groupId: string) => {
    const { data } = await call(() => api.request("get", "/api/v1/social-groups/{id}/exit-check", { path: { id: groupId } }));
    exitChecks.set(groupId, data);
    return data;
  };

  const sendInvitations = async (groupId: string, personIds: string[]) => {
    const links = [];
    for (const personId of personIds) {
      const userId = people.apiId(personId);
      const { data } = await intents.run(`group-invite:${groupId}:${userId}`, (key) =>
        call(() => api.request("post", "/api/v1/social-groups/{id}/invitations", { path: { id: groupId }, header: { "Idempotency-Key": key }, body: { kind: "MEMBERSHIP", memberRole: "MEMBER", recipient: { userId } } })),
      );
      // An idempotent retry may return proof:null — never a usable link (no proof-retrieval API).
      // The proof is valid only with the revision issued alongside it (any re-issue rotates both), so both travel in the fragment.
      links.push({
        inviteId: data.invitation.id,
        href: data.proof ? `/social/invitations/${encodeURIComponent(data.invitation.id)}#proof=${encodeURIComponent(data.proof)}&rev=${data.invitation.revision}` : null,
      });
    }
    return links;
  };

  const noticeHref = (n: { kind: string; activityId: string | null; groupId: string | null; resourceId: string }) => {
    const enc = encodeURIComponent;
    const ledgerBase = n.activityId ? `/social/activities/${enc(n.activityId)}/expenses` : n.groupId ? `/social/groups/${enc(n.groupId)}/expenses` : "/social/balances";
    if (n.kind.startsWith("EXPENSE_")) return `${ledgerBase}/${enc(n.resourceId)}`;
    if (n.kind.startsWith("SETTLEMENT_")) return `${ledgerBase}/settle`;
    if (n.kind.startsWith("LOAN_") || n.kind.startsWith("CLAIM_")) return "/social/lending";
    if (n.kind.startsWith("GOAL_")) return n.groupId ? `/social/groups/${enc(n.groupId)}/challenges` : n.activityId ? `/social/activities/${enc(n.activityId)}/goals` : "/social";
    if (n.activityId) return `/social/activities/${enc(n.activityId)}`;
    return "/social";
  };
  const loadNotices = async () => call(() => all((after) => api.request("get", "/api/v1/social-notices", { query: pageQuery(after) }).then((r) => r.data)));

  const repo: SocialRepository = {
    connections: {
      async list() {
        const [items, circles] = await Promise.all([loadConnections(), repo.circles.list()]);
        const labels = new Map<string, string[]>();
        for (const circle of circles) {
          const rows = await call(() => all((after) => api.request("get", "/api/v1/social/circles/{id}/members", { path: { id: circle.id }, query: pageQuery(after) }).then((r) => r.data)));
          for (const row of rows) labels.set(row.connectionId, [...(labels.get(row.connectionId) ?? []), circle.id]);
        }
        return items
          .filter((c) => c.state === "ACCEPTED")
          .map((c): Connection => ({ person: people.person(other(c)), since: c.updatedAt.slice(0, 10), circleIds: labels.get(c.id) ?? [], sharedGroups: null }));
      },
      async requests() {
        const items = await loadConnections();
        return items
          .filter((c) => c.state === "PENDING")
          .map((c): ConnectionRequest => ({ id: c.id, person: people.person(other(c)), direction: c.requesterUserId === user.id ? "outgoing" : "incoming", note: "", at: c.createdAt, mutualGroups: null }));
      },
      async request(contact) {
        // Exact verified email only; an empty result looks exactly like a sent request (no account-existence diagnostic).
        const email = contact.trim();
        if (!email.includes("@")) throw new SocialError("invalid", "discovery accepts an exact email only (no phone)");
        const { data } = await call(() => api.request("post", "/api/v1/social/discovery", { body: { email } }));
        const target = data.items[0];
        if (target) {
          await intents
            .run(`connect:${target.id}`, (key) => call(() => api.request("post", "/api/v1/social/connections", { header: { "Idempotency-Key": key }, body: { id: uuid(), recipientUserId: target.id } })))
            .catch((error) => {
              if (!(error instanceof SocialError && error.code === "conflict")) throw error;
            });
        }
        return { sent: true };
      },
      accept: async (id) => transition(await connectionById(id), "accept"),
      ignore: async (id) => transition(await connectionById(id), "decline"),
      cancel: async (id) => transition(await connectionById(id), "cancel"),
      remove: async (personId) => transition(await connectionFor(personId), "remove"),
      async block(personId) {
        const userId = people.apiId(personId);
        // A new block starts from the absent block's revision 1 (P6-01 handoff §7).
        await intents.run(`block:${userId}`, (key) => call(() => api.request("post", "/api/v1/social/blocks", { header: { "If-Match": tag(1), "Idempotency-Key": key }, body: { targetUserId: userId } })));
      },
      async privacy() {
        const { data } = await call(() => api.request("get", "/api/v1/social/privacy"));
        privacyRevision = data.revision;
        return data.allowFriendRequests ? "everyone" : "nobody";
      },
      async setPrivacy(value: RequestPrivacy) {
        if (value === "groups") fail(SOCIAL_GAPS.privacyGroups);
        if (privacyRevision === null) await repo.connections.privacy();
        const { data } = await intents.run(`privacy:${value}`, (key) =>
          call(() => api.request("patch", "/api/v1/social/privacy", { header: { "If-Match": tag(privacyRevision!), "Idempotency-Key": key }, body: { allowFriendRequests: value === "everyone" } })),
        );
        privacyRevision = data.revision;
      },
    },
    circles: {
      async list() {
        const items = await call(() => all((after) => api.request("get", "/api/v1/social/circles", { query: pageQuery(after) }).then((r) => r.data)));
        for (const c of items) revisions.put(`circle:${c.id}`, c.revision);
        return items.map((c): Circle => ({ id: c.id, name: c.name }));
      },
      async create(name) {
        if (!name.trim()) throw new SocialError("invalid");
        const id = uuid();
        const { data } = await intents.run(`circle:${id}`, (key) => call(() => api.request("post", "/api/v1/social/circles", { header: { "Idempotency-Key": key }, body: { id, name: name.trim() } })));
        revisions.set(`circle:${data.id}`, data.revision);
        return { id: data.id, name: data.name };
      },
      async rename(circleId, name) {
        if (!name.trim()) throw new SocialError("invalid");
        const revision = await circleRevision(circleId);
        const { data } = await intents.run(`circle-rename:${circleId}:${revision}`, (key) =>
          call(() => api.request("patch", "/api/v1/social/circles/{id}", { path: { id: circleId }, header: { "If-Match": tag(revision), "Idempotency-Key": key }, body: { name: name.trim() } })),
        );
        revisions.set(`circle:${circleId}`, data.revision);
      },
      async remove(circleId) {
        const revision = await circleRevision(circleId);
        await intents.run(`circle-delete:${circleId}`, (key) =>
          call(() => api.request("delete", "/api/v1/social/circles/{id}", { path: { id: circleId }, header: { "If-Match": tag(revision), "Idempotency-Key": key } })),
        );
        revisions.drop(`circle:${circleId}`);
      },
      async setMembership(circleId, personId, member) {
        const connection = await connectionFor(personId);
        const revision = await circleRevision(circleId);
        await intents.run(`circle-member:${circleId}:${connection.id}:${member}`, (key) => {
          const init = { path: { id: circleId, connectionId: connection.id }, header: { "If-Match": tag(revision), "Idempotency-Key": key } };
          return call(() => (member ? api.request("put", "/api/v1/social/circles/{id}/members/{connectionId}", init) : api.request("delete", "/api/v1/social/circles/{id}/members/{connectionId}", init)));
        });
        // Label commands do not return the refreshed Circle revision: refetch before the next one.
        revisions.drop(`circle:${circleId}`);
      },
    },
    groups: {
      async directory() {
        const items = await loadGroups();
        const rows = await Promise.all(
          items.map(async (g) => {
            const a = await loadAccess(g.id);
            const caps = capabilities(a);
            const [members, pending] = await Promise.all([loadMemberships(g.id).catch(() => null), caps.decideJoins ? loadJoinRequests(g.id).catch(() => []) : Promise.resolve([])]);
            return summary(g, a, members ? members.filter((m) => m.state === "ACTIVE").length : null, pending.length);
          }),
        );
        return {
          groups: rows.sort((a, b) => a.name.localeCompare(b.name)),
          incomingRequests: (await repo.connections.requests()).filter((r) => r.direction === "incoming").length,
          joinRequestsPending: [...myJoin.entries()].filter(([, r]) => r.state === "PENDING").map(([groupId]) => ({ groupId, groupName: previews.get(groupId)?.name ?? "" })),
        };
      },
      async access(groupId): Promise<GroupAccess> {
        const a = await loadAccess(groupId);
        if (a) return { kind: "member", group: await detail(await loadGroup(groupId), a) };
        const mine = myJoin.get(groupId);
        const preview = previews.get(groupId);
        if (mine?.state === "PENDING" && preview) return { kind: "join-requested", preview: { ...preview, requested: true } };
        // A former member with an open balance keeps own-obligation access (P6-06).
        const own = await ledger.ownBalance({ kind: "group", id: groupId });
        if (own && own.mine.net !== 0) return { kind: "left", groupName: "", openBalance: true };
        return { kind: "not-available" };
      },
      async discover(query, topic) {
        if (topic !== "all") fail(SOCIAL_GAPS.topic);
        const q = query.trim().toLocaleLowerCase();
        return (await loadPreviews()).filter((p) => !q || p.name.toLocaleLowerCase().includes(q) || p.description.toLocaleLowerCase().includes(q));
      },
      async requestJoin(groupId) {
        const id = uuid();
        const { data } = await intents.run(`join-request:${groupId}`, (key) => call(() => api.request("post", "/api/v1/social-groups/{id}/join-requests", { path: { id: groupId }, header: { "Idempotency-Key": key }, body: { id } })));
        myJoin.set(groupId, data);
        const preview = previews.get(groupId);
        if (preview) previews.set(groupId, { ...preview, requested: true });
      },
      async cancelJoin(groupId) {
        const mine = myJoin.get(groupId);
        if (!mine) fail("the applicant's own pending request id is known only for requests sent in this session (no own-request list)");
        const { data } = await call(() =>
          api.request("post", "/api/v1/social-groups/{id}/join-requests/{requestId}/{action}", { path: { id: groupId, requestId: mine!.id, action: "cancel" }, header: { "If-Match": tag(mine!.revision) } }),
        );
        myJoin.set(groupId, data);
      },
      async joinRequests(groupId) {
        const caps = capabilities(access.get(groupId) ?? (await loadAccess(groupId)));
        if (!caps.decideJoins) throw new SocialError("forbidden");
        const rows = await loadJoinRequests(groupId);
        return rows.map((r): JoinRequest => ({ id: r.id, groupId, person: people.person(r.requesterUserId), note: "", at: null }));
      },
      async decide(requestId, approve) {
        const r = joinRequests.get(requestId);
        if (!r) throw new SocialError("not-found");
        const { data } = await call(() =>
          api.request("post", "/api/v1/social-groups/{id}/join-requests/{requestId}/{action}", { path: { id: r.groupId, requestId, action: approve ? "approve" : "reject" }, header: { "If-Match": tag(r.revision) } }),
        );
        joinRequests.set(requestId, data);
      },
      async create(input) {
        const retentionPolicyVersion = await retentionVersion(client, "SOCIAL_GROUP");
        const id = uuid();
        const discoverable = input.visibility === "discoverable";
        const { data } = await intents.run(`group:${input.clientOpId}`, (key) =>
          call(() =>
            api.request("post", "/api/v1/social-groups", {
              header: { "Idempotency-Key": key },
              body: {
                id,
                name: input.name.trim(),
                description: input.description.trim() || null,
                // The public preview is only what the owner chose to make discoverable.
                ...(discoverable && input.description.trim() ? { publicSummary: input.description.trim() } : {}),
                discoverable,
                retentionPolicyVersion,
              },
            }),
          ),
        );
        groups.set(data.id, data as ApiGroup);
        // Invitations carry a private proof the inviter hands over: they are sent from Members (links shown there).
        return data.id;
      },
      async events(groupId) {
        const rows = await call(() => all((after) => api.request("get", "/api/v1/social-groups/{id}/history", { path: { id: groupId }, query: pageQuery(after) }).then((r) => r.data)));
        return rows
          .filter((r) => HISTORY_KIND[r.action])
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          .map((r): GroupEvent => ({ id: r.id, kind: HISTORY_KIND[r.action]!, actor: { id: r.actorId, name: r.actorDisplayName ?? "", initials: initials(r.actorDisplayName ?? "") }, subject: "", at: r.occurredAt }));
      },
      invites: refuse(SOCIAL_GAPS.invites),
      async invite(groupId, personIds) {
        await sendInvitations(groupId, personIds);
      },
      async cancelInvite(groupId, inviteId) {
        const { data } = await call(() => api.request("get", "/api/v1/social-groups/{id}/invitations/{offerId}", { path: { id: groupId, offerId: inviteId } }));
        await call(() => api.request("post", "/api/v1/social-groups/{id}/invitations/{offerId}/revoke", { path: { id: groupId, offerId: inviteId }, header: { "If-Match": tag(data.revision) } }));
      },
      resendInvite: refuse(SOCIAL_GAPS.invites),
      async setRole(groupId, personId, value) {
        const m = await membershipOf(groupId, personId);
        await call(() =>
          api.request("patch", "/api/v1/social-groups/{id}/memberships/{accessId}", { path: { id: groupId, accessId: m.id }, header: { "If-Match": tag(m.revision) }, body: { state: "ACTIVE", memberRole: value === "admin" ? "ADMIN" : "MEMBER" } }),
        );
        memberships.delete(groupId);
      },
      async removeMember(groupId, personId) {
        const m = await membershipOf(groupId, personId);
        await call(() =>
          api.request("patch", "/api/v1/social-groups/{id}/memberships/{accessId}", { path: { id: groupId, accessId: m.id }, header: { "If-Match": tag(m.revision) }, body: { state: "REVOKED", memberRole: m.memberRole ?? "MEMBER" } }),
        );
        memberships.delete(groupId);
      },
      async transferOwnership(groupId, personId) {
        await repo.handovers.start(groupId, personId);
      },
      async updateSettings(groupId, patch) {
        const g = groups.get(groupId) ?? (await loadGroup(groupId));
        const { name, description, visibility, ...rest } = patch;
        const changed = Object.entries(rest).filter(([k, v]) => v !== undefined && v !== (DEFAULT_SETTINGS as Record<string, unknown>)[k] && !(k === "rules" && v === "") && !(k === "currency" && v === LEDGER_CURRENCY));
        if (changed.length > 0) fail(SOCIAL_GAPS.settings);
        const { data } = await call(() =>
          api.request("patch", "/api/v1/social-groups/{id}", {
            path: { id: groupId },
            header: { "If-Match": tag(g.revision) },
            body: { ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}), ...(visibility !== undefined ? { discoverable: visibility === "discoverable" } : {}) },
          }),
        );
        groups.set(groupId, data);
      },
      setMyStatus: refuse(SOCIAL_GAPS.status),
      leaveChecklist: refuse(SOCIAL_GAPS.leaveChecklist),
      async leave(groupId) {
        // Without obligations only; with obligations the exit flow asks for the explicit second confirmation.
        const check = await exitCheck(groupId);
        if (check.obligations.length > 0) throw new SocialError("conflict", "OUTSTANDING_BALANCE_CONFIRMATION_REQUIRED", "OUTSTANDING_BALANCE_CONFIRMATION_REQUIRED");
        await repo.exit.leave(groupId, null);
      },
      deleteGroup: refuse("deleting a group needs the owner's password (exit.deleteGroup)"),
      chatMembers: refuse(SOCIAL_GAPS.chat),
      async openChat(groupId) {
        const read = async () => (await call(() => api.request("get", "/api/v1/social-groups/{id}/conversation", { path: { id: groupId } }))).data;
        let chat = await read();
        if (!chat.conversationId) {
          // Only an Owner/Admin opens it; members wait (never guessed, never a mock fallback).
          if (!chat.canOpen) throw new SocialError("conflict", "CONVERSATION_NOT_OPEN", "CONVERSATION_NOT_OPEN");
          const retentionPolicyVersion = await retentionVersion(client, "CONVERSATION");
          const g = await loadGroup(groupId);
          try {
            const { data } = await intents.run(`group-chat-open:${groupId}`, (key) =>
              call(() =>
                api.request("post", "/api/v1/social-groups/{id}/conversation/open", {
                  path: { id: groupId },
                  header: { "If-Match": tag(g.revision), "Idempotency-Key": key },
                  body: { id: uuid(), retentionPolicyVersion },
                }),
              ),
            );
            chat = data;
          } catch (error) {
            // Another admin is opening it, or the group changed: the server state decides.
            if (!(error instanceof SocialError && error.code === "conflict")) throw error;
            chat = await read();
          }
          // The open bumps the group revision.
          groups.delete(groupId);
          if (!chat.conversationId) throw new SocialError("conflict", "CONVERSATION_OPEN_IN_PROGRESS", "CONVERSATION_OPEN_IN_PROGRESS");
        }
        const conversationId = chat.conversationId;
        // Join is the authority check; an already-current member keeps the same conversation.
        try {
          await intents.run(`group-chat-join:${groupId}:${conversationId}`, (key) =>
            call(() => api.request("post", "/api/v1/social-groups/{id}/conversation/join", { path: { id: groupId }, header: { "Idempotency-Key": key }, body: {} })),
          );
        } catch (error) {
          if (!(error instanceof SocialError && error.reason === "ALREADY_PARTICIPATING")) throw error;
        }
        return conversationId;
      },
    },
    activities: activityModules.activities,
    checklist: activityModules.checklist,
    polls: activityModules.polls,
    freeBusy: activityModules.freeBusy,
    activityAdmin: activityModules.activityAdmin,
    files: refused(SOCIAL_GAPS.files),
    expenses: ledger.expenses,
    balances: ledger.balances,
    settlements: ledger.settlements,
    finance: ledger.finance,
    lending: lendingModules.lending,
    lostFound: lendingModules.lostFound,
    lendingServer: lendingModules.lendingServer,
    albums: refused(SOCIAL_GAPS.albums),
    challenges: goalModules.challenges,
    goals: goalModules.goals,
    inbox: {
      async list() {
        const items: NeedsYouItem[] = (await repo.connections.requests())
          .filter((r) => r.direction === "incoming")
          .map((r) => ({ id: `n-${r.id}`, kind: "connection", person: r.person, subject: "", scopeName: "", href: "/social/connections", money: null }));
        for (const g of groups.values()) {
          if (!capabilities(access.get(g.id) ?? null).decideJoins) continue;
          for (const r of await loadJoinRequests(g.id).catch(() => [])) items.push({ id: `n-${r.id}`, kind: "join-request", person: people.person(r.requesterUserId), subject: "", scopeName: g.name, href: `/social/groups/${encodeURIComponent(g.id)}/members`, money: null });
        }
        const action: Record<string, NeedsYouItem["kind"]> = { ACTIVITY_INVITED: "rsvp", SEAT_OFFERED: "rsvp", EXPENSE_PROPOSED: "approve-expense", SETTLEMENT_RECORDED: "payment", LOAN_REQUESTED: "overdue", LOAN_RETURN_REQUESTED: "overdue" };
        for (const n of await loadNotices().catch(() => [])) {
          const kind = action[n.kind];
          if (kind && !n.readAt) items.push({ id: `notice-${n.id}`, kind, person: null, subject: "", scopeName: await groupName(n.groupId), href: noticeHref(n), money: null });
        }
        return items;
      },
    },
    blocks: {
      async list() {
        const rows = await call(() => all((after) => api.request("get", "/api/v1/social/blocks", { query: pageQuery(after) }).then((r) => r.data)));
        return rows.filter((b) => b.id && b.active).map((b) => {
          revisions.set(`block:${b.id}`, b.revision);
          return { id: b.id!, active: b.active };
        });
      },
      async unblock(blockId) {
        const revision = revisions.get(`block:${blockId}`);
        if (revision === undefined) throw new SocialError("not-found");
        await intents.run(`unblock:${blockId}:${revision}`, (key) =>
          call(() => api.request("post", "/api/v1/social/blocks/{id}/unblock", { path: { id: blockId }, header: { "If-Match": tag(revision), "Idempotency-Key": key }, body: {} })),
        );
        revisions.drop(`block:${blockId}`);
      },
    },
    invitations: {
      send: sendInvitations,
      async pending(after) {
        const { data } = await call(() => api.request("get", "/api/v1/social-group-invitations", { query: { limit: 25, ...(after ? { after } : {}) } }));
        return {
          items: data.items.map((item) => ({
            id: item.id,
            revision: item.revision,
            expiresAt: item.expiresAt,
            groupId: item.notification?.targetId ?? null,
            groupName: item.notification?.targetDisplayName ?? null,
            inviterName: item.notification?.inviterDisplayName?.trim() || null,
            role: item.notification?.role ?? null,
            createdAt: item.notification?.createdAt ?? null,
            readAt: item.notification?.readAt ?? null,
          })),
          next: data.nextCursor ?? null,
        };
      },
      async answerPending(invitation, accept) {
        if (!Number.isSafeInteger(invitation.revision) || invitation.revision < 1) throw new SocialError("invalid");
        // A fresh proof for the revision I saw (rotates earlier proofs, marks the notification read).
        const { data } = await call(() =>
          api.request("post", "/api/v1/social-group-invitations/{id}/proof", { path: { id: invitation.id }, header: { "If-Match": tag(invitation.revision) }, body: {} }),
        );
        return respondWithProof(invitation.id, data.proof, data.revision, accept);
      },
      async preview(invitationId, proof) {
        void invitationId;
        const { data } = await call(() => api.request("get", "/api/v1/social-group-invitations/preview", { header: { "X-Invitation-Proof": proof } }));
        return { contextLabel: data.contextLabel, expiresAt: data.expiresAt };
      },
      async respond(invitationId, proof, revision, accept) {
        if (!Number.isSafeInteger(revision) || revision < 1) throw new SocialError("invalid", "INVITATION_LINK_INCOMPLETE", "INVITATION_LINK_INCOMPLETE");
        return respondWithProof(invitationId, proof, revision, accept);
      },
    },
    handovers: {
      async start(groupId, personId) {
        const m = await membershipOf(groupId, personId);
        const { data } = await intents.run(`handover:${groupId}:${m.id}`, (key) =>
          call(() => api.request("post", "/api/v1/social-groups/{id}/handovers", { path: { id: groupId }, header: { "Idempotency-Key": key }, body: { successorAccessId: m.id } })),
        );
        handovers.set(data.id, data);
        return { handoverId: data.id, href: `/social/groups/${encodeURIComponent(groupId)}?handover=${encodeURIComponent(data.id)}` };
      },
      async get(groupId, handoverId) {
        const [{ data }, a] = await Promise.all([call(() => api.request("get", "/api/v1/social-groups/{id}/handovers/{handoverId}", { path: { id: groupId, handoverId } })), loadAccess(groupId)]);
        handovers.set(data.id, data);
        return { id: data.id, groupId, state: data.state.toLowerCase() as "pending", expiresAt: data.expiresAt, toMe: a?.accessId === data.toAccessId, fromMe: a?.accessId === data.fromAccessId };
      },
      async respond(groupId, handoverId, action, password) {
        const h = handovers.get(handoverId) ?? (await repo.handovers.get(groupId, handoverId), handovers.get(handoverId)!);
        const header = { "If-Match": tag(h.revision) };
        const path = { id: groupId, handoverId };
        if (action === "accept") {
          if (!password) throw new SocialError("invalid", "PASSWORD_REQUIRED", "PASSWORD_REQUIRED");
          await call(() => api.request("post", "/api/v1/social-groups/{id}/handovers/{handoverId}/accept", { path, header, body: { password } }));
        } else if (action === "decline") await call(() => api.request("post", "/api/v1/social-groups/{id}/handovers/{handoverId}/decline", { path, header, body: {} }));
        else await call(() => api.request("post", "/api/v1/social-groups/{id}/handovers/{handoverId}/revoke", { path, header, body: {} }));
        handovers.delete(handoverId);
        forgetGroup(groupId);
      },
    },
    notices: {
      async list() {
        const rows = await loadNotices();
        return rows
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((n): SocialNotice => ({ id: n.id, kind: n.kind, href: noticeHref(n), at: n.createdAt, read: n.readAt !== null }));
      },
      async read(noticeId) {
        await intents.run(`notice-read:${noticeId}`, (key) => call(() => api.request("post", "/api/v1/social-notices/{id}/read", { path: { id: noticeId }, header: { "Idempotency-Key": key }, body: {} })));
      },
    },
    exit: {
      async check(groupId) {
        const data = await exitCheck(groupId);
        return {
          groupId,
          obligations: data.obligations.map((o) => {
            let currency: string = o.currency;
            try {
              currency = currencyFromApi(o.currency);
            } catch {
              // shown with its ISO code
            }
            return { ledger: { kind: o.ledgerKind === "GROUP" ? "group" : "activity", id: o.ledgerId }, currency, net: /^-?\d+$/.test(o.netMinor) ? minorFromApi(o.netMinor) : null };
          }),
          departureConfirmation: data.departureConfirmation,
          deletion: data.deletion ? { outstandingLedgerCount: data.deletion.outstandingLedgerCount, outstandingPartyCount: data.deletion.outstandingPartyCount, confirmation: data.deletion.confirmation } : null,
        };
      },
      async leave(groupId, confirmation) {
        const check = exitChecks.get(groupId) ?? (await exitCheck(groupId));
        await call(() =>
          api.request("post", "/api/v1/social-groups/{id}/leave", {
            path: { id: groupId },
            header: { "If-Match": tag(check.membershipRevision) },
            body: confirmation ? { outstandingBalanceConfirmation: confirmation } : {},
          }),
        ).finally(() => exitChecks.delete(groupId));
        forgetGroup(groupId);
      },
      async deleteGroup(groupId, password, confirmation) {
        const check = await exitCheck(groupId);
        if (!check.deletion) throw new SocialError("forbidden");
        if (!password) throw new SocialError("invalid", "PASSWORD_REQUIRED", "PASSWORD_REQUIRED");
        await call(() =>
          api.request("post", "/api/v1/social-groups/{id}/delete", {
            path: { id: groupId },
            header: { "If-Match": tag(check.deletion!.groupRevision) },
            body: { password, ...(confirmation ? { outstandingBalanceConfirmation: confirmation } : {}) },
          }),
        );
        forgetGroup(groupId);
      },
      async lifecycle(groupId) {
        const { data } = await call(() => api.request("get", "/api/v1/social-groups/{id}/lifecycle-job", { path: { id: groupId } }));
        revisions.set(`group:${groupId}:job`, data.revision);
        return {
          state: data.state,
          recoveryDeadline: data.recoveryDeadline,
          failureCode: data.failureCode,
          recoverable: (data.state === "CLOSING_GRACE" || data.state === "OWNER_EXIT_FROZEN") && Date.parse(data.recoveryDeadline) > Date.now(),
        };
      },
      async recover(groupId, password) {
        if (!password) throw new SocialError("invalid", "PASSWORD_REQUIRED", "PASSWORD_REQUIRED");
        const { data: job } = await call(() => api.request("get", "/api/v1/social-groups/{id}/lifecycle-job", { path: { id: groupId } }));
        const { data: proof } = await call(() =>
          api.request("post", "/api/v1/social-groups/{id}/lifecycle-job/recovery-proof", { path: { id: groupId }, header: { "If-Match": tag(job.revision) }, body: { password } }),
        );
        // The proof stays in this call: never cached, stored or logged.
        await call(() =>
          api.request("post", "/api/v1/social-groups/{id}/lifecycle-job/recover", {
            path: { id: groupId },
            header: { "If-Match": tag(proof.revision), "X-Deletion-Recovery": proof.proof },
            body: { password, generation: proof.generation },
          }),
        );
        forgetGroup(groupId);
      },
      ownObligations: (groupId) => ledger.ownBalance({ kind: "group", id: groupId }),
    },
  };
  return repo;
}

/** Live mode without a signed-in session: every call fails, nothing is shown. */
export function createUnavailableSocial(): SocialRepository {
  const reason = "no signed-in session";
  return new Proxy({} as SocialRepository, { get: (_, name) => (typeof name === "string" && name !== "then" ? refused(reason) : undefined) });
}
