import type { ApiClient, ResponseData, ResponseDataIn } from "@/api/client";
import { newIdempotencyKey, typedAs } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths as PersonalPaths } from "@/api/generated/openapi-p6-personal";

/*
 * Account lifecycle (live mode only): the complete private export and the
 * staged account deletion. Proofs and the recovery capability are kept in
 * memory by the caller only — never in storage, URLs or logs.
 */

export type ExportJob = ResponseData<"/api/v1/me/exports/{id}", "get">;
export type DeletionStart = ResponseData<"/api/v1/me/deletion-request", "post">;
export type DeletionJob = DeletionStart["job"];

/** The operator-approved erasure policy (backend PERSONAL_ERASURE_POLICY_VERSION); unset = deletion unavailable. */
export function erasurePolicyVersion(): string | null {
  const value = process.env.NEXT_PUBLIC_ERASURE_POLICY_VERSION?.trim();
  return value && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : null;
}

export type CurrentDeletionJob = NonNullable<ResponseDataIn<PersonalPaths, "/api/v1/me/deletion-request/current", "get">["job"]>;
export interface DeletionStatus {
  /** Server policy (GET /me/deletion-policy); a 409 (unset) falls back to the env version. */
  policyVersion: string | null;
  /** The owner's latest deletion request, or null. */
  job: CurrentDeletionJob | null;
}

export async function deletionStatus(client: ApiClient): Promise<DeletionStatus> {
  const api = typedAs<PersonalPaths>(client);
  const [policy, current] = await Promise.all([
    api.request("get", "/api/v1/me/deletion-policy", {}).then(
      ({ data }) => data.policyVersion,
      (error: unknown) => {
        if (error instanceof ApiHttpError && error.status === 409) return null;
        throw error;
      },
    ),
    api.request("get", "/api/v1/me/deletion-request/current", {}).then(({ data }) => data.job),
  ]);
  return { policyVersion: policy ?? erasurePolicyVersion(), job: current };
}

/** The account revision for deletion: the quoted positive settings ETag. */
export function revisionFromEtag(etag: string | undefined): number | null {
  const match = /^"([1-9][0-9]{0,9})"$/.exec(etag ?? "");
  return match ? Number(match[1]) : null;
}

export async function startExport(client: ApiClient, password: string, idempotencyKey: string): Promise<ExportJob> {
  return (await client.request("post", "/api/v1/me/export", { header: { "Idempotency-Key": idempotencyKey }, body: { password } })).data;
}

export async function exportStatus(client: ApiClient, id: string): Promise<ExportJob> {
  return (await client.request("get", "/api/v1/me/exports/{id}", { path: { id } })).data;
}

/** Downloads the READY artifact with its (fresh, ≤ 10 min) proof. */
export async function downloadExport(client: ApiClient, id: string, proof: string): Promise<Blob> {
  const data: unknown = (await client.request("get", "/api/v1/me/exports/{id}/download", { path: { id }, header: { "X-Export-Proof": proof } })).data;
  // The contract says octet-stream, but the server serves the artifact as application/json,
  // which the transport parses: turn it back into a JSON file (same data) for saving.
  return data instanceof Blob ? data : new Blob([JSON.stringify(data)], { type: "application/json" });
}

export async function requestDeletion(
  client: ApiClient,
  body: { password: string; accountRevision: number; policyVersion: string },
  idempotencyKey: string = newIdempotencyKey(),
): Promise<DeletionStart> {
  return (
    await client.request("post", "/api/v1/me/deletion-request", {
      header: { "Idempotency-Key": idempotencyKey },
      body: { ...body, retentionAcknowledged: true },
    })
  ).data;
}

export async function confirmDeletion(client: ApiClient, job: DeletionJob, proof: string): Promise<DeletionJob> {
  return (await client.request("post", "/api/v1/me/deletion-request/confirm", { header: { "X-Deletion-Proof": proof }, body: { jobId: job.id, revision: job.revision } })).data;
}

/** Signed-out status of a deletion request (request ID + recovery code; rate limited, safe status only). */
export async function deletionRecoveryStatus(client: ApiClient, jobId: string, recovery: string): Promise<DeletionJob> {
  return (await client.request("get", "/api/v1/me/deletion-request", { query: { jobId }, header: { "X-Deletion-Recovery": recovery } })).data;
}

/** Signed-out cancellation during the grace period (recovery code in a header, never in the URL). */
export async function cancelDeletion(client: ApiClient, body: { jobId: string; password: string }, recovery: string): Promise<DeletionJob> {
  return (await client.request("post", "/api/v1/me/deletion-request/cancel", { header: { "X-Deletion-Recovery": recovery }, body })).data;
}
