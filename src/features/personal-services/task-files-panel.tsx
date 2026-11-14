"use client";

import { Download, Paperclip, Trash2, Unlink, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/state-views";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button, IconButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES, type TaskAttachment } from "@/data/personal-services";
import { saveBlob, useAttachmentWrite, useTaskAttachments } from "@/data/personal-services-queries";
import { useRepositories } from "@/data/provider";
import { useServiceError } from "./service-error";
import { useServiceFormat } from "./use-service-format";

/*
 * Task detail · Files: the task's private attachments (text, PDF, PNG,
 * JPEG, ≤ 10 MB). Upload sends the real bytes; download fetches them with
 * the session; "Detach" keeps the file, "Delete" removes its bytes.
 */

export function TaskFilesPanel({ taskId }: { taskId: string }) {
  const t = useTranslations("Services.files");
  const query = useTaskAttachments(taskId);
  const write = useAttachmentWrite(taskId);
  const message = useServiceError();
  const input = useRef<HTMLInputElement>(null);

  const upload = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
        toast({ tone: "warning", title: t("badType", { name: file.name }) });
        continue;
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        toast({ tone: "warning", title: t("tooLarge", { name: file.name }) });
        continue;
      }
      write.mutate(
        { kind: "upload", file },
        { onSuccess: () => toast({ tone: "success", title: t("uploaded", { name: file.name }) }), onError: (error) => toast({ tone: "danger", title: message(error) }) },
      );
    }
    if (input.current) input.current.value = "";
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">{t("hint")}</p>
        <Button size="sm" variant="secondary" loading={write.isPending && write.variables?.kind === "upload"} onClick={() => input.current?.click()}>
          <Upload aria-hidden="true" size={16} />
          {t("upload")}
        </Button>
        <input ref={input} type="file" multiple hidden accept={ATTACHMENT_TYPES.join(",")} aria-label={t("upload")} onChange={(event) => upload(event.target.files)} />
      </div>
      {query.isPending ? (
        <LoadingState>
          <Skeleton className="h-12 rounded-row" />
        </LoadingState>
      ) : query.isError ? (
        <ErrorState variant="bare" title={t("loadError")} description={message(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState variant="bare" icon={Paperclip} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {query.data.map((file) => (
            <FileRow key={file.fileId} taskId={taskId} file={file} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({ taskId, file }: { taskId: string; file: TaskAttachment }) {
  const t = useTranslations("Services.files");
  const format = useServiceFormat();
  const { taskFiles } = useRepositories();
  const write = useAttachmentWrite(taskId);
  const message = useServiceError();
  const [confirm, setConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const ready = file.status === "ready";

  const download = async () => {
    setDownloading(true);
    try {
      saveBlob(await taskFiles.download(file.fileId), file.name);
    } catch (error) {
      toast({ tone: "danger", title: message(error) });
    } finally {
      setDownloading(false);
    }
  };
  const run = (kind: "detach" | "remove") =>
    write.mutate(
      { kind, fileId: file.fileId },
      { onSuccess: () => toast({ tone: "neutral", title: kind === "remove" ? t("deleted") : t("detached") }), onError: (error) => toast({ tone: "danger", title: message(error) }) },
    );

  return (
    <li className="flex items-center gap-2 rounded-row bg-surface px-3 py-2 inset-ring inset-ring-line">
      <Paperclip aria-hidden="true" size={16} className="shrink-0 text-fg-muted" />
      <div className="flex min-w-0 flex-1 flex-col">
        <bdi dir="ltr" className="truncate text-sm font-semibold text-fg">
          {file.name}
        </bdi>
        <span className="text-xs text-fg-muted">
          {file.sizeBytes !== null ? t("size", { size: format.number(Math.max(1, Math.round(file.sizeBytes / 1024))) }) : "—"}
          {file.status === "ready" ? null : ` · ${t(`status.${file.status}`)}`}
        </span>
      </div>
      <IconButton size="sm" variant="ghost" icon={Download} label={t("download", { name: file.name })} disabled={!ready || downloading} onClick={() => void download()} />
      <IconButton size="sm" variant="ghost" icon={Unlink} label={t("detach", { name: file.name })} disabled={write.isPending} onClick={() => run("detach")} />
      <IconButton size="sm" variant="ghost" icon={Trash2} label={t("delete", { name: file.name })} disabled={write.isPending} onClick={() => setConfirm(true)} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="destructive"
        title={t("deleteTitle")}
        description={t("deleteBody", { name: file.name })}
        confirmLabel={t("deleteConfirm")}
        onConfirm={() => run("remove")}
      />
    </li>
  );
}
