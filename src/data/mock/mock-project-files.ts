import { projectPeople } from "@/fixtures/projects";
import { sampleFileConfig, sampleFileFolders, sampleFiles } from "@/fixtures/project-files";
import type { FileFolder, ProjectFile, ProjectPerson, ProjectRole } from "../project-domain";
import type { FileRepository, ProjectAccessOptions } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { isMine, type ProjectWorkStore } from "./mock-project-work";

/*
 * PJ-10 files for the mock adapter (fileRepo). Uploads run a timed
 * lifecycle like the signed-upload + scan backend would: queued →
 * uploading (progress steps) → scanning → ready. Limits come from the mock
 * server config (blocked extensions, max size) and are checked here, never
 * in the UI. Guests get only the guest-shared folder plus files linked to
 * their tasks; other folders are not listed. Download returns a mock blob
 * and is refused until the file is ready.
 */

export interface MockFilesOptions {
  /** The project work store (guest visibility by linked tasks); teams have no guests. */
  store?: ProjectWorkStore;
  respond<T>(value: T): Promise<T>;
  now: string;
  roleOf(projectId: string, options?: ProjectAccessOptions): ProjectRole | undefined;
  /** Milliseconds per lifecycle step (0 in tests = advance on demand via `tick`). */
  stepMs?: number;
  /** Folders and files per owner (default: Website Redesign). TM-11 seeds team folders. */
  seed?: { folders: Readonly<Record<string, readonly FileFolder[]>>; files: Readonly<Record<string, readonly ProjectFile[]>> };
  /** Uploads that drop once with "connection lost" (default: the PJ-10 fixture). */
  failOnce?: readonly string[];
  /** Who uploads (default: the Projects "me"). */
  me?: ProjectPerson;
}

const PROGRESS_STEP = 20;

