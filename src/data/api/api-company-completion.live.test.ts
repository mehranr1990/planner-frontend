import { afterAll, describe, expect, it, vi } from "vitest";
import { typedAs } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-companies";
import { createApiCompanyRepository } from "./api-company-repository";
import { catalogVersion } from "./api-retention";
import { liveConfigured, liveSession } from "./live-support";
import { readFileSync } from "node:fs";

/*
 * Env-gated live check of the Company P4 gap-closure wiring (sent invitations,
 * asset tags, ownership-handover list, decision receipts) against the local
 * backend and the dedicated test account (never production). One sign-in,
 * paced to 120 API requests per minute (backend: reads 600 / writes 120 per user-minute); a 429 waits for Retry-After once.
 * Company create stays refused (no approved COMPANY retention policy), so every
 * step is NOT VERIFIED when the account belongs to no company.
 */

const PER_MINUTE = 120;
const rateHeaders = new Set<string>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function pacedFetch(real: typeof fetch): typeof fetch {
  let windowStart = Date.now();
  let used = 0;
  return async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("/api/v1/auth/")) {
      if (Date.now() - windowStart >= 60_000) {
        windowStart = Date.now();
        used = 0;
      }
      if (used >= PER_MINUTE) {
        await sleep(60_000 - (Date.now() - windowStart) + 1_500);
        windowStart = Date.now();
        used = 0;
      }
      used++;
    }
    const response = await real(input, init);
    const limit = [response.headers.get("RateLimit-Policy"), response.headers.get("RateLimit-Limit")].filter(Boolean).join(" / ");
    if (limit && !rateHeaders.has(limit)) rateHeaders.add(limit);
    if (response.status !== 429) return response;
    await sleep(Number(response.headers.get("Retry-After") ?? "60") * 1000 + 1_500);
    windowStart = Date.now();
    used = 1;
    return real(input, init);
  };
}

type Outcome = "PASS" | "FAIL" | "NOT VERIFIED";
const results: { op: string; outcome: Outcome; note: string }[] = [];
async function step(op: string, run: () => Promise<string | void>) {
  try {
    results.push({ op, outcome: "PASS", note: (await run()) ?? "" });
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string };
    const reason = `${e.code ?? e.status ?? ""} ${e.message ?? String(error)}`.trim();
    const skipped = reason.includes("NOT VERIFIED:");
    results.push({ op, outcome: skipped ? "NOT VERIFIED" : "FAIL", note: skipped ? reason.split("NOT VERIFIED:")[1]!.trim() : reason });
  }
}
const notVerified = (why: string) => new Error(`NOT VERIFIED: ${why}`);

afterAll(() => {
  console.log("rate-limit headers seen: " + ([...rateHeaders].join(" | ") || "none"));
  console.log("COMPANY LIVE RESULTS\n" + results.map((r) => `${r.outcome.padEnd(12)} ${r.op}${r.note ? " — " + r.note : ""}`).join("\n"));
});


/*
 * Accounts: API_LIVE_COMPANY_ACCOUNTS may point at the backend's ignored
 * `.tools/company-development-accounts.json` ({ primary, second, companyId }):
 * primary = synthetic Company Owner, second = MEMBER. Secrets are read at run
 * time only and never logged. Without it, the env account is used alone.
 */
type Account = { email: string; password: string };
const accounts = ((): { primary: Account; second: Account | null; companyId: string | null } | null => {
  const path = process.env.API_LIVE_COMPANY_ACCOUNTS;
  if (!path) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as { primary: Account; second?: Account; companyId?: string };
  return {
    primary: { email: raw.primary.email, password: raw.primary.password },
    second: raw.second ? { email: raw.second.email, password: raw.second.password } : null,
    companyId: raw.companyId ?? null,
  };
})();

