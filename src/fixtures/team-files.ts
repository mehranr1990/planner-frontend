/*
 * SAMPLE DATA for TM-11 Team files (Design Team; mock now Tue 13 Oct 2026
 * 14:35). Team files only: project files are never mirrored here. Same
 * shapes as PJ-10 (the same file service). File names are user content.
 */

import type { FileFolder, ProjectFile, ProjectFileVersion, ProjectPerson } from "@/data/project-domain";
import { teamPeople } from "./teams";

const { harry, sarah, ava, amelie, katy, jonathan } = teamPeople;

const MB = 1024 * 1024;
const v = (version: number, by: ProjectPerson, at: string, note?: string): ProjectFileVersion => ({ version, by, at, note });

type Seed = Omit<ProjectFile, "versions" | "version" | "taskIds" | "state"> &
  Partial<Pick<ProjectFile, "versions" | "taskIds" | "state" | "progress">>;

const file = (seed: Seed): ProjectFile => {
  const versions = seed.versions ?? [v(1, seed.uploadedBy, seed.updatedAt)];
  return { state: "ready", taskIds: [], ...seed, versions, version: versions[0]!.version };
};

export const teamFileFolders: Readonly<Record<string, readonly FileFolder[]>> = {
  design: [
    { id: "critiques", name: "Critiques" },
    { id: "research", name: "Research" },
    { id: "brand", name: "Brand assets" },
  ],
  mobile: [{ id: "releases", name: "Releases" }],
  growth: [],
};

export const teamFiles: Readonly<Record<string, readonly ProjectFile[]>> = {
  design: [
    file({
      id: "tf-variant-c",
      name: "onboarding-variant-c.png",
      folderId: "research",
      sizeBytes: 1.2 * MB,
      media: "image",
      uploadedBy: amelie,
      updatedAt: "2026-10-13T14:34:00+03:30",
      state: "uploading",
      progress: 60,
    }),
    file({
      id: "tf-icon-set",
      name: "Icon set v2.fig",
      folderId: "brand",
      sizeBytes: 8.1 * MB,
      media: "design",
      uploadedBy: sarah,
      updatedAt: "2026-10-13T09:30:00+03:30",
      taskIds: ["t-icons"],
      versions: [
        v(3, sarah, "2026-10-13T09:30:00+03:30", "review fixes"),
        v(2, sarah, "2026-10-09T11:00:00+03:30"),
        v(1, katy, "2026-10-04T10:00:00+03:30"),
      ],
    }),
    file({
      id: "tf-critique-w41",
      name: "Critique W41 notes.pdf",
      folderId: "critiques",
      sizeBytes: 420 * 1024,
      media: "pdf",
      uploadedBy: harry,
      updatedAt: "2026-10-11T15:30:00+03:30",
      taskIds: ["t-critique-notes"],
    }),
    file({
      id: "tf-usability-1",
      name: "Usability round 1.csv",
      folderId: "research",
      sizeBytes: 12 * 1024,
      media: "sheet",
      uploadedBy: ava,
      updatedAt: "2026-10-06T12:00:00+03:30",
    }),
    file({
      id: "tf-brand-colours",
      name: "Brand colours.pdf",
      folderId: "brand",
      sizeBytes: 2.4 * MB,
      media: "pdf",
      uploadedBy: harry,
      updatedAt: "2026-09-28T10:00:00+03:30",
    }),
  ],
  mobile: [
    file({
      id: "tf-release-notes",
      name: "Release 2.4 notes.md",
      folderId: "releases",
      sizeBytes: 6 * 1024,
      media: "doc",
      uploadedBy: jonathan,
      updatedAt: "2026-10-12T10:00:00+03:30",
    }),
  ],
  growth: [],
};
