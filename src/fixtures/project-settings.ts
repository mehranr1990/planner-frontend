/*
 * SAMPLE DATA: Website Redesign settings (PJ14 board and tab captures):
 * draft v4 adds a "QA" status between In review and Done; four custom
 * fields; Access values (the OPEN items use the SPEC defaults as mock
 * server config: guest grant default 30 days, Members may invite off) and
 * the import Undo window (DECISIONS proposed 10 minutes, shown on the board).
 */

import type { CustomField, ProjectAccessSettings, WorkflowDraft } from "@/data/project-domain";
import { sampleWorkflow } from "./project-work";

export const sampleWorkflowDraft: WorkflowDraft = {
  version: 4,
  basedOn: 3,
  statuses: [
    ...sampleWorkflow.statuses.filter((status) => status.id !== "done" && status.id !== "blocked"),
    { id: "qa", name: "QA", category: "active" },
    ...sampleWorkflow.statuses.filter((status) => status.id === "blocked" || status.id === "done"),
  ],
  transitions: {
    todo: ["in-progress"],
    "in-progress": ["in-review", "blocked"],
    "in-review": ["in-progress", "qa"],
    qa: ["in-progress", "done"],
    blocked: ["in-progress"],
    done: ["in-progress"],
  },
};

export const sampleFields: readonly CustomField[] = [
  {
    id: "platform",
    name: "Platform",
    type: "single-select",
    options: ["Web", "iOS", "Android"],
    appliesTo: ["tasks"],
    required: false,
    valueCount: 12,
  },
  { id: "story-points", name: "Story points", type: "number", min: 1, max: 13, appliesTo: ["tasks"], required: false, valueCount: 9 },
  {
    id: "customer-impact",
    name: "Customer impact",
    type: "single-select",
    options: ["Low", "Medium", "High"],
    appliesTo: ["tasks", "risks"],
    required: true,
    valueCount: 6,
  },
  { id: "design-link", name: "Design link", type: "url", appliesTo: ["tasks"], required: false, valueCount: 0 },
];

export const sampleAccessSettings: ProjectAccessSettings = {
  defaultInviteRole: "member",
  allowGuests: true,
  guestGrantDays: 30,
  membersInviteViewers: false,
};

export const sampleImportConfig = { undoMinutes: 10 };
