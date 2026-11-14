import { newIdempotencyKey, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-companies";
import { addDaysToDay, dayOfInstant } from "@/lib/dates/clock-time";
import { getJalaliParts } from "@/lib/dates/jalali";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import { newDate as jalaliDate } from "date-fns-jalali";
import type { CapacityHeat, CompanyCurrency, CompanyGoal, CompanyGrantKind, CompanyInvitation, CompanyRoom, CompanySettings, Department, MovePreview } from "../company-domain";
import type { CompanyRepository } from "../company-repositories";
import { RepositoryError } from "../repositories";
import { conflictAware, initialsOf } from "./api-project-shared";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";
import { localInstant } from "./api-tasks-repository";

/*
 * Companies over the 1,045-op contract (closure batch): fixed currency, legal
 * name and fiscal month (OD-9/F1), unit move between departments with preview
 * (OD-5: Company → Department → Unit only), rooms with optional private /
 * shared booking titles and the utilization heat (OD-3), company goals with key
 * results (OD-2), and invitations with the recipient's in-app proof (OD-4).
 */

type Client = ApiClientFor<paths>;
type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiCompany = Data<"/api/v1/companies/{id}", "get">;
type ApiDepartment = Data<"/api/v1/companies/{id}/departments", "get">["items"][number];
type ApiMember = Data<"/api/v1/companies/{id}/contexts/{scopeId}/members", "get">["items"][number];
type ApiMe = Data<"/api/v1/companies/{id}/contexts/{scopeId}/access/me", "get">;
type ApiGoal = Data<"/api/v1/companies/{id}/contexts/{scopeId}/goals", "get">["items"][number];
type ApiRoom = Data<"/api/v1/companies/{id}/contexts/{scopeId}/rooms", "get">["items"][number];

export interface CompletionDeps {
  read: (id: string) => Promise<{ company: ApiCompany; tag: string }>;
  structure: (id: string) => Promise<ApiDepartment[]>;
  members: (id: string, scopeId: string) => Promise<ApiMember[]>;
  me: (id: string, scopeId: string) => Promise<ApiMe>;
  departments: (id: string) => Promise<Department[]>;
}

const PAGE = 100;
/** ISO currency ⇄ the screen's choices: Toman and Rial both store IRR (Toman is a display unit), read back as Rial. */
const CURRENCY_TO_API: Record<CompanyCurrency, string> = { toman: "IRR", rial: "IRR", usd: "USD", eur: "EUR" };
const CURRENCY: Readonly<Record<string, CompanyCurrency>> = { IRR: "rial", USD: "usd", EUR: "eur" };

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => dayOfInstant(new Date().toISOString());

/** The Jalali quarter label ("1405 Q4") and Gregorian bounds of a day. */
function quarterOf(day: string): { label: string; start: string; end: string } {
  const { year, month } = getJalaliParts(new Date(`${day}T12:00:00`));
  const q = Math.ceil(month / 3);
  const start = iso(jalaliDate(year, (q - 1) * 3, 1));
  const next = q === 4 ? jalaliDate(year + 1, 0, 1) : jalaliDate(year, q * 3, 1);
  return { label: `${year} Q${q}`, start, end: addDaysToDay(iso(next), -1) };
}

export function createCompanyCompletion(api: Client, deps: CompletionDeps): Partial<CompanyRepository> {
  const root = async (id: string) => (await deps.read(id)).company.scopeId;
  const readSettings = async (id: string) => (await api.request("get", "/api/v1/companies/{id}/settings", { path: { id } })).data;

  // Time-boxed HR / finance / security grants: only the Company Owner reads and issues them (others: empty list).
  const grantsOf = (id: string) =>
    api.request("get", "/api/v1/companies/{id}/employee-grants", { path: { id } }).then(
      (response) => response.data.items.filter((grant) => grant.revokedAt === null && Date.parse(grant.expiresAt) > Date.now()),
      () => [] as Data<"/api/v1/companies/{id}/employee-grants", "get">["items"],
    );
  /** A handover started in this session (the contract has no list of pending handovers). */
  const handovers = new Map<string, { toName: string }>();

  async function settings(id: string): Promise<CompanySettings> {
    const [{ company }, row, grants] = await Promise.all([deps.read(id), readSettings(id), grantsOf(id)]);
    const members = await deps.members(id, company.scopeId);
    return {
      name: company.title,
      legalName: row.legalName ?? "",
      currency: row.currency ? (CURRENCY[row.currency] ?? null) : null,
      currencyLocked: row.currencyLocked,
      fiscalStartMonth: row.fiscalStartMonth ?? null,
      // Capability rules are a different model (no named values / levels): not listed here.
      policies: [],
      // The grant's last day is the day before its expiry instant (local midnight).
      grants: grants.map((grant) => ({
        kind: grant.kind.toLowerCase() as CompanyGrantKind,
        personId: grant.grantee.accessId,
        until: dayOfInstant(new Date(Date.parse(grant.expiresAt) - 1).toISOString()),
        personName: grant.grantee.displayName ?? members.find((member) => member.id === grant.grantee.accessId)?.displayName ?? "",
      })),
      eligibleOwners: members
        .filter((member) => member.state === "ACTIVE" && member.role === "ORG_ADMIN")
        .map((member) => ({ id: member.id, name: member.displayName ?? "", initials: initialsOf(member.displayName ?? "") })),
      transfer: handovers.has(id) ? { toName: handovers.get(id)!.toName, status: "pending" } : null,
      // CB-8: ownership-handovers takes no password; the screen never asks for one it cannot check.
      transferReauth: false,
      // No COMPANY retention policy is approved yet (legal review).
      retentionYears: null,
    };
  }

  // ── Rooms ──
  const roomScope = new Map<string, string>();
  async function roomsOf(id: string, day: string): Promise<CompanyRoom[]> {
    const scopes = [await root(id), ...(await deps.structure(id)).map((department) => department.scopeId)];
    const rooms: CompanyRoom[] = [];
    for (const scopeId of scopes) {
      const items = await api
        .request("get", "/api/v1/companies/{id}/contexts/{scopeId}/rooms", { path: { id, scopeId }, query: { day, timezone: getPlannerTimeZone() } })
        .then((response) => response.data.items, () => [] as ApiRoom[]);
      for (const room of items) {
        if (roomScope.has(room.id) && scopes.indexOf(roomScope.get(room.id)!) < scopes.indexOf(scopeId)) continue;
        roomScope.set(room.id, scopeId);
        rooms.push({
          id: room.id,
          name: room.name,
          seats: room.seats ?? 0,
          floor: room.floor ?? "",
          bookings: room.bookings.map((booking) => ({ id: booking.id, from: booking.from, to: booking.to, title: booking.title, mine: booking.mine })),
        });
      }
    }
    return rooms;
  }

  // ── Goals ──
  const goalScope = new Map<string, string>();
  function toGoal(goal: ApiGoal, departmentOf: Map<string, ApiDepartment>, rootScope: string, me: ApiMe): CompanyGoal {
    const department = departmentOf.get(goal.scopeId) ?? null;
    goalScope.set(goal.id, goal.scopeId);
    const ownerName = goal.owner.displayName ?? "";
    return {
      id: goal.id,
      level: goal.scopeId === rootScope ? "company" : "department",
      parentId: goal.parentId,
      departmentId: department?.id ?? null,
      departmentName: department?.title ?? null,
      title: goal.title,
      ownerId: goal.owner.accessId,
      ownerName,
      quarter: quarterOf(goal.startDate).label,
      progress: goal.progress ?? 0,
      onPace: goal.pace !== "BEHIND",
      keyResults: goal.keyResults
        .filter((kr) => !kr.archived)
        .map((kr) => ({
          id: kr.id,
          title: kr.title,
          current: Number(kr.currentValue ?? kr.startValue),
          target: Number(kr.targetValue),
          unit: kr.unit ?? "",
          source: { kind: "manual" as const, by: goal.owner.accessId === me.accessId ? ownerName : "", at: kr.updatedAt },
        })),
      // Goal ⇄ work links are not part of the company goal contract.
      links: [],
    };
  }
  async function allGoals(id: string): Promise<CompanyGoal[]> {
    const [{ company }, departments] = await Promise.all([deps.read(id), deps.structure(id)]);
    const departmentOf = new Map(departments.map((department) => [department.scopeId, department]));
    const goals: CompanyGoal[] = [];
    for (const scopeId of [company.scopeId, ...departments.map((department) => department.scopeId)]) {
      let me: ApiMe;
      try {
        me = await deps.me(id, scopeId);
      } catch {
        continue; // a department the caller cannot open
      }
      const items = await pageAll<ApiGoal>(async (after) => (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/goals", { path: { id, scopeId }, query: { limit: PAGE, after } })).data);
      goals.push(...items.filter((goal) => goal.status !== "ABANDONED").map((goal) => toGoal(goal, departmentOf, company.scopeId, me)));
    }
    return goals;
  }

  // ── Invitations ──
  type Mine = Data<"/api/v1/company-invitations", "get">["items"][number];
  const mine = () => pageAll<Mine>(async (after) => (await api.request("get", "/api/v1/company-invitations", { query: { limit: PAGE, after } })).data);
  async function proofFor(invitationId: string) {
    const row = (await mine()).find((item) => item.id === invitationId);
    if (!row) throw new RepositoryError("not-found", "Invitation not found");
    const { data } = await api.request("post", "/api/v1/company-invitations/{invitationId}/proof", { path: { invitationId }, header: { "If-Match": revisionTag(row.revision) }, body: {} });
    return data;
  }

  return {
    settings: (id) => mapErrors(() => settings(id)),

    // Owner only (server-checked); a grant always expires and is never issued to oneself.
    setGrant: (id, personId, kind, until, on) =>
      mapErrors(async () => {
        const { company } = await deps.read(id);
        if (on) {
          if (!until) invalid("until-required");
          if (until! < today()) invalid("until-past");
          const [mine, roster] = await Promise.all([deps.me(id, company.scopeId), deps.members(id, company.scopeId)]);
          if (mine.accessId === personId) invalid("self-grant");
          const grantee = roster.find((member) => member.id === personId && member.state === "ACTIVE");
          if (!grantee) throw new RepositoryError("not-found", "Person not found");
          await api.request("post", "/api/v1/companies/{id}/employee-grants", {
            path: { id },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { id: crypto.randomUUID(), grantee: { accessId: grantee.id, generation: grantee.generation }, kind: kind.toUpperCase() as "HR" | "FINANCE" | "SECURITY", expiresAt: localInstant(addDaysToDay(until!, 1), "00:00") },
          });
        } else {
          const active = (await grantsOf(id)).filter((grant) => grant.grantee.accessId === personId && grant.kind === kind.toUpperCase());
          if (!active.length) throw new RepositoryError("not-found", "Grant not found");
          for (const grant of active) await api.request("post", "/api/v1/companies/{id}/employee-grants/{grantId}/revoke", { path: { id, grantId: grant.id }, body: {} });
        }
        return settings(id);
      }),

    // A pending handover to an eligible Org Admin; the successor accepts it. The contract takes no password (session authorization only).
    requestTransfer: (id, toPersonId) =>
      mapErrors(async () => {
        const { company } = await deps.read(id);
        const successor = (await deps.members(id, company.scopeId)).find((member) => member.id === toPersonId && member.state === "ACTIVE" && member.role === "ORG_ADMIN");
        if (!successor) invalid("not-eligible");
        await api.request("post", "/api/v1/companies/{id}/ownership-handovers", { path: { id }, header: { "Idempotency-Key": newIdempotencyKey() }, body: { successorAccessId: toPersonId } });
        handovers.set(id, { toName: successor!.displayName ?? "" });
        return settings(id);
      }),

    updateGeneral: (id, patch) =>
      mapErrors(async () => {
        if (!patch.name.trim()) invalid("A company needs a name");
        let current = await deps.read(id);
        if (patch.name.trim() !== current.company.title) {
          await conflictAware(() =>
            retryOnConflict(
              () => api.request("patch", "/api/v1/companies/{id}", { path: { id }, header: { "If-Match": current.tag }, body: { title: patch.name.trim() } }),
              async () => (current = await deps.read(id)),
            ),
          );
        }
        let row = await readSettings(id);
        if ((row.legalName ?? "") !== patch.legalName.trim() || (row.fiscalStartMonth ?? null) !== patch.fiscalStartMonth) {
          row = (
            await conflictAware(() =>
              api.request("put", "/api/v1/companies/{id}/settings/legal", {
                path: { id },
                header: { "If-Match": revisionTag(row.revision) },
                body: { legalName: patch.legalName.trim() || null, fiscalStartMonth: patch.fiscalStartMonth },
              }),
            )
          ).data;
        }
        const wanted = patch.currency ? CURRENCY_TO_API[patch.currency] : null;
        if (wanted && wanted !== row.currency) {
          // Locked after the first financial record: the server refuses (409) and the screen keeps the stored value.
          await conflictAware(() => api.request("put", "/api/v1/companies/{id}/settings/currency", { path: { id }, header: { "If-Match": revisionTag(row.revision) }, body: { currency: wanted } }));
        }
        return settings(id);
      }),

    // OD-5: only a unit moves, under another department of the same company (the preview's refusal explains anything else).
    previewMove: (id, departmentId, newParentId) =>
      mapErrors(async (): Promise<MovePreview> => {
        const departments = await deps.structure(id);
        const scopeOf = (contextId: string | null) => (contextId ? (departments.find((department) => department.id === contextId)?.scopeId ?? null) : null);
        const scopeId = scopeOf(departmentId);
        if (!scopeId) throw new RepositoryError("not-found", "Not found");
        const parentScope = scopeOf(newParentId);
        const { data } = await api.request("get", "/api/v1/companies/{id}/context-moves/preview", { path: { id }, query: { scopeId, ...(parentScope ? { parentId: parentScope } : {}) } });
        if (!data.allowed) throw new RepositoryError("invalid", data.refusal ?? "MOVE_REFUSED");
        // A budget is per currency: shown only when there is exactly one, never summed.
        return { departmentId, newParentId, people: data.people, teams: data.teams, budget: data.budgets.length === 1 ? Number(data.budgets[0]!.limit) : 0 };
      }),

    moveDepartment: (id, departmentId, newParentId) =>
      mapErrors(async () => {
        const departments = await deps.structure(id);
        const unit = departments.find((department) => department.id === departmentId);
        const parent = departments.find((department) => department.id === newParentId);
        if (!unit || !parent) invalid("MOVE_LEVEL_CHANGE");
        const { data: preview } = await api.request("get", "/api/v1/companies/{id}/context-moves/preview", { path: { id }, query: { scopeId: unit.scopeId, parentId: parent.scopeId } });
        if (!preview.allowed) throw new RepositoryError("invalid", preview.refusal ?? "MOVE_REFUSED");
        await conflictAware(() =>
          api.request("post", "/api/v1/companies/{id}/context-moves", {
            path: { id },
            header: { "If-Match": revisionTag(preview.revision) },
            body: { id: newIdempotencyKey(), scopeId: unit.scopeId, parentId: parent.scopeId },
          }),
        );
        return deps.departments(id);
      }),

    rooms: (id, day) => mapErrors(() => roomsOf(id, day)),

    // A booking is an allocation of the room resource for me; the optional title stays private (only the booker sees it).
    bookRoom: (id, input) =>
      mapErrors(async () => {
        if (!roomScope.has(input.roomId)) await roomsOf(id, input.day);
        const scopeId = roomScope.get(input.roomId);
        if (!scopeId) throw new RepositoryError("not-found", "Not found");
        if (input.to <= input.from) invalid("A booking ends after it starts");
        const me = await deps.me(id, scopeId);
        const { data: allocation } = await api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/resources/{resourceId}/allocations", {
          path: { id, scopeId, resourceId: input.roomId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newIdempotencyKey(), member: { accessId: me.accessId, generation: me.generation }, startAt: localInstant(input.day, input.from), endAt: localInstant(input.day, input.to) },
        });
        const title = input.title.trim();
        if (title) {
          // An unset title reads revision 1; the first write returns 2.
          await api.request("put", "/api/v1/companies/{id}/contexts/{scopeId}/allocations/{allocationId}/title", {
            path: { id, scopeId, allocationId: allocation.id },
            header: { "If-Match": revisionTag(1) },
            body: { title: title.slice(0, 120), shared: false },
          });
        }
        const room = (await roomsOf(id, input.day)).find((entry) => entry.id === input.roomId);
        if (!room) throw new RepositoryError("not-found", "Not found");
        return room;
      }),

    // Six Jalali months up to this one, as Gregorian ranges; basis points → percent; scopes without resources are left out.
    capacity: (id) =>
      mapErrors(async (): Promise<CapacityHeat> => {
        const { year, month } = getJalaliParts(new Date(`${today()}T12:00:00`));
        const months = Array.from({ length: 6 }, (_, index) => {
          const offset = month - 6 + index;
          const y = offset <= 0 ? year - 1 : year;
          const m = ((offset - 1 + 12) % 12) + 1;
          return { m, from: iso(jalaliDate(y, m - 1, 1)), to: addDaysToDay(iso(m === 12 ? jalaliDate(y + 1, 0, 1) : jalaliDate(y, m, 1)), -1) };
        });
        const { company } = await deps.read(id);
        const departments = new Map((await deps.structure(id)).map((department) => [department.scopeId, department]));
        const { data } = await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/reports/utilization", {
          path: { id, scopeId: company.scopeId },
          query: { periods: months.map((entry) => `${entry.from}/${entry.to}`).join(","), timezone: getPlannerTimeZone() },
        });
        return {
          months: months.map((entry) => entry.m),
          rows: data.rows
            .filter((row) => row.resources > 0)
            .map((row) => ({ departmentId: departments.get(row.scopeId)?.id ?? row.scopeId, name: row.name, values: row.values.map((value) => Math.round((value ?? 0) / 100)) })),
        };
      }),

    goals: (id) => mapErrors(() => allGoals(id)),

    createGoal: (id, input) =>
      mapErrors(async () => {
        const title = input.title.trim();
        if (!title || !input.krTitle.trim()) invalid("A goal needs a title and a key result");
        if (!Number.isFinite(input.krTarget)) invalid("A key result target must be a number");
        const { company } = await deps.read(id);
        const scopeId = input.level === "company" ? company.scopeId : (await deps.structure(id)).find((department) => department.id === input.departmentId)?.scopeId;
        if (!scopeId) throw new RepositoryError("not-found", "Not found");
        const period = quarterOf(today());
        await api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/goals", {
          path: { id, scopeId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: {
            id: newIdempotencyKey(),
            title,
            parentId: input.parentId,
            startDate: period.start,
            targetDate: period.end,
            timezone: getPlannerTimeZone(),
            keyResult: { id: newIdempotencyKey(), title: input.krTitle.trim(), startValue: "0", targetValue: String(input.krTarget) },
          },
        });
        const goals = await allGoals(id);
        const created = goals.filter((goal) => goal.title === title).at(-1);
        if (!created) throw new RepositoryError("not-found", "Not found");
        return created;
      }),

    updateKeyResult: (id, goalId, krId, current) =>
      mapErrors(async () => {
        if (!Number.isFinite(current)) invalid("A key result value must be a number");
        if (!goalScope.has(goalId)) await allGoals(id);
        const scopeId = goalScope.get(goalId);
        if (!scopeId) throw new RepositoryError("not-found", "Not found");
        await api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/goals/{goalId}/key-results/{keyResultId}/checkins", {
          path: { id, scopeId, goalId, keyResultId: krId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: newIdempotencyKey(), value: String(current) },
        });
        const goal = (await allGoals(id)).find((entry) => entry.id === goalId);
        if (!goal) throw new RepositoryError("not-found", "Not found");
        return goal;
      }),

    // Recipient list is public-safe: no company name, inviter, role or department before accepting.
    invitations: () =>
      mapErrors(async (): Promise<CompanyInvitation[]> =>
        (await mine()).filter((item) => item.contextLabel === "Company").map((item) => ({ id: item.id, companyId: null, companyName: null, initials: null, role: null, departmentName: null, inviterName: null })),
      ),

    acceptInvitation: (invitationId) =>
      mapErrors(async () => {
        const proof = await proofFor(invitationId);
        const { data } = await conflictAware(() =>
          api.request("post", "/api/v1/company-invitations/{invitationId}/accept", {
            path: { invitationId },
            header: { "X-Invitation-Proof": proof.proof, "If-Match": revisionTag(proof.revision) },
            body: {},
          }),
        );
        const companies = await pageAll<ApiCompany>(async (after) => (await api.request("get", "/api/v1/companies", { query: { limit: PAGE, after } })).data);
        const company = companies.find((entry) => entry.spaceId === data.invitation.spaceId);
        if (!company) throw new RepositoryError("not-found", "Company not found");
        return { companyId: company.id };
      }),

    declineInvitation: (invitationId) =>
      mapErrors(async () => {
        const proof = await proofFor(invitationId);
        await conflictAware(() =>
          api.request("post", "/api/v1/company-invitations/{invitationId}/decline", {
            path: { invitationId },
            header: { "X-Invitation-Proof": proof.proof, "If-Match": revisionTag(proof.revision) },
            body: {},
          }),
        );
      }),
  };
}
