/*
 * SAMPLE DATA: Website Redesign's files (PJ10 board, PJM03 mobile). Mock now:
 * Tue 13 Oct 2026 14:35. 18 files: Design 7 · Specs 4 · Payments 3 · Shared
 * with guests 2 · 2 unfiled. empty-states-v2.png is mid-upload (it drops
 * once with "connection lost" so Retry is reachable) and API notes.docx is
 * being scanned. Limits are the mock server config (not UI constants).
 */

import type { FileFolder, FileServerConfig, ProjectFile, ProjectFileVersion, ProjectPerson } from "@/data/project-domain";
import { projectPeople } from "./projects";

const { me, sara, jonathan, kian, arash } = projectPeople;

export const sampleFileFolders: readonly FileFolder[] = [
  { id: "design", name: "Design" },
  { id: "specs", name: "Specs" },
  { id: "payments", name: "Payments" },
  { id: "guests", name: "Shared with guests", sharedWithGuests: true },
];

/** Mock "server config": the only source of upload limits. */
export const sampleFileConfig: FileServerConfig = {
  maxBytes: 200 * 1024 * 1024,
  blockedExtensions: ["exe", "bat", "cmd", "msi", "sh"],
};

const MB = 1024 * 1024;
const v = (version: number, by: ProjectPerson, at: string, note?: string): ProjectFileVersion => ({ version, by, at, note });

type Seed = Omit<ProjectFile, "versions" | "version" | "taskIds" | "state"> &
  Partial<Pick<ProjectFile, "versions" | "taskIds" | "state">>;

const file = (seed: Seed): ProjectFile => {
  const versions = seed.versions ?? [v(1, seed.uploadedBy, seed.updatedAt)];
  return { state: "ready", taskIds: [], ...seed, versions, version: versions[0]!.version };
};

export const sampleFiles: readonly ProjectFile[] = [
  file({
    id: "checkout-final",
    name: "Checkout — final.fig",
    folderId: "design",
    sizeBytes: 14.2 * MB,
    media: "design",
    uploadedBy: sara,
    updatedAt: "2026-10-13T12:35:00+03:30",
    taskIds: ["checkout-flow", "design-qa-handoff", "payment-errors-copy"],
    versions: [
      v(4, sara, "2026-10-13T12:35:00+03:30", "final colours"),
      v(3, sara, "2026-10-10T10:00:00+03:30", "review fixes"),
      v(2, kian, "2026-10-06T10:00:00+03:30", "copy"),
      v(1, sara, "2026-10-01T10:00:00+03:30"),
    ],
  }),
  file({
    id: "payments-errors",
    name: "payments-errors.csv",
    folderId: "payments",
    sizeBytes: 18 * 1024,
    media: "sheet",
    uploadedBy: kian,
    updatedAt: "2026-10-12T16:00:00+03:30",
    taskIds: ["payment-errors-copy"],
    versions: [v(2, kian, "2026-10-12T16:00:00+03:30"), v(1, kian, "2026-10-09T10:00:00+03:30")],
  }),
  file({
    id: "provider-contract",
    name: "Provider contract.pdf",
    folderId: "payments",
    sizeBytes: 1.1 * MB,
    media: "pdf",
    uploadedBy: kian,
    updatedAt: "2026-10-10T11:00:00+03:30",
  }),
  file({
    id: "empty-states",
    name: "empty-states-v2.png",
    folderId: "design",
    sizeBytes: 2.4 * MB,
    media: "image",
    state: "uploading",
    progress: 62,
    uploadedBy: arash,
    updatedAt: "2026-10-13T14:35:00+03:30",
  }),
  file({
    id: "api-notes",
    name: "API notes.docx",
    folderId: "specs",
    sizeBytes: 220 * 1024,
    media: "doc",
    state: "scanning",
    uploadedBy: me,
    updatedAt: "2026-10-13T14:34:00+03:30",
  }),
  file({
    id: "tool-setup",
    name: "tool-setup.exe",
    folderId: "specs",
    sizeBytes: 4 * MB,
    media: "other",
    state: "blocked",
    blockReason: "type",
    uploadedBy: jonathan,
    updatedAt: "2026-10-13T14:30:00+03:30",
  }),
  file({ id: "home-hero", name: "Home hero.png", folderId: "design", sizeBytes: 3.1 * MB, media: "image", uploadedBy: sara, updatedAt: "2026-10-08T10:00:00+03:30" }),
  file({ id: "icon-set", name: "Icon set.fig", folderId: "design", sizeBytes: 6.4 * MB, media: "design", uploadedBy: arash, updatedAt: "2026-10-02T10:00:00+03:30", taskIds: ["icon-set"] }),
  file({ id: "style-guide", name: "Style guide.pdf", folderId: "design", sizeBytes: 5.2 * MB, media: "pdf", uploadedBy: sara, updatedAt: "2026-09-28T10:00:00+03:30" }),
  file({ id: "cart-mobile", name: "Cart mobile.png", folderId: "design", sizeBytes: 1.8 * MB, media: "image", uploadedBy: sara, updatedAt: "2026-09-30T10:00:00+03:30" }),
  file({ id: "error-illustrations", name: "Error illustrations.fig", folderId: "design", sizeBytes: 8.7 * MB, media: "design", uploadedBy: arash, updatedAt: "2026-10-05T10:00:00+03:30", taskIds: ["error-states"] }),
  file({ id: "checkout-spec", name: "Checkout spec.docx", folderId: "specs", sizeBytes: 340 * 1024, media: "doc", uploadedBy: kian, updatedAt: "2026-10-04T10:00:00+03:30", taskIds: ["checkout-flow"] }),
  file({ id: "analytics-plan", name: "Analytics plan.xlsx", folderId: "specs", sizeBytes: 96 * 1024, media: "sheet", uploadedBy: jonathan, updatedAt: "2026-10-03T10:00:00+03:30", taskIds: ["cart-analytics"] }),
  file({ id: "refund-flow", name: "Refund flow.pdf", folderId: "payments", sizeBytes: 780 * 1024, media: "pdf", uploadedBy: kian, updatedAt: "2026-10-07T10:00:00+03:30" }),
  file({ id: "brand-assets", name: "Brand assets.zip", folderId: "guests", sizeBytes: 24 * MB, media: "other", uploadedBy: sara, updatedAt: "2026-09-25T10:00:00+03:30" }),
  file({ id: "copy-deck", name: "Copy deck.docx", folderId: "guests", sizeBytes: 120 * 1024, media: "doc", uploadedBy: me, updatedAt: "2026-10-09T10:00:00+03:30", taskIds: ["payment-errors-copy"] }),
  file({ id: "kickoff-notes", name: "Kickoff notes.pdf", folderId: null, sizeBytes: 410 * 1024, media: "pdf", uploadedBy: sara, updatedAt: "2026-09-01T10:00:00+03:30" }),
  file({ id: "sitemap", name: "Sitemap.png", folderId: null, sizeBytes: 900 * 1024, media: "image", uploadedBy: me, updatedAt: "2026-09-12T10:00:00+03:30" }),
];
