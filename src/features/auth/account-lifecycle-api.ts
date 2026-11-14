import type { ApiClient, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";

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
  return (await client.request("get", "/api/v1/me/exports/{id}/download", { path: { id }, header: { "X-Export-Proof": proof } })).data as Blob;
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
