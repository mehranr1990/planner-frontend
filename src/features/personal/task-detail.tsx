"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useTask } from "@/data/queries";

/*
 * Task detail skeleton (P06). Two containers for one route:
 * - soft navigation inside Personal is intercepted into the @drawer slot: a
 *   520px drawer over the page it was opened from (mobile: full screen);
 *   closing goes back, so the page underneath never re-renders;
 * - hard navigation (shared link, refresh) renders the full page route.
 */

export function TaskDetailBody({ id }: { id: string }) {
  const t = useTranslations("Personal");
  const task = useTask(id);
  if (task.isPending) return <p className="text-sm text-fg-muted">{t("seams.loading")}</p>;
  if (!task.data) {
    return (
      <p role="status" className="text-sm text-fg-secondary">
        {t("taskDetail.notFound")}
      </p>
    );
  }
  return (
    <dl data-probe="task" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <dt className="type-label text-fg-muted">{t("pages.taskDetail.title")}</dt>
        <dd className="text-sm font-semibold text-fg">
          <bdi dir="auto">{task.data.title}</bdi>
        </dd>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <dt className="type-label text-fg-muted">id</dt>
        <dd dir="ltr" className="font-mono text-xs text-fg-secondary">
          {task.data.id} · {t(`taskDetail.status.${task.data.status}`)}
        </dd>
      </div>
    </dl>
  );
}

/** The intercepted drawer (P06 desktop: right drawer 520px, mobile: full screen). */
export function TaskDetailDrawer({ id }: { id: string }) {
  const t = useTranslations("Personal");
  const router = useRouter();
  const task = useTask(id);
  // The task link that opened the drawer still has focus when it mounts; Radix
  // can only return focus to its own Trigger, and this drawer has none.
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    else document.getElementById("main-content")?.focus();
  }, []);
  return (
    <Sheet
      defaultOpen
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <SheetContent
        side="end"
        size="detail"
        mobileSide="fullscreen"
        title={task.data?.title ?? t("pages.taskDetail.title")}
        description={t("pages.taskDetail.purpose")}
        data-scope="personal"
        data-task-drawer=""
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <TaskDetailBody id={id} />
      </SheetContent>
    </Sheet>
  );
}
