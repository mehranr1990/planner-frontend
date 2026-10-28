"use client";

import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants, IconButton } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { useTask } from "@/data/queries";
import { TaskDetailView } from "@/features/tasks/detail/task-detail-view";
import { cn } from "@/lib/cn";

/*
 * P06 Task detail: two containers for one route.
 * - soft navigation inside Personal is intercepted into the @drawer slot: a
 *   520px drawer over the page it was opened from (mobile: full screen with
 *   back); closing goes back, so the page underneath never re-renders;
 * - hard navigation (shared link, refresh) renders the full page route.
 */

const TASKS_HREF = "/personal/tasks";

/** The full page (hard navigation). */
export function TaskDetailBody({ id }: { id: string }) {
  const t = useTranslations("Tasks.detail");
  const router = useRouter();
  return (
    <TaskDetailView
      id={id}
      variant="page"
      onDismiss={() => router.push(TASKS_HREF)}
      closeControl={
        <Link
          href={TASKS_HREF}
          aria-label={t("back")}
          className={cn(buttonVariants({ variant: "secondary" }), "size-10 shrink-0 rounded-full bg-surface p-0")}
        >
          <ArrowLeft aria-hidden="true" size={18} className="rtl:-scale-x-100" />
        </Link>
      }
    />
  );
}

/** The intercepted drawer (P06 desktop: right drawer 520px, mobile: full screen). */
export function TaskDetailDrawer({ id }: { id: string }) {
  const t = useTranslations("Personal");
  const tDetail = useTranslations("Tasks.detail");
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
        hideTitle
        hideClose
        bodyClassName="px-3 pt-3 pb-6"
        data-scope="personal"
        data-task-drawer=""
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <TaskDetailView
          id={id}
          variant="drawer"
          onDismiss={() => router.back()}
          closeControl={
            <SheetClose asChild>
              <IconButton size="sm" variant="ghost" label={tDetail("close")} className="shrink-0 bg-surface">
                <X aria-hidden="true" size={18} className="max-lg:hidden" />
                <ArrowLeft aria-hidden="true" size={18} className="lg:hidden rtl:-scale-x-100" />
              </IconButton>
            </SheetClose>
          }
        />
      </SheetContent>
    </Sheet>
  );
}
