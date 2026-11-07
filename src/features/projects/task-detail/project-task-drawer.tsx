"use client";

import { ArrowLeft, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";
import { ProjectTaskDetailView } from "./project-task-detail-view";

/*
 * PJ-15 drawer: the Personal P06 container (Sheet side="end" size="detail",
 * full screen on phones). Closing goes Back to the list it was opened over;
 * focus returns to the task link that opened it.
 */
export function ProjectTaskDrawer({ taskId }: { taskId: string }) {
  const t = useTranslations("ProjectTask");
  const router = useRouter();
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
        title={t("title")}
        hideTitle
        hideClose
        bodyClassName="px-3 pt-3 pb-6"
        data-scope="project"
        data-task-drawer=""
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <ProjectTaskDetailView
          taskId={taskId}
          variant="drawer"
          closeControl={
            <SheetClose asChild>
              <IconButton size="sm" variant="ghost" label={t("close")} className="shrink-0 bg-surface">
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

/**
 * The @drawer slot keeps its last state on soft navigation; show it only
 * while the URL is a project task detail (/projects/[id]/tasks/[taskId]).
 */
export function ProjectDrawerGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return /^\/projects\/[^/]+\/tasks\/[^/]+$/.test(pathname) ? children : null;
}
