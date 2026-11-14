import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "@/data/api/test-support";
import { confirmDeletion, downloadExport, erasurePolicyVersion, requestDeletion, revisionFromEtag, startExport } from "./account-lifecycle-api";

/* Account export / deletion calls against a contract fake: proofs travel only in headers. */

const ID = "00000000-0000-4000-8000-000000000001";
const job = { id: ID, revision: 1, state: "PENDING", createdAt: "2026-11-14T08:00:00.000Z", eraseAfter: null, completedAt: null, failureCode: null, backupExpiryDeadline: null };

afterEach(() => vi.unstubAllEnvs());

describe("account lifecycle", () => {
  it("reads the account revision only from a quoted positive ETag", () => {
    expect(revisionFromEtag('"12"')).toBe(12);
    expect(revisionFromEtag("12")).toBeNull();
    expect(revisionFromEtag('W/"12"')).toBeNull();
    expect(revisionFromEtag(undefined)).toBeNull();
  });

  it("offers deletion only with a configured policy version", () => {
    vi.stubEnv("NEXT_PUBLIC_ERASURE_POLICY_VERSION", "");
    expect(erasurePolicyVersion()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_ERASURE_POLICY_VERSION", "personal-erasure-2026.1");
    expect(erasurePolicyVersion()).toBe("personal-erasure-2026.1");
  });

  it("requests deletion with the acknowledgement, then confirms with the proof header", async () => {
    const api = fakeApi((call, parts) => {
      if (parts[2] === "confirm") {
        expect(call.body).toEqual({ jobId: ID, revision: 1 });
        return json({ ...job, state: "WAITING", revision: 2 }, 201);
      }
      expect(call.key).toBe("k-1");
      expect(call.body).toEqual({ password: "pw", accountRevision: 7, policyVersion: "v1", retentionAcknowledged: true });
      return json({ job, confirmationProof: "proof", recoveryCapability: "recover", confirmationExpiresAt: "2026-11-14T08:10:00.000Z" }, 201);
    });
    const start = await requestDeletion(api.client, { password: "pw", accountRevision: 7, policyVersion: "v1" }, "k-1");
    expect((await confirmDeletion(api.client, start.job, start.confirmationProof)).state).toBe("WAITING");
    expect(api.writes()).toEqual(["POST /me/deletion-request", "POST /me/deletion-request/confirm"]);
  });

  it("starts an export with the password and downloads the artifact bytes", async () => {
    const seen: string[] = [];
    const api = fakeApi((call) => {
      if (call.method === "POST") return json({ id: ID, revision: 1, state: "QUEUED", createdAt: "2026-11-14T08:00:00.000Z", completedAt: null, expiresAt: null, failureCode: null, size: null, sha256: null, downloadProof: null }, 201);
      seen.push(call.path);
      return new Response("{}", { headers: { "Content-Type": "application/octet-stream" } });
    });
    expect((await startExport(api.client, "pw", "k-2")).state).toBe("QUEUED");
    expect(await (await downloadExport(api.client, ID, "p")).text()).toBe("{}");
    expect(seen).toEqual([`/me/exports/${ID}/download`]);
  });
});
