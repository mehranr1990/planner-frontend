import type { ApiClient } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, type AttachmentType, type TaskAttachment, type TaskFilesRepository } from "../personal-services";
import { invalid, isNotFound, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Task attachments over the private file routes (the only Personal file
 * surface the contract has — no folders, versions or general drive):
 * initiate (/files/uploads) → stream the exact bytes (/files/{id}/complete)
 * → bind to the task (PUT /tasks/{id}/attachments/{fileId}, Task If-Match).
 * Download renews the signed relative link (complete with {}) and fetches it
 * with the session; the signature is used as given, never stored. Remove =
 * detach, then DELETE the file (bytes); detach alone keeps the file.
 */

const PAGE = "100";

const isAttachmentType = (type: string): type is AttachmentType => (ATTACHMENT_TYPES as readonly string[]).includes(type);

const STATUS = { INITIATED: "uploading", READY: "ready", REJECTED: "rejected" } as const;

export function createApiTaskFilesRepository(client: ApiClient): TaskFilesRepository {
  const taskRevision = async (taskId: string) => (await client.request("get", "/api/v1/tasks/{id}", { path: { id: taskId } })).data.revision;

  /** A Task-revision-checked association write (409 → re-read → once more). */
  async function onTask(taskId: string, send: (ifMatch: string) => Promise<unknown>) {
    let revision = await taskRevision(taskId);
    await retryOnConflict(
      () => send(revisionTag(revision)),
      async () => {
        revision = await taskRevision(taskId);
      },
    );
  }

  const detach = (taskId: string, fileId: string) =>
    onTask(taskId, (ifMatch) => client.request("delete", "/api/v1/tasks/{id}/attachments/{fileId}", { path: { id: taskId, fileId }, header: { "If-Match": ifMatch }, body: {} }));

  return {
    list: (taskId) =>
      mapErrors(async () =>
        (await pageAll(async (cursor) => (await client.request("get", "/api/v1/tasks/{id}/attachments", { path: { id: taskId }, query: { limit: PAGE, cursor } })).data))
          .filter((item) => item.status !== "DELETED")
          .map(
            (item): TaskAttachment => ({
              fileId: item.fileId,
              name: item.filename,
              mimeType: item.mimeType,
              sizeBytes: item.size,
              status: STATUS[item.status as keyof typeof STATUS],
              attachedAt: item.attachedAt,
            }),
          ),
      ),

    upload: (taskId, file) =>
      mapErrors(async () => {
        if (!isAttachmentType(file.type)) invalid("Only text, PDF, PNG or JPEG files");
        if (file.size <= 0 || file.size > ATTACHMENT_MAX_BYTES) invalid("The file is empty or larger than 10 MB");
        const name = file.name.trim().slice(0, 180) || "file";
        const { data: started } = await client.request("post", "/api/v1/files/uploads", {
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { filename: name, mimeType: file.type, expectedSize: file.size },
        });
        const { data: done } = await client.request("post", "/api/v1/files/{id}/complete", { path: { id: started.id }, body: file });
        if (done.status !== "READY") invalid("The server did not accept the file");
        await onTask(taskId, (ifMatch) => client.request("put", "/api/v1/tasks/{id}/attachments/{fileId}", { path: { id: taskId, fileId: done.id }, header: { "If-Match": ifMatch }, body: {} }));
        return { fileId: done.id, name: done.filename, mimeType: done.mimeType, sizeBytes: done.actualSize, status: "ready", attachedAt: done.completedAt ?? done.createdAt };
      }),

    download: (fileId) =>
      mapErrors(async () => {
        const { data } = await client.request("post", "/api/v1/files/{id}/complete", { path: { id: fileId }, body: {} });
        if (data.status !== "READY" || !data.download) invalid("The file is not ready");
        const url = new URL(data.download.url, "http://relative.invalid");
        const expires = url.searchParams.get("expires");
        const signature = url.searchParams.get("signature");
        if (!expires || !signature) invalid("The download link is incomplete");
        const { data: blob } = await client.request("get", "/api/v1/files/{id}/download", { path: { id: fileId }, query: { expires, signature } });
        return blob as Blob;
      }),

    detach: (taskId, fileId) => mapErrors(() => detach(taskId, fileId)),

    remove: (taskId, fileId) =>
      mapErrors(async () => {
        // Already gone is the goal for both steps (a retry after a 503 cleanup); anything else surfaces.
        const tolerate404 = async (step: () => Promise<unknown>) => {
          try {
            await step();
          } catch (error) {
            if (!isNotFound(error)) throw error;
          }
        };
        await tolerate404(() => detach(taskId, fileId));
        await tolerate404(() => client.request("delete", "/api/v1/files/{id}", { path: { id: fileId } }));
      }),
  };
}