describe.skipIf(!liveConfigured)("Company completion (live)", () => {
  it("P4 gap-closure operations against the real backend", async () => {
    vi.stubGlobal("fetch", pacedFetch(globalThis.fetch));
    const owner = await liveSession(accounts?.primary);
    const repo = createApiCompanyRepository(owner.client);
    const api = typedAs<paths>(owner.client);
    const created: { scopeId: string; resourceId: string }[] = [];
    let companyId: string | null = null;
    try {
      await step("authorization boundary: unknown company → not-available", async () => {
        const result = await repo.access("00000000-0000-4000-8000-000000000000");
        expect(result.status).toBe("not-available");
        return "404 → not-available (no data leaked)";
      });
      await step("retention catalog: COMPANY policy (create precondition)", async () => `exactly one COMPANY policy: ${await catalogVersion(owner.client, "COMPANY")}`);

      const { companies } = await repo.list();
      const company = companies.find((entry) => entry.id === accounts?.companyId) ?? companies.find((entry) => entry.role === "owner");
      if (!company) throw new Error("the Owner account lists no company");
      companyId = company.id;
      const rootScope = (await api.request("get", "/api/v1/companies/{id}", { path: { id: company.id } })).data.scopeId;
      const access = await repo.access(company.id);
      console.log("company", company.id, "role", company.role, "access", access.status);

      await step("owner access: role + capabilities", async () => {
        if (access.status !== "ok") throw new Error(`access ${access.status}`);
        expect(access.capabilities.manageResources).toBe(true);
        expect(access.capabilities.reportNotReceived).toBe(false);
        return `role ${company.role}; manageResources true; CB-6 actions off`;
      });
      await step("settings + ownership-handovers list", async () => {
        const settings = await repo.settings(company.id);
        return `currency ${settings.currency ?? "unset"}; eligible owners ${settings.eligibleOwners.length}; transfer ${settings.transfer ? "pending" : "none"}`;
      });
      await step("pending invitations (sent-invitations, recipient email)", async () => {
        const pending = await repo.pendingInvites(company.id);
        const raw = (await api.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/sent-invitations", { path: { id: company.id, scopeId: rootScope }, query: { limit: 100 } })).data.items;
        const states = [...new Set(raw.map((row) => row.state))].join("/") || "—";
        return `${raw.length} sent (${raw.filter((row) => row.recipientEmail).length} with email, states ${states}); ${pending.length} pending shown`;
      });

      // Resource types: nothing is seeded. A synthetic "Live check type" is created once (types have no delete
      // operation, so it is reused by later runs and left in this synthetic development company).
      let typeId: string | null = null;
      await step("resource types catalog (root context)", async () => {
        let types = await repo.resourceTypes(company.id, null);
        let note = `${types.length} configured`;
        if (!types.some((type) => type.title === "Live check type")) {
          await api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/resource-types", {
            path: { id: company.id, scopeId: rootScope },
            header: { "Idempotency-Key": crypto.randomUUID() },
            body: { id: crypto.randomUUID(), title: "Live check type" },
          });
          types = await repo.resourceTypes(company.id, null);
          note += " → created synthetic Live check type";
        }
        typeId = types.find((type) => type.title === "Live check type")?.id ?? null;
        expect(typeId).toBeTruthy();
        return `${note}; catalog now ${types.length}`;
      });
      const tag = `LIVE-${Date.now().toString(36).toUpperCase()}`;
      await step("add resource (configured type + unique asset tag) + list read-back", async () => {
        if (!typeId) throw notVerified("no resource type");
        const added = await repo.addResource(company.id, { name: `Live check ${tag}`, tag, typeId, departmentId: null });
        created.push({ scopeId: rootScope, resourceId: added.id });
        expect(added).toMatchObject({ tag, typeTitle: "Live check type", status: "available" });
        const listed = (await repo.resources(company.id)).find((row) => row.id === added.id);
        expect(listed?.tag).toBe(tag);
        return `tag ${tag}, type title read back`;
      });
      await step("off-catalog type refused before any write", async () => {
        const error = await repo.addResource(company.id, { name: "x", tag: `${tag}-X`, typeId: "laptop", departmentId: null }).then(
          () => null,
          (e: unknown) => e as { code?: string },
        );
        expect(error?.code).toBe("invalid");
        return "invalid";
      });
      await step("duplicate asset tag refused (409)", async () => {
        if (!created.length) throw notVerified("needs the resource from the previous step");
        const before = new Set((await repo.resources(company.id)).map((row) => row.id));
        const error = await repo.addResource(company.id, { name: `Live check dup ${tag}`, tag, typeId: typeId!, departmentId: null }).then(
          () => null,
          (e: unknown) => e as { code?: string; message?: string },
        );
        const fresh = (await repo.resources(company.id)).filter((row) => !before.has(row.id));
        for (const row of fresh) if (row.status !== "retired") created.push({ scopeId: rootScope, resourceId: row.id });
        expect(error?.code).toBe("conflict");
        expect(fresh.every((row) => row.status === "retired")).toBe(true);
        return `conflict (${error?.message ?? ""}); the adapter retired its untagged duplicate (${fresh.length})`;
      });
      await step("finance reads: expenses, budgets, approvals, history", async () => {
        const [expenses, budgets, approvals, history] = await Promise.all([repo.expenses(company.id), repo.budgets(company.id), repo.approvals(company.id), repo.approvalHistory(company.id)]);
        return `${expenses.length} expenses, ${budgets.length} budget lines, ${approvals.length} approvals, ${history.length} history rows`;
      });
      await step("reimbursements + payment runs reads", async () => {
        const [items, runs] = await Promise.all([repo.reimbursements(company.id), repo.paymentRuns(company.id)]);
        return `${items.length} reimbursements, ${runs.length} payment runs`;
      });
      await step("approval decision receipt", async () => {
        const mine = (await repo.approvals(company.id)).filter((row) => row.forMe && row.status === "pending");
        throw notVerified(`${mine.length} pending for me; no financial reviewer role / approval workflow is configured and none is documented as safe to seed (runbook: explicit configuration only)`);
      });

      // Member perspective (second synthetic account): same company, no admin rights.
      if (!accounts?.second) {
        await step("member boundaries", async () => Promise.reject(notVerified("no second account fixture")));
      } else {
        const member = await liveSession(accounts.second);
        try {
          const memberRepo = createApiCompanyRepository(member.client);
          const memberAccess = await memberRepo.access(company.id);
          await step("member access: role + no asset / settlement rights", async () => {
            if (memberAccess.status !== "ok") throw new Error(`access ${memberAccess.status}`);
            expect(memberAccess.capabilities.manageResources).toBe(false);
            expect(memberAccess.capabilities.settleReimbursements).toBe(false);
            return `role ${memberAccess.company.role}`;
          });
          await step("member cannot add a resource (refused, nothing created)", async () => {
            const before = (await repo.resources(company.id)).length;
            const error = await memberRepo.addResource(company.id, { name: "Member attempt", tag: `${tag}-M`, typeId: typeId ?? "none", departmentId: null }).then(
              () => null,
              (e: unknown) => e as { code?: string },
            );
            expect(error?.code).toMatch(/forbidden|invalid|not-found/);
            expect((await repo.resources(company.id)).length).toBe(before);
            return `refused (${error?.code})`;
          });
          await step("member cannot rename the company", async () => {
            const settings = await repo.settings(company.id);
            const error = await memberRepo
              .updateGeneral(company.id, { name: `${settings.name} (member)`, legalName: settings.legalName, currency: settings.currency, fiscalStartMonth: settings.fiscalStartMonth })
              .then(
                () => null,
                (e: unknown) => e as { code?: string },
              );
            expect(error?.code).toMatch(/forbidden|not-found/);
            expect((await repo.settings(company.id)).name).toBe(settings.name);
            return `refused (${error?.code})`;
          });
          await step("member sees no recipient emails", async () => {
            const pending = await memberRepo.pendingInvites(company.id);
            expect(pending.filter((row) => row.email)).toEqual([]);
            return `${pending.length} rows, 0 emails`;
          });
        } finally {
          member.end();
        }
      }
    } finally {
      // Clean up through the supported API: retire every resource this run created.
      for (const { scopeId, resourceId } of companyId ? created : []) {
        const path = { id: companyId!, scopeId, resourceId };
        await api
          .request("get", "/api/v1/companies/{id}/contexts/{scopeId}/resources/{resourceId}", { path })
          .then(({ data: row }) => api.request("post", "/api/v1/companies/{id}/contexts/{scopeId}/resources/{resourceId}/retire", { path, header: { "If-Match": `"${row.revision}"` }, body: {} }))
          .then(
            () => results.push({ op: `cleanup: retire ${resourceId}`, outcome: "PASS", note: "" }),
            (error: unknown) => results.push({ op: `cleanup: retire ${resourceId}`, outcome: "FAIL", note: String((error as { status?: number }).status ?? error) }),
          );
      }
      owner.end();
      vi.unstubAllGlobals();
    }
  }, 900_000);
});
