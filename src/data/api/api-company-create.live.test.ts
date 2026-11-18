import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { newIdempotencyKey, typedAs } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-companies";
import { createApiCompanyRepository } from "./api-company-repository";
import { catalogVersion } from "./api-retention";
import { liveConfigured, liveSession } from "./live-support";

/*
 * Env-gated live check of New Company creation against the local backend
 * (never production). Signs in as the synthetic Owner from the backend's
 * ignored `.tools/company-development-accounts.json` (API_LIVE_COMPANY_ACCOUNTS,
 * secrets never logged), else the env account. Creates two synthetic
 * companies — one through the adapter (the sheet's path), one through a raw
 * same-key replay (idempotency) — and archives both at the end.
 */

type Outcome = "PASS" | "FAIL" | "NOT VERIFIED";
const results: { op: string; outcome: Outcome; note: string }[] = [];
async function step(op: string, run: () => Promise<string | void>) {
  try {
    results.push({ op, outcome: "PASS", note: (await run()) ?? "" });
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string };
    results.push({ op, outcome: "FAIL", note: `${e.code ?? e.status ?? ""} ${e.message ?? String(error)}`.trim() });
  }
}
afterAll(() => {
  console.log("COMPANY CREATE LIVE RESULTS\n" + results.map((r) => `${r.outcome.padEnd(12)} ${r.op}${r.note ? " — " + r.note : ""}`).join("\n"));
});

const account = (() => {
  const path = process.env.API_LIVE_COMPANY_ACCOUNTS;
  if (!path) return undefined;
  const raw = JSON.parse(readFileSync(path, "utf8")) as { primary: { email: string; password: string } };
  return { email: raw.primary.email, password: raw.primary.password };
})();

describe.skipIf(!liveConfigured)("Company create (live)", () => {
  it("creates, lists, opens, replays without duplicates, archives", async () => {
    // Record the status of every company create (the adapter does not expose it).
    const statuses: number[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (async (input, init) => {
      const response = await real(input, init);
      const url = String(input instanceof Request ? input.url : input);
      if (init?.method === "POST" && /\/api\/v1\/companies$/.test(url)) statuses.push(response.status);
      return response;
    }) as typeof fetch);
    const { client, end } = await liveSession(account);
    const repo = createApiCompanyRepository(client);
    const api = typedAs<paths>(client);
    const toArchive: string[] = [];
    const stamp = Date.now().toString(36).toUpperCase();
    try {
      let createdId = "";
      await step("create through the adapter (catalog policy → POST /companies → settings → departments)", async () => {
        const summary = await repo.create({ name: `Live create ${stamp}`, legalName: `Live create ${stamp} LLC`, currency: "toman", fiscalStartMonth: 1, departments: ["Ops"] });
        createdId = summary.id;
        toArchive.push(summary.id);
        expect(summary.role).toBe("owner");
        expect(statuses).toEqual([201]);
        return `HTTP ${statuses[0]}; id ${summary.id}; role ${summary.role}`;
      });
      await step("appears in the authorized list", async () => {
        const listed = (await repo.list()).companies.filter((company) => company.id === createdId);
        expect(listed).toHaveLength(1);
        return `listed once as ${listed[0]!.role}`;
      });
      await step("owner can open it (access, settings, departments)", async () => {
        const access = await repo.access(createdId);
        expect(access.status).toBe("ok");
        const settings = await repo.settings(createdId);
        expect(settings).toMatchObject({ name: `Live create ${stamp}`, legalName: `Live create ${stamp} LLC`, currency: "rial", fiscalStartMonth: 1 });
        const departments = (await repo.departments(createdId)).map((department) => department.name);
        expect(departments).toEqual(["Ops"]);
        return `access ok; legal name, IRR (shown as Rial/Toman unit), fiscal month 1, departments [Ops]`;
      });
      await step("same-key replay creates no duplicate", async () => {
        const version = await catalogVersion(client, "COMPANY");
        const body = { id: crypto.randomUUID(), title: `Live replay ${stamp}`, retentionPolicyVersion: version };
        const header = { "Idempotency-Key": newIdempotencyKey() };
        const first = await api.request("post", "/api/v1/companies", { header, body });
        toArchive.push(first.data.id);
        const second = await api.request("post", "/api/v1/companies", { header, body });
        expect(second.data.id).toBe(first.data.id);
        const listed = (await repo.list()).companies.filter((company) => company.name === `Live replay ${stamp}`);
        expect(listed).toHaveLength(1);
        return `statuses ${statuses.slice(1).join(", ")}; same id; listed once`;
      });
    } finally {
      for (const id of toArchive) {
        await repo.archive(id).then(
          (summary) => results.push({ op: `cleanup: archive ${id}`, outcome: summary.lifecycle === "archived" ? "PASS" : "FAIL", note: summary.lifecycle }),
          (error: unknown) => results.push({ op: `cleanup: archive ${id}`, outcome: "FAIL", note: String((error as { status?: number }).status ?? error) }),
        );
      }
      end();
      vi.unstubAllGlobals();
    }
  }, 300_000);
});
