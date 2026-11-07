"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useProjectTaskDetail } from "@/data/project-queries";
import { consumeOpenedSheet, SHEET_PARAM } from "@/features/sheets/sheet-params";
import { useCurrentProjectAccess } from "../use-current-project";
import { AssignmentReassignSheet } from "./assignment-reassign-sheet";
import { NewProjectSheet } from "./new-project-sheet";
import { ProjectInviteSheet } from "./project-invite-sheet";
import { isProjectSheetId, projectSheetHref, type ProjectSheetId } from "./project-sheet-params";

/*
 * PJ-90 sheet host for every /projects route: ?sheet=project-new ·
 * project-invite · assignment-reassign (ids never collide with Personal's).
 * New project and Invite are 420px end drawers, Reassign a centred panel
 * (the board's popover); all three are bottom sheets on phones. Closing goes
 * Back when this tab opened the sheet, else drops the parameter.
 */
export function ProjectSheetHost() {
  const params = useSearchParams();
  const id = params.get(SHEET_PARAM);
  if (!isProjectSheetId(id)) return null;
  return <ProjectSheet key={id} id={id} />;
}

function ProjectSheet({ id }: { id: ProjectSheetId }) {
  const t = useTranslations("Projects.sheets");
  const router = useRouter();
  const pathname = usePathname();
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);

  const close = useCallback(() => {
    if (consumeOpenedSheet()) router.back();
    else router.replace(projectSheetHref(pathname, window.location.search, null), { scroll: false });
  }, [router, pathname]);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target instanceof HTMLElement && target.isConnected && target !== document.body) target.focus();
    else document.getElementById("main-content")?.focus();
  }, []);

  const { project } = useCurrentProjectAccess();
  const taskId = useSearchParams().get("task") ?? "";
  const reassignTask = useProjectTaskDetail(taskId);
  const title =
    id === "project-new"
      ? t("new.title")
      : id === "project-invite"
        ? t("invite.title", { project: project?.name ?? "" })
        : t("reassign.title", { task: reassignTask.data?.task.title ?? "" });
  return (
    <Sheet
      defaultOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        side={id === "assignment-reassign" ? "center" : "end"}
        size="drawer"
        title={title}
        data-scope="project"
        data-project-sheet={id}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {id === "project-new" ? <NewProjectSheet onDone={close} /> : null}
        {id === "project-invite" ? <ProjectInviteSheet onDone={close} /> : null}
        {id === "assignment-reassign" ? <AssignmentReassignSheet onDone={close} /> : null}
      </SheetContent>
    </Sheet>
  );
}
