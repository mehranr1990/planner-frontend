import { newIdempotencyKey, type ApiClient } from "@/api/client";
import type { FileLibrary, ProjectFile, ProjectFileVersion } from "../project-domain";
import type { FileRepository, FileUploadInput } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { conflictAware, personOf, projectRoster, projectsClient, type ApiProjectMember, type ProjectsClient, type ProjectsData } from "./api-project-shared";

/*
 * PJ-10 project files over the project file library (P2 gap closure):
 * - Folders = `file-folders` (archived ones hidden; one level is shown, a
 *   nested folder is listed like any other). Files = `file-library` entries
 *   (root file id, folder, uploader actor, version count) joined with the
 *   stored file of their current version: the project's content files for a
 *   single-version file, `…/files/{id}/versions` otherwise (the highest READY
 *   version is current; failed / incomplete uploads never replace it).
 * - Limits = `files/config` (effective max bytes and allowed types).
 * - Upload = `POST /projects/{id}/files` {folderId} (Idempotency-Key) → the
 *   real bytes to `…/complete`. A new version = `POST …/files/{id}/versions`
 *   (If-Match = library metadata revision, key) → its bytes through the same
 *   complete pipeline. Restore = the old version's bytes (explicit version
 *   download) uploaded as a new version. Download streams the current
 *   version. Cancel = DELETE of an unfinished upload.
 * - Not served, never invented: version notes, the task links of a file.
 *   Bytes of a failed upload are kept for this page only (Retry).
 */

type ApiStoredFile = ProjectsData<"/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files", "get">["items"][number];
type ApiFolder = ProjectsData<"/api/v1/projects/{projectId}/file-folders", "get">["items"][number];
type ApiEntry = ProjectsData<"/api/v1/projects/{projectId}/file-library", "get">["items"][number];
type ApiVersion = ProjectsData<"/api/v1/projects/{projectId}/files/{fileId}/versions", "get">["items"][number];
type ApiTarget = ApiStoredFile["target"];
type Mime = ApiStoredFile["mimeType"];

const PAGE = 100;
const READS = 8;
const MIME_BY_EXTENSION: Readonly<Record<string, Mime>> = { txt: "text/plain", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

function mimeOf(name: string, blob: Blob, allowed: readonly Mime[]): Mime | null {
  const type = allowed.find((candidate) => candidate === blob.type) ?? MIME_BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""];
  return type && allowed.includes(type) ? type : null;
}

const mediaOf = (mime: Mime): ProjectFile["media"] => (mime.startsWith("image/") ? "image" : mime === "application/pdf" ? "pdf" : "doc");

const versionsOf = async (api: ProjectsClient, projectId: string, fileId: string) =>
  (await api.request("get", "/api/v1/projects/{projectId}/files/{fileId}/versions", { path: { projectId, fileId } })).data;

