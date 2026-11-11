"use client";

import { useTranslations } from "next-intl";
import { useTeamFileActions, useTeamFileLibrary, useTeamTasks } from "@/data/team-queries";
import { FilesView } from "@/features/projects/files/files-screen";
import { teamTaskHref } from "../source-chip";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";

/*
 * TM-11 · Team files (/teams/[id]/files): exactly the PJ-10 Files component
 * (rows, upload / scan states, versions, preview signature card with notch
 * Download) through its scope seam, with team folders and the indigo scope.
 * Team files only: project files are never mirrored. Linked tasks show only
 * tasks the viewer can open. No guests, no storage meter.
 */
export function TeamFilesScreen() {
  const tFiles = useTranslations("Files");
  const t = useTranslations("Team.files");
  const { team, capabilities, demo } = useTeam();
  const library = useTeamFileLibrary(team.id);
  const actions = useTeamFileActions(team.id);
  const tasks = useTeamTasks(team.id);
  return (
    <FilesView
      scope={{
        scope: "team",
        header: (actions) => <TeamPageHeader module="files" title={tFiles("title")} actions={actions} />,
        library,
        actions,
        canUpload: capabilities.uploadFile,
        canManage: capabilities.manageFiles,
        guest: false,
        demo,
        tasks: tasks.data,
        taskHref: (taskId) => {
          const task = tasks.data?.find((item) => item.id === taskId);
          return task ? teamTaskHref(team.id, task) : "#";
        },
        allFilesLabel: t("all"),
        folderNote: t("note"),
      }}
    />
  );
}
