import { describe, expect, it } from "vitest";
import { ApiHttpError, isRecoveryExpired, isSharedNotEnabled } from "@/api/errors";
import { RepositoryError } from "../repositories";
import { SocialError } from "../social-repositories";
import { catalogVersion, currentPolicies } from "./api-retention";
import { err, fakeApi, json } from "./test-support";

const policy = (version: string, ...contexts: string[]) => ({ version, applicableContexts: contexts, marketScope: "x", classRules: {}, createdAt: "x" });
const CATALOG = [
  policy("mp-rpc-v1.0-work", "PROJECT", "TEAM"),
  policy("mp-rpc-v1.1-social-group", "SOCIAL_GROUP"),
  policy("mp-rpc-v2.0-company", "COMPANY"),
  policy("mp-rpc-v2.0-social-group", "SOCIAL_GROUP"),
  policy("mp-rpc-v2.0-work", "PROJECT", "TEAM"),
];

describe("retention catalog v2", () => {
  it("keeps only the newest applicable catalog generation the server returned", () => {
    expect(currentPolicies(CATALOG, "TEAM").map((p) => p.version)).toEqual(["mp-rpc-v2.0-work"]);
    expect(currentPolicies(CATALOG, "SOCIAL_GROUP").map((p) => p.version)).toEqual(["mp-rpc-v2.0-social-group"]);
    expect(currentPolicies(CATALOG.slice(0, 2), "PROJECT").map((p) => p.version)).toEqual(["mp-rpc-v1.0-work"]);
    expect(currentPolicies(CATALOG, "MEETING")).toEqual([]);
  });

  it("sends the v2.0 version even while immutable v1 rows are still listed", async () => {
    const api = fakeApi((call) => json({ items: CATALOG.filter((p) => p.applicableContexts.includes(call.query.context!)) }));
    await expect(catalogVersion(api.client, "PROJECT")).resolves.toBe("mp-rpc-v2.0-work");
    expect(api.calls[0]).toMatchObject({ method: "GET", path: "/retention-policies", query: { context: "PROJECT" } });
  });

  it("an empty catalog is SHARED_RETENTION_UNAVAILABLE and a catalog 403 is the activation gate", async () => {
    const empty = fakeApi(() => json({ items: [] }));
    const gated = fakeApi(() => err(403, "FORBIDDEN"));
    const emptyError = await catalogVersion(empty.client, "COMPANY").catch((e: unknown) => e);
    const gatedError = await catalogVersion(gated.client, "COMPANY").catch((e: unknown) => e);
    expect(emptyError).toMatchObject({ code: "unsupported", message: "SHARED_RETENTION_UNAVAILABLE" });
    expect(gatedError).toMatchObject({ code: "unsupported", message: "SHARED_ACTIVATION_GATED" });
    expect([isSharedNotEnabled(emptyError), isSharedNotEnabled(gatedError)]).toEqual([true, true]);
  });

  it("several policies of the same generation are refused, never guessed", async () => {
    const api = fakeApi(() => json({ items: [policy("mp-rpc-v2.0-a", "TEAM"), policy("mp-rpc-v2.0-b", "TEAM")] }));
    await expect(catalogVersion(api.client, "TEAM")).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("shared activation and recovery reasons", () => {
  const http = (status: number, code: string, detail?: string) =>
    new ApiHttpError(status, { error: { code, message: "x", requestId: "r", ...(detail ? { details: [{ path: "", code: detail }] } : {}) } } as never, "r");
  it("recognises the codes on the envelope, in details, and on mapped errors", () => {
    expect(isSharedNotEnabled(http(403, "SHARED_ACTIVATION_GATED"))).toBe(true);
    expect(isSharedNotEnabled(http(403, "FORBIDDEN", "SHARED_RETENTION_UNAVAILABLE"))).toBe(true);
    expect(isSharedNotEnabled(http(403, "FORBIDDEN"))).toBe(false);
    expect(isSharedNotEnabled(new SocialError("unsupported", "x", "SHARED_ACTIVATION_GATED"))).toBe(true);
    expect(isSharedNotEnabled(new RepositoryError("unsupported", "Projects API: x"))).toBe(false);
    expect(isRecoveryExpired(http(409, "CONFLICT", "RECOVERY_EXPIRED"))).toBe(true);
    expect(isRecoveryExpired(new SocialError("conflict", "x", "RESTORE_EXPIRED"))).toBe(true);
    expect(isRecoveryExpired(http(409, "CONFLICT"))).toBe(false);
  });
});