export function createApiProjectFileRepository(client: ApiClient): FileRepository {
  const api = projectsClient(client);
  const pending = new Map<string, { blob: Blob; target: ApiTarget; rootId: string }>();
  const inFlight = new Set<string>();
  const projectTarget = (projectId: string): ApiTarget => ({ kind: "PROJECT", id: projectId });
  const contentPath = (projectId: string, target: ApiTarget) => ({ projectId, targetKind: target.kind, targetId: target.id });

  const config = async (projectId: string) => (await api.request("get", "/api/v1/projects/{projectId}/files/config", { path: { projectId } })).data;

  const stateOf = (status: ApiStoredFile["status"], fileId: string): Pick<ProjectFile, "state" | "failReason"> => {
    if (status === "INITIATED") return inFlight.has(fileId) ? { state: "uploading" } : { state: "failed", failReason: "connection" };
    if (status === "REJECTED") return { state: "blocked" };
    return { state: "ready" };
  };

  const fromVersions = (entry: ApiEntry, list: { items: ApiVersion[]; currentVersionId: string | null }, roster: readonly ApiProjectMember[]): ProjectFile => {
    const byActor = (actorId: string) => {
      const member = roster.find((candidate) => candidate.actorId === actorId);
      return member ? personOf(roster, member.id) : { id: "", name: "", initials: "" };
    };
    const ready = list.items.filter((version) => version.status === "READY").sort((a, b) => a.number - b.number);
    // The current READY version, or (before any is ready) the newest upload attempt.
    const shown = list.items.find((version) => version.id === list.currentVersionId) ?? [...list.items].sort((a, b) => b.number - a.number)[0];
    if (!shown) throw new RepositoryError("not-found", "Not found");
    const versions: ProjectFileVersion[] = ready.map((version) => ({ version: version.number, by: byActor(version.createdByActorId), at: version.createdAt }));
    return {
      id: entry.id,
      name: shown.filename,
      folderId: entry.folderId,
      sizeBytes: shown.size ?? 0,
      media: mediaOf(shown.mimeType),
      ...stateOf(shown.status, shown.id),
      version: shown.number,
      versions,
      uploadedBy: byActor(entry.createdByActorId),
      updatedAt: shown.createdAt,
      taskIds: [],
    };
  };

  const fromStored = (entry: ApiEntry, file: ApiStoredFile, roster: readonly ApiProjectMember[]): ProjectFile => {
    const member = roster.find((candidate) => candidate.actorId === entry.createdByActorId);
    const by = member ? personOf(roster, member.id) : { id: "", name: "", initials: "" };
    return {
      id: entry.id,
      name: file.filename,
      folderId: entry.folderId,
      sizeBytes: file.actualSize ?? file.expectedSize,
      media: mediaOf(file.mimeType),
      ...stateOf(file.status, file.id),
      version: 1,
      versions: file.status === "READY" ? [{ version: 1, by, at: file.completedAt ?? file.createdAt }] : [],
      uploadedBy: by,
      updatedAt: file.completedAt ?? file.createdAt,
      taskIds: [],
    };
  };

  const entryOf = async (projectId: string, fileId: string) =>
    (await api.request("get", "/api/v1/projects/{projectId}/files/{fileId}/metadata", { path: { projectId, fileId } })).data;

  const getStored = async (projectId: string, target: ApiTarget, fileId: string) =>
    (await api.request("get", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files/{fileId}", { path: { ...contentPath(projectId, target), fileId } })).data;

  const one = async (projectId: string, rootId: string): Promise<ProjectFile> => {
    const [entry, list, roster] = await Promise.all([entryOf(projectId, rootId), versionsOf(api, projectId, rootId), projectRoster(api, projectId)]);
    return fromVersions(entry, list, roster);
  };

  async function complete(projectId: string, target: ApiTarget, fileId: string, blob: Blob, rootId = fileId): Promise<void> {
    pending.set(fileId, { blob, target, rootId });
    inFlight.add(fileId);
    try {
      await api.request("post", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files/{fileId}/complete", { path: { ...contentPath(projectId, target), fileId }, body: blob });
      pending.delete(fileId);
    } finally {
      inFlight.delete(fileId);
    }
  }

  /** Uploads `blob` as the next version of the library file `rootId`. */
  async function addVersion(projectId: string, rootId: string, name: string, blob: Blob, mimeType: Mime): Promise<ProjectFile> {
    let entry = await entryOf(projectId, rootId);
    const id = crypto.randomUUID();
    const key = newIdempotencyKey();
    const send = () =>
      api.request("post", "/api/v1/projects/{projectId}/files/{fileId}/versions", {
        path: { projectId, fileId: rootId },
        header: { "If-Match": revisionTag(entry.revision), "Idempotency-Key": key },
        body: { id, filename: name.slice(0, 180), mimeType, expectedSize: blob.size },
      });
    const { data } = await conflictAware(() => retryOnConflict(send, async () => (entry = await entryOf(projectId, rootId))));
    await complete(projectId, data.target, data.id, blob, rootId);
    return one(projectId, rootId);
  }

  const checked = async (projectId: string, name: string, blob: Blob | undefined): Promise<{ blob: Blob; mimeType: Mime }> => {
    if (!blob) invalid("The file's bytes are needed to upload");
    const limits = await config(projectId);
    const mimeType = mimeOf(name, blob, limits.allowedTypes);
    if (!mimeType) invalid("This file type is not allowed by the server");
    if (blob.size < 1 || blob.size > limits.maxBytes) invalid("This file is empty or larger than the server allows");
    return { blob, mimeType };
  };

  return {
    list: (projectId) =>
      mapErrors(async (): Promise<FileLibrary> => {
        const [folders, entries, stored, roster] = await Promise.all([
          pageAll<ApiFolder>(async (after) => (await api.request("get", "/api/v1/projects/{projectId}/file-folders", { path: { projectId }, query: { limit: PAGE, after } })).data),
          pageAll<ApiEntry>(async (after) => (await api.request("get", "/api/v1/projects/{projectId}/file-library", { path: { projectId }, query: { limit: PAGE, after } })).data),
          pageAll<ApiStoredFile>(
            async (after) =>
              (await api.request("get", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files", { path: contentPath(projectId, projectTarget(projectId)), query: { limit: PAGE, after } })).data,
          ),
          projectRoster(api, projectId),
        ]);
        const byId = new Map(stored.map((file) => [file.id, file]));
        const files: ProjectFile[] = [];
        for (let at = 0; at < entries.length; at += READS)
          files.push(
            ...(await Promise.all(
              entries.slice(at, at + READS).map(async (entry) => {
                const root = byId.get(entry.id);
                return entry.versionCount === 1 && root ? fromStored(entry, root, roster) : fromVersions(entry, await versionsOf(api, projectId, entry.id), roster);
              }),
            )),
          );
        const live = files.filter((file) => byId.get(file.id)?.status !== "DELETED");
        const shown = folders.filter((folder) => folder.archivedAt === null);
        return {
          folders: shown.map((folder) => ({ id: folder.id, name: folder.title, count: live.filter((file) => file.folderId === folder.id).length })),
          files: live,
          total: live.length,
        };
      }),

    config: (projectId) =>
      mapErrors(async () => {
        const limits = await config(projectId);
        return { maxBytes: limits.maxBytes, blockedExtensions: [] };
      }),

    upload: (projectId, input: FileUploadInput) =>
      mapErrors(async () => {
        const { blob, mimeType } = await checked(projectId, input.name, input.file);
        if (input.asNewVersionOf) return addVersion(projectId, input.asNewVersionOf, input.name, blob, mimeType);
        const { data } = await api.request("post", "/api/v1/projects/{projectId}/files", {
          path: { projectId },
          header: { "Idempotency-Key": newIdempotencyKey() },
          body: { id: crypto.randomUUID(), filename: input.name.slice(0, 180), mimeType, expectedSize: blob.size, target: projectTarget(projectId), folderId: input.folderId },
        });
        await complete(projectId, data.target, data.id, blob);
        return one(projectId, data.id);
      }),

    cancel: (projectId, fileId) =>
      mapErrors(async () => {
        const target = pending.get(fileId)?.target ?? projectTarget(projectId);
        pending.delete(fileId);
        let current = await getStored(projectId, target, fileId);
        if (current.status === "DELETED") return;
        const send = () =>
          api.request("delete", "/api/v1/projects/{projectId}/content/{targetKind}/{targetId}/files/{fileId}", {
            path: { ...contentPath(projectId, target), fileId },
            header: { "If-Match": revisionTag(current.revision) },
          });
        await conflictAware(() => retryOnConflict(send, async () => (current = await getStored(projectId, target, fileId))));
      }),

    retry: (projectId, fileId) =>
      mapErrors(async () => {
        const kept = pending.get(fileId);
        if (!kept) invalid("Choose the file again to retry");
        await complete(projectId, kept.target, fileId, kept.blob, kept.rootId);
        return one(projectId, kept.rootId);
      }),

    restoreVersion: (projectId, fileId, version) =>
      mapErrors(async () => {
        const list = await versionsOf(api, projectId, fileId);
        const old = list.items.find((candidate) => candidate.number === version && candidate.status === "READY");
        if (!old) throw new RepositoryError("not-found", "Not found");
        if (old.id === list.currentVersionId) unsupported("This version is already the current one");
        const { data } = await api.request("get", "/api/v1/projects/{projectId}/files/{fileId}/versions/{versionId}/download", { path: { projectId, fileId, versionId: old.id } });
        const blob = data as Blob;
        return addVersion(projectId, fileId, old.filename, blob, old.mimeType);
      }),

    download: (projectId, fileId) =>
      mapErrors(async () => {
        const list = await versionsOf(api, projectId, fileId);
        const current = list.items.find((candidate) => candidate.id === list.currentVersionId);
        if (!current || current.status !== "READY") invalid("The file is not ready to download");
        const { data } = await api.request("get", "/api/v1/projects/{projectId}/files/{fileId}/versions/{versionId}/download", { path: { projectId, fileId, versionId: current.id } });
        return data as Blob;
      }),
  };
}