export function createMockFiles({
  store,
  respond,
  now,
  roleOf,
  stepMs = 600,
  seed = { folders: { "website-redesign": sampleFileFolders }, files: { "website-redesign": sampleFiles } },
  failOnce: dropOnce = ["empty-states"],
  me = projectPeople.me,
}: MockFilesOptions) {
  const folders = new Map<string, FileFolder[]>(Object.entries(seed.folders).map(([id, list]) => [id, structuredClone([...list])]));
  const files = new Map<string, ProjectFile[]>(Object.entries(seed.files).map(([id, list]) => [id, structuredClone([...list])]));
  /** Fixture that drops once ("connection lost") so Retry is reachable. */
  const failOnce = new Set(dropOnce);
  let seq = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const locate = (fileId: string) => {
    for (const [projectId, list] of files) {
      const index = list.findIndex((candidate) => candidate.id === fileId);
      if (index >= 0) return { projectId, list, index, file: list[index]! };
    }
    throw new RepositoryError("not-found", `No file ${fileId}`);
  };

  /** One lifecycle step for every in-flight file. */
  const tick = () => {
    let active = false;
    for (const list of files.values()) {
      for (const file of list) {
        if (file.state === "queued") {
          file.state = "uploading";
          file.progress = 0;
          active = true;
        } else if (file.state === "uploading") {
          const next = Math.min(100, (file.progress ?? 0) + PROGRESS_STEP);
          if (failOnce.has(file.id) && next >= 80) {
            failOnce.delete(file.id);
            file.state = "failed";
            file.failReason = "connection";
            delete file.progress;
          } else if (next >= 100) {
            file.state = "scanning";
            delete file.progress;
            active = true;
          } else {
            file.progress = next;
            active = true;
          }
        } else if (file.state === "scanning") {
          file.state = "ready";
        }
      }
    }
    if (!active && timer && !hasInFlight()) {
      clearInterval(timer);
      timer = null;
    }
  };

  const hasInFlight = () =>
    [...files.values()].some((list) => list.some((file) => ["queued", "uploading", "scanning"].includes(file.state)));

  const kick = () => {
    if (stepMs > 0 && !timer && hasInFlight()) timer = setInterval(tick, stepMs);
  };

  const project = (projectId: string, options?: ProjectAccessOptions) => {
    const role = roleOf(projectId, options);
    if (!role) throw new RepositoryError("not-found", `No project ${projectId}`);
    return role;
  };

  const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
  const mediaOf = (name: string): ProjectFile["media"] => {
    const ext = extension(name);
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (["doc", "docx", "txt", "md", "rtf"].includes(ext)) return "doc";
    if (["csv", "xls", "xlsx"].includes(ext)) return "sheet";
    if (["fig", "sketch", "psd", "ai"].includes(ext)) return "design";
    return "other";
  };

  const repo: FileRepository = {
    async list(projectId, options) {
      const role = project(projectId, options);
      kick();
      const allFolders = folders.get(projectId) ?? [];
      const allFiles = files.get(projectId) ?? [];
      const guest = role === "guest";
      const myTaskIds = new Set((store?.tasks.get(projectId) ?? []).filter(isMine).map((task) => task.id));
      const guestFolderIds = new Set(allFolders.filter((folder) => folder.sharedWithGuests).map((folder) => folder.id));
      const visible = guest
        ? allFiles.filter(
            (file) =>
              (file.folderId && guestFolderIds.has(file.folderId)) || file.taskIds.some((id) => myTaskIds.has(id)),
          )
        : allFiles;
      const shownFolders = guest ? allFolders.filter((folder) => folder.sharedWithGuests) : allFolders;
      return respond({
        folders: shownFolders.map((folder) => ({
          ...folder,
          count: visible.filter((file) => file.folderId === folder.id).length,
        })),
        files: visible.map((file) => (guest && file.folderId && !guestFolderIds.has(file.folderId) ? { ...file, folderId: null } : file)),
        total: visible.length,
      });
    },
    config: async (projectId) => {
      project(projectId);
      return respond(sampleFileConfig);
    },
    async upload(projectId, { name, sizeBytes, folderId, asNewVersionOf }) {
      project(projectId);
      const list = files.get(projectId) ?? [];
      files.set(projectId, list);
      const blockReason = sampleFileConfig.blockedExtensions.includes(extension(name))
        ? ("type" as const)
        : sizeBytes > sampleFileConfig.maxBytes
          ? ("size" as const)
          : undefined;
      if (asNewVersionOf) {
        const { file } = locate(asNewVersionOf);
        const version = file.version + 1;
        Object.assign(file, {
          version,
          versions: [{ version, by: me, at: now }, ...file.versions],
          sizeBytes,
          uploadedBy: me,
          updatedAt: now,
          state: blockReason ? "blocked" : "queued",
          blockReason,
        });
        kick();
        return respond(file);
      }
      const file: ProjectFile = {
        id: `file-new-${++seq}`,
        name,
        folderId,
        sizeBytes,
        media: mediaOf(name),
        state: blockReason ? "blocked" : "queued",
        blockReason,
        version: 1,
        versions: [{ version: 1, by: me, at: now }],
        uploadedBy: me,
        updatedAt: now,
        taskIds: [],
      };
      list.unshift(file);
      kick();
      return respond(file);
    },
    async cancel(fileId) {
      const { list, index, file } = locate(fileId);
      if (!["queued", "uploading", "failed", "blocked"].includes(file.state))
        throw new RepositoryError("invalid", "Only unfinished uploads can be cancelled");
      list.splice(index, 1);
      return respond(undefined);
    },
    async retry(fileId) {
      const { file } = locate(fileId);
      if (file.state !== "failed") throw new RepositoryError("invalid", "Only failed uploads retry");
      file.state = "queued";
      delete file.failReason;
      kick();
      return respond(file);
    },
    async restoreVersion(fileId, version) {
      const { file } = locate(fileId);
      const old = file.versions.find((candidate) => candidate.version === version);
      if (!old || version === file.version) throw new RepositoryError("invalid", "Pick an older version");
      const next = file.version + 1;
      file.versions = [{ version: next, by: me, at: now, restoredFrom: version }, ...file.versions];
      file.version = next;
      file.updatedAt = now;
      return respond(file);
    },
    async download(fileId) {
      const { file } = locate(fileId);
      if (file.state !== "ready") throw new RepositoryError("invalid", "Not ready for download");
      return new Blob([`Mock contents of ${file.name}`], { type: "application/octet-stream" });
    },
  };

  return { files: repo, tick };
}
