import { newIdempotencyKey, type ApiClient } from "@/api/client";
import type { FileLibrary, ProjectFile } from "../project-domain";
import type { FileRepository, FileUploadInput } from "../project-repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { conflictAware, projectsClient, type ProjectsData } from "./api-project-shared";

/*
 * PJ-10 project files over the project content files: the project's own
 * files (target PROJECT) in one level, upload = `POST /projects/{id}/files`
 * (Idempotency-Key) → the real bytes streamed to `…/files/{fileId}/complete`
 * (application/octet-stream), download streams a READY file, cancel = DELETE.
 *
 * Not served, so never invented: folders (everything is at the root; a folder
 * upload is refused), versions (a same-name upload as a new version and
 * restoring a version are refused), the uploader (left blank) and the size
 * limit (an operator setting with no read: the client only rejects what the
 * contract can never take, the server answers the rest). Task attachments are
 * listed on the task (`content/TASK/{id}/files`), not here. Bytes of a failed
 * upload are kept for this page only (Retry).
 */

type ApiProjectFile = ProjectsData<"/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files", "get">["items"][number];
type Mime = ApiProjectFile["mimeType"];

const PAGE = 100;
/** The contract's ceiling for FILE_MAX_BYTES; the configured limit can be lower (the server then rejects). */
const MAX_BYTES = 104_857_600;
const MIME_BY_EXTENSION: Readonly<Record<string, Mime>> = { txt: "text/plain", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
const ALLOWED = new Set<string>(Object.values(MIME_BY_EXTENSION));

function mimeOf(name: string, blob: Blob): Mime | null {
  if (ALLOWED.has(blob.type)) return blob.type as Mime;
  return MIME_BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

const mediaOf = (mime: Mime): ProjectFile["media"] => (mime.startsWith("image/") ? "image" : mime === "application/pdf" ? "pdf" : "doc");

export function createApiProjectFileRepository(client: ApiClient): FileRepository {
  const api = projectsClient(client);
  const pending = new Map<string, Blob>();
  const inFlight = new Set<string>();
  const target = (projectId: string) => ({ projectId, targetKind: "PROJECT" as const, targetId: projectId });

  const toFile = (file: ApiProjectFile): ProjectFile => {
    let state: ProjectFile["state"] = "ready";
    if (file.status === "INITIATED") state = inFlight.has(file.id) ? "uploading" : "failed";
    else if (file.status === "REJECTED") state = "blocked";
    return {
      id: file.id,
      name: file.filename,
      folderId: null,
      sizeBytes: file.actualSize ?? file.expectedSize,
      media: mediaOf(file.mimeType),
      state,
      ...(state === "failed" ? { failReason: "connection" as const } : {}),
      version: 1,
      versions: [],
      uploadedBy: { id: "", name: "", initials: "" },
      updatedAt: file.completedAt ?? file.createdAt,
      taskIds: [],
    };
  };

  const getFile = async (projectId: string, fileId: string) =>
    (await api.request("get", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files/{fileId}", { path: { ...target(projectId), fileId } })).data;

  async function complete(projectId: string, fileId: string, blob: Blob): Promise<ProjectFile> {
    pending.set(fileId, blob);
    inFlight.add(fileId);
    try {
      await api.request("post", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files/{fileId}/complete", { path: { ...target(projectId), fileId }, body: blob });
      pending.delete(fileId);
    } finally {
      inFlight.delete(fileId);
    }
    return toFile(await getFile(projectId, fileId));
  }

  return {
    list: (projectId) =>
      mapErrors(async (): Promise<FileLibrary> => {
        const files = (
          await pageAll<ApiProjectFile>(
            async (after) =>
              (await api.request("get", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files", { path: target(projectId), query: { limit: PAGE, after } })).data,
          )
        )
          .filter((file) => file.status !== "DELETED")
          .map(toFile);
        return { folders: [], files, total: files.length };
      }),

    config: async () => ({ maxBytes: MAX_BYTES, blockedExtensions: [] }),

    upload: (projectId, input: FileUploadInput) =>
      mapErrors(async () => {
        if (input.asNewVersionOf) unsupported("Project files have no versions");
        if (input.folderId) unsupported("Project files have no folders");
        const blob = input.file;
        if (!blob) invalid("The file's bytes are needed to upload");
        const mimeType = mimeOf(input.name, blob);
        if (!mimeType) invalid("This file type is not allowed (text, PDF, PNG or JPEG only)");
        if (blob.size < 1 || blob.size > MAX_BYTES) invalid("This file is empty or larger than the server allows");
        const { data } = await api.request("post", "/api/v1/projects/{projectId}/files", {
          path: { projectId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), filename: input.name.slice(0, 180), mimeType, expectedSize: blob.size, target: { kind: "PROJECT", id: projectId } },
        });
        return complete(projectId, data.id, blob);
      }),

    cancel: (projectId, fileId) =>
      mapErrors(async () => {
        pending.delete(fileId);
        let current = await getFile(projectId, fileId);
        if (current.status === "DELETED") return;
        const send = () =>
          api.request("delete", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files/{fileId}", {
            path: { ...target(projectId), fileId },
            header: { "If-Match": revisionTag(current.revision) },
          });
        await conflictAware(() => retryOnConflict(send, async () => (current = await getFile(projectId, fileId))));
      }),

    retry: (projectId, fileId) =>
      mapErrors(async () => {
        const blob = pending.get(fileId);
        if (!blob) invalid("Choose the file again to retry");
        return complete(projectId, fileId, blob);
      }),

    restoreVersion: () => mapErrors(async () => unsupported("Project files have no versions")),

    download: (projectId, fileId) =>
      mapErrors(async () => {
        const file = await getFile(projectId, fileId);
        if (file.status !== "READY") invalid("The file is not ready to download");
        const { data } = await api.request("get", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files/{fileId}/download", { path: { ...target(projectId), fileId } });
        return data as Blob;
      }),
  };
}
