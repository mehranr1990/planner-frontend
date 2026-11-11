"use client";

import { Download, FileText, Folder, Plus, RotateCcw, Upload, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { EmptyState, NoResultsState } from "@/components/feedback/state-views";
import { ComingSoonBadge } from "@/components/navigation/coming-soon-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { PillGroup } from "@/components/ui/pills";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { Progress } from "@/design-system/feedback/progress";
import type { FileLibrary, ProjectFile } from "@/data/project-domain";
import { useFileActions, useFileLibrary, useProjectTasks } from "@/data/project-queries";
import { projectHref } from "@/features/navigation/contexts";
import { cn } from "@/lib/cn";
import { demoAccessOptions } from "../demo-state";
import { useProjectFormat } from "../format";
import { useProject } from "../project-gate";
import { ProjectPageHeader } from "../project-page-header";
import { useMediaQuery } from "../use-media";

/*
 * PJ-10 · Files (/projects/[id]/files). One folder level + smart filters
 * (D14). File rows carry the upload lifecycle: queued → uploading (progress,
 * cancel) → scanning (download off) → ready; blocked (type / size / scan,
 * limits from the server) and failed (Retry). Drop zone + Upload; a file
 * with the same name asks "Upload as new version?". Preview = SignatureCard
 * whose notch is Download (disabled with the reason while not ready),
 * versions (restore = new version) and linked tasks. No storage meter.
 * Guests see only guest-shared files (other folders are not listed).
 * `?folder=`, `?file=` keep the selection; phones: folder pills, list,
 * preview full screen.
 *
 * Scope seam (TM-11): `FilesView` takes a `FilesScope` (header, data hooks,
 * rights, linked tasks) so Team files reuse this exact component; the
 * project binding is `FilesScreen` below.
 */

export interface FilesScope {
  scope: "project" | "team";
  /** The page header with these actions (upload, list/grid). */
  header: (actions: ReactNode) => ReactNode;
  library: { data: FileLibrary | undefined };
  actions: ReturnType<typeof useFileActions>;
  canUpload: boolean;
  canManage: boolean;
  guest: boolean;
  /** Demo state (?state=): "empty" / "pending" / "quota" are handled here. */
  demo: string | null;
  /** Tasks the viewer can open (for "linked to" and the preview links). */
  tasks: readonly { id: string; title: string }[] | undefined;
  taskHref: (taskId: string) => string;
  allFilesLabel?: string;
  /** Under the folder list (e.g. "Project files stay in their projects."). */
  folderNote?: string;
}

const FilesScopeContext = createContext<FilesScope | null>(null);

function useFilesScope(): FilesScope {
  const scope = useContext(FilesScopeContext);
  if (!scope) throw new Error("FilesView missing");
  return scope;
}

type FileFilter = "all" | "images" | "docs" | "linked";

const BADGE_CLASS: Record<ProjectFile["media"], string> = {
  design: "bg-company-soft text-company-deep",
  sheet: "bg-success-soft text-success-text",
  pdf: "bg-danger-soft text-danger-text",
  image: "bg-warning-soft text-warning-text",
  doc: "bg-info-soft text-info-text",
  other: "bg-raised text-fg-secondary",
};

function extensionOf(name: string) {
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return ext.slice(0, 4).toUpperCase();
}

function useFileSize() {
  const t = useTranslations("Files.size");
  const format = useProjectFormat();
  return (bytes: number) =>
    bytes >= 1024 * 1024
      ? t("mb", { n: format.number(Math.round((bytes / (1024 * 1024)) * 10) / 10) })
      : t("kb", { n: format.number(Math.max(1, Math.round(bytes / 1024))) });
}

/** PJ-10 binding: the project files. */
export function FilesScreen() {
  const t = useTranslations("Files");
  const { project, capabilities, demo } = useProject();
  const library = useFileLibrary(project.id, demoAccessOptions(demo));
  const actions = useFileActions(project.id);
  const tasks = useProjectTasks(project.id, {});
  return (
    <FilesView
      scope={{
        scope: "project",
        header: (actions) => <ProjectPageHeader module="files" title={t("title")} actions={actions} />,
        library,
        actions,
        canUpload: capabilities.uploadFile,
        canManage: capabilities.manageFiles,
        guest: project.role === "guest",
        demo,
        tasks: tasks.data?.tasks,
        taskHref: (taskId) => `${projectHref(project.id, "tasks")}/${encodeURIComponent(taskId)}`,
      }}
    />
  );
}

export function FilesView({ scope }: { scope: FilesScope }) {
  return (
    <FilesScopeContext.Provider value={scope}>
      <FilesBody />
    </FilesScopeContext.Provider>
  );
}

function FilesBody() {
  const t = useTranslations("Files");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const scope = useFilesScope();
  const { library, actions, demo, guest } = scope;
  const phone = useMediaQuery("(max-width: 39.99rem)");
  const inputRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [search, setSearch] = useState("");
  const [pendingVersion, setPendingVersion] = useState<{ file: File; existing: ProjectFile } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const canUpload = scope.canUpload && demo !== "empty";

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false });
  };

  const data: FileLibrary | undefined =
    demo === "empty" && library.data ? { ...library.data, files: [], total: 0, folders: library.data.folders.map((folder) => ({ ...folder, count: 0 })) } : library.data;

  const startUpload = (file: File) => {
    const existing = data?.files.find((candidate) => candidate.name === file.name);
    if (existing) {
      setPendingVersion({ file, existing });
      return;
    }
    actions.upload.mutate({ name: file.name, sizeBytes: file.size, folderId: params.get("folder") });
  };
  const onFiles = (list: FileList | null) => {
    if (!list) return;
    for (const file of Array.from(list)) startUpload(file);
  };

  const header = scope.header(
        <>
          {!phone ? (
            <Segmented
              label={t("view.label")}
              value={layout}
              onValueChange={setLayout}
              options={[
                { value: "list", label: t("view.list") },
                { value: "grid", label: t("view.grid") },
              ]}
            />
          ) : null}
          {canUpload ? (
            phone ? (
              <IconButton label={t("upload")} onClick={() => inputRef.current?.click()}>
                <Icon icon={Upload} size={18} />
              </IconButton>
            ) : (
              <Button size="lg" className="gap-2" onClick={() => inputRef.current?.click()}>
                <Icon icon={Upload} size={18} />
                {t("upload")}
              </Button>
            )
          ) : null}
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              onFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </>,
  );

  if (!data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  if (data.total === 0 && !guest) {
    return (
      <>
        {header}
        <EmptyState
          variant="card"
          icon={FileText}
          title={t("empty")}
          description={t("emptyBody")}
          titleAs="h2"
          primaryAction={
            scope.canUpload ? (
              <Button onClick={() => inputRef.current?.click()}>{t("upload")}</Button>
            ) : undefined
          }
        />
      </>
    );
  }

  const folderId = params.get("folder");
  const folder = data.folders.find((candidate) => candidate.id === folderId) ?? null;
  const query = search.trim().toLocaleLowerCase();
  const shown = data.files.filter(
    (file) =>
      (!folder || file.folderId === folder.id) &&
      (filter === "all" ||
        (filter === "images" && file.media === "image") ||
        (filter === "docs" && (file.media === "doc" || file.media === "pdf" || file.media === "sheet")) ||
        (filter === "linked" && file.taskIds.length > 0)) &&
      (!query || file.name.toLocaleLowerCase().includes(query)),
  );
  const selected = data.files.find((file) => file.id === params.get("file")) ?? (phone ? null : shown[0]) ?? null;
  const folderName = (id: string | null) => data.folders.find((candidate) => candidate.id === id)?.name ?? t("unfiled");

  const select = (file: ProjectFile) => {
    setParam("file", file.id);
    if (phone) setSheetOpen(true);
  };

  const preview = selected ? (
    <FilePreview
      file={selected}
      folderName={folderName(selected.folderId)}
      onUploadVersion={() => inputRef.current?.click()}
    />
  ) : null;

  const folderPicker = (
    <nav aria-label={t("folders")} className={cn(phone ? "" : "rounded-[28px] bg-surface p-3")}>
      <ul className={cn(phone ? "flex gap-1.5 overflow-x-auto pb-1" : "flex flex-col gap-1")}>
        {[{ id: null as string | null, name: scope.allFilesLabel ?? t("allFiles"), count: data.total }, ...data.folders].map((item) => {
          const active = (item.id ?? null) === (folder?.id ?? null);
          return (
            <li key={item.id ?? "all"} className="shrink-0">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setParam("folder", item.id)}
                className={cn(
                  phone
                    ? "inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3.5 text-xs font-semibold"
                    : "flex min-h-11 w-full items-center gap-2.5 rounded-[18px] px-3 text-start text-sm font-semibold",
                  "focus-visible:focus-ring",
                  active
                    ? phone
                      ? "bg-scope-soft text-scope-deep"
                      : "bg-surface inset-ring-[1.5px] inset-ring-scope-deep text-fg"
                    : "text-fg-secondary hover:text-fg max-sm:inset-ring max-sm:inset-ring-outline",
                )}
              >
                {!phone ? <Icon icon={item.id ? Folder : FileText} size={16} className="text-fg-secondary" /> : null}
                <bdi className="min-w-0 flex-1 truncate">{item.name}</bdi>
                <FolderCount n={item.count} />
              </button>
            </li>
          );
        })}
        {!phone && scope.canManage ? (
          <li>
            {/* Folder creation has no spec yet (one level, D14): coming soon. */}
            <button
              type="button"
              aria-disabled
              className="flex min-h-11 w-full items-center gap-2.5 rounded-[18px] px-3 text-start text-sm font-semibold text-fg-secondary opacity-70"
            >
              <Icon icon={Plus} size={16} />
              {t("newFolder")}
              <ComingSoonBadge />
            </button>
          </li>
        ) : null}
      </ul>
      {scope.folderNote && !phone ? <p className="px-3 pt-3 text-xs font-medium text-fg-secondary">{scope.folderNote}</p> : null}
    </nav>
  );

  return (
    <>
      {header}
      {demo === "pending" || demo === "quota" ? <AccessState kind={demo} titleAs="h2" /> : null}
      {guest ? <p className="text-xs font-medium text-fg-secondary">{t("guest")}</p> : null}
      <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)] min-[1180px]:grid-cols-[220px_minmax(0,1fr)_minmax(300px,360px)]">
        {folderPicker}
        <section aria-labelledby="files-list" className="flex min-w-0 flex-col gap-3 sm:rounded-[28px] sm:bg-surface sm:p-4">
          <h2 id="files-list" className="sr-only">
            {folder?.name ?? scope.allFilesLabel ?? t("allFiles")}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PillGroup
              label={t("filters.label")}
              value={filter}
              onValueChange={setFilter}
              options={(["all", "images", "docs", "linked"] as const).map((value) => ({
                value,
                label: t(`filters.${value}`),
              }))}
            />
            <SearchField
              aria-label={t("search")}
              placeholder={t("search")}
              value={search}
              onValueChange={setSearch}
              className="w-full sm:w-56"
            />
          </div>
          {shown.length === 0 ? (
            <NoResultsState variant="dashed" title={t("noMatch")} titleAs="h3" />
          ) : (
            <ul className={cn(layout === "grid" && !phone ? "grid grid-cols-2 gap-2 xl:grid-cols-3" : "flex flex-col gap-2")}>
              {shown.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  folderName={folderName(file.folderId)}
                  selected={file.id === selected?.id}
                  grid={layout === "grid" && !phone}
                  onSelect={() => select(file)}
                  onCancel={() => actions.cancel.mutate(file.id)}
                  onRetry={() => actions.retry.mutate(file.id)}
                />
              ))}
            </ul>
          )}
          {scope.canUpload && !phone ? <DropZone onFiles={onFiles} onPick={() => inputRef.current?.click()} /> : null}
        </section>
        {!phone && preview ? <div className="sm:col-span-2 min-[1180px]:col-span-1">{preview}</div> : null}
      </div>
      {phone && selected ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent title={t("preview.back")} hideTitle side="end" mobileSide="fullscreen" data-scope={scope.scope}>
            {preview}
          </SheetContent>
        </Sheet>
      ) : null}
      {pendingVersion ? (
        <Dialog open onOpenChange={(open) => !open && setPendingVersion(null)}>
          <DialogContent
            title={t("versionPrompt.title")}
            description={t("versionPrompt.body", {
              name: pendingVersion.existing.name,
              n: pendingVersion.existing.version + 1,
            })}
            size="sm"
            data-scope={scope.scope}
          >
            <DialogFooter>
              <Button variant="secondary" onClick={() => setPendingVersion(null)}>
                {t("versionPrompt.cancel")}
              </Button>
              <Button
                onClick={() => {
                  actions.upload.mutate({
                    name: pendingVersion.file.name,
                    sizeBytes: pendingVersion.file.size,
                    folderId: pendingVersion.existing.folderId,
                    asNewVersionOf: pendingVersion.existing.id,
                  });
                  setPendingVersion(null);
                }}
              >
                {t("newVersion")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function FolderCount({ n }: { n: number }) {
  const format = useProjectFormat();
  return <span className="text-xs font-bold text-fg-muted tabular">{format.number(n)}</span>;
}

function DropZone({ onFiles, onPick }: { onFiles: (list: FileList | null) => void; onPick: () => void }) {
  const t = useTranslations("Files");
  const [over, setOver] = useState(false);
  const hintId = useId();
  const stop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <button
      type="button"
      onClick={onPick}
      aria-describedby={hintId}
      onDragEnter={(event) => {
        stop(event);
        setOver(true);
      }}
      onDragOver={stop}
      onDragLeave={(event) => {
        stop(event);
        setOver(false);
      }}
      onDrop={(event) => {
        stop(event);
        setOver(false);
        onFiles(event.dataTransfer.files);
      }}
      className={cn(
        "flex items-center gap-3 rounded-[20px] border-[1.5px] border-dashed px-4 py-3 text-start focus-visible:focus-ring",
        over ? "border-scope-deep bg-scope-soft" : "border-outline",
      )}
    >
      <Icon icon={Upload} size={18} className="shrink-0 text-scope-deep" />
      <span className="text-sm font-bold text-fg">{t("drop")}</span>
      <span id={hintId} className="text-xs font-medium text-fg-secondary">
        {t("dropHint")}
      </span>
    </button>
  );
}

function FileRow({
  file,
  folderName,
  selected,
  grid,
  onSelect,
  onCancel,
  onRetry,
}: {
  file: ProjectFile;
  folderName: string;
  selected: boolean;
  grid: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("Files");
  const format = useProjectFormat();
  const size = useFileSize();
  const { tasks } = useFilesScope();
  const firstTask = tasks?.find((task) => task.id === file.taskIds[0]);
  const meta = [t("meta", { folder: folderName, size: size(file.sizeBytes) })];
  if (file.taskIds.length > 1) meta.push(t("linkedCount", { n: file.taskIds.length }));
  else if (firstTask) meta.push(t("linkedTo", { title: firstTask.title }));

  if (file.state === "failed") {
    return (
      <li className={cn("flex items-center gap-3 rounded-[22px] bg-danger-soft p-3", grid && "col-span-full")}>
        <Icon icon={X} size={16} className="shrink-0 text-danger-text" />
        <bdi className="min-w-0 flex-1 truncate text-sm font-bold text-danger-text">{t("failed", { name: file.name })}</bdi>
        <Button size="sm" variant="secondary" className="bg-surface" onClick={onRetry}>
          {t("retry")}
        </Button>
        <IconButton size="sm" variant="ghost" label={t("cancel")} onClick={onCancel}>
          <Icon icon={X} size={16} />
        </IconButton>
      </li>
    );
  }

  const status =
    file.state === "uploading" || file.state === "queued" ? (
      <span className="flex min-w-32 flex-col gap-1">
        <span className="text-xs font-bold text-fg">
          {file.state === "queued" ? t("queued") : t("uploading", { percent: format.percent(file.progress ?? 0) })}
        </span>
        <Progress value={file.progress ?? 0} label={file.name} size="sm" />
      </span>
    ) : file.state === "scanning" ? (
      <span className="inline-flex min-h-7 items-center rounded-pill bg-warning-soft px-3 text-xs font-bold text-warning-text">
        {t("scanning")}
      </span>
    ) : file.state === "blocked" ? (
      <span className="inline-flex min-h-7 items-center rounded-pill bg-danger-soft px-3 text-xs font-bold text-danger-text">
        {file.blockReason === "type" ? t("blockedType") : file.blockReason === "size" ? t("blockedSize") : t("blocked")}
      </span>
    ) : (
      <span className="inline-flex min-h-6 items-center rounded-pill px-2 text-xs font-bold text-fg inset-ring inset-ring-outline">
        v{format.number(file.version)}
      </span>
    );

  return (
    <li className="relative">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-3 rounded-[22px] bg-surface p-3 text-start inset-ring inset-ring-outline focus-visible:focus-ring",
          grid && "flex-col items-start",
          selected && "inset-ring-[1.5px] inset-ring-scope-deep",
          file.state === "uploading" && "pe-12",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-[14px] text-[0.625rem] font-bold",
            BADGE_CLASS[file.media],
          )}
        >
          {extensionOf(file.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi className="truncate text-sm font-bold text-fg">{file.name}</bdi>
          <span className="truncate text-xs font-medium text-fg-secondary">
            <bdi>{meta.join(" · ")}</bdi>
          </span>
        </span>
        <span className={cn("flex items-center gap-2", !grid && "max-sm:hidden")}>
          {status}
          <Avatar
            name={file.uploadedBy.name}
            initials={file.uploadedBy.initials}
            size={32}
            decorative
            className="size-7 text-[0.625rem]"
          />
          <span className="w-14 text-end text-xs font-medium text-fg-secondary">{format.relative(file.updatedAt)}</span>
        </span>
        <span className={cn("sm:hidden", grid && "hidden")}>{file.state === "ready" ? null : status}</span>
      </button>
      {file.state === "uploading" || file.state === "queued" ? (
        <IconButton
          size="sm"
          variant="ghost"
          label={t("cancel")}
          onClick={onCancel}
          className="absolute end-2 top-1/2 -translate-y-1/2"
        >
          <Icon icon={X} size={16} />
        </IconButton>
      ) : null}
    </li>
  );
}

function FilePreview({
  file,
  folderName,
  onUploadVersion,
}: {
  file: ProjectFile;
  folderName: string;
  onUploadVersion: () => void;
}) {
  const t = useTranslations("Files");
  const format = useProjectFormat();
  const size = useFileSize();
  const { actions, tasks, canManage, canUpload, taskHref } = useFilesScope();
  const reasonId = useId();
  const headingId = useId();
  const ready = file.state === "ready";
  const reason = ready ? null : file.state === "blocked" || file.state === "failed" ? t("preview.downloadBlocked") : t("preview.downloadOff");
  const canVersion = canManage || (canUpload && file.uploadedBy.id === "me");
  const linked = file.taskIds
    .map((id) => tasks?.find((task) => task.id === id))
    .filter((task) => task !== undefined);

  const download = async () => {
    if (!ready) return;
    const blob = await actions.download(file.id);
    if (typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SignatureCard
      as="section"
      aria-labelledby={headingId}
      action={
        <SignatureCardAction
          icon={Download}
          variant="neutral"
          label={t("preview.download")}
          aria-disabled={!ready || undefined}
          aria-describedby={reason ? reasonId : undefined}
          className={cn(!ready && "opacity-60")}
          onClick={() => void download()}
        />
      }
      contentClassName="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-xs font-bold tracking-[0.08em] text-fg-secondary uppercase">{t("preview.label")}</p>
        <h2 id={headingId} className="type-title break-words text-fg">
          <bdi>{file.name}</bdi>
        </h2>
        <p className="text-xs font-medium text-fg-secondary">
          <bdi>
            {size(file.sizeBytes)} · v{format.number(file.version)} · {folderName}
          </bdi>
        </p>
        {reason ? (
          <p id={reasonId} className="text-xs font-semibold text-warning-text">
            {reason}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "flex aspect-[16/9] items-center justify-center rounded-[20px] text-xs font-semibold",
          file.media === "image" || file.media === "pdf"
            ? "bg-[linear-gradient(135deg,var(--color-company-soft),var(--color-info-soft))] text-fg-secondary"
            : "bg-subtle text-fg-muted",
        )}
      >
        {file.media === "image" || file.media === "pdf" ? t("preview.hint") : t("preview.noPreview")}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold tracking-[0.08em] text-fg-secondary uppercase">{t("preview.versions")}</h3>
        <ul className="flex flex-col gap-1.5">
          {file.versions.slice(0, 4).map((version) => (
            <li key={version.version} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  "inline-flex min-h-6 items-center rounded-pill px-2 text-xs font-bold",
                  version.version === file.version ? "bg-scope-soft text-scope-deep" : "text-fg inset-ring inset-ring-outline",
                )}
              >
                v{format.number(version.version)}
              </span>
              <bdi className="min-w-0 flex-1 truncate font-semibold text-fg">
                {version.by.name}
                {version.note ? ` · ${version.note}` : ""}
                {version.restoredFrom ? ` · ${t("preview.restoredFrom", { n: format.number(version.restoredFrom) })}` : ""}
              </bdi>
              <span className="text-xs font-medium text-fg-secondary">{format.relative(version.at)}</span>
              {canVersion && version.version !== file.version && ready ? (
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={t("preview.restoreLabel", { n: format.number(version.version) })}
                  onClick={() =>
                    actions.restoreVersion.mutate(
                      { fileId: file.id, version: version.version },
                      { onSuccess: (saved) => toast({ title: t("preview.restored", { n: format.number(saved.version) }) }) },
                    )
                  }
                >
                  <Icon icon={RotateCcw} size={14} />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
        {canVersion ? (
          <Button variant="ghost" size="sm" className="gap-2 self-start" onClick={onUploadVersion}>
            <Icon icon={Upload} size={16} />
            {t("newVersion")}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold tracking-[0.08em] text-fg-secondary uppercase">{t("preview.linkedTasks")}</h3>
        {linked.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("preview.noLinks")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {linked.map((task) => (
              <li key={task.id}>
                <Link
                  href={taskHref(task.id)}
                  className="inline-flex min-h-8 items-center rounded-pill bg-subtle px-3 text-xs font-semibold text-fg hover:text-scope-deep focus-visible:focus-ring"
                >
                  <bdi>{task.title}</bdi>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SignatureCard>
  );
}

