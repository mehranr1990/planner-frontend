import { isValidProjectKey } from "@/data/project-key";
import { projectPeople } from "@/fixtures/projects";
import {
  sampleAccessSettings,
  sampleFields,
  sampleImportConfig,
  sampleWorkflowDraft,
} from "@/fixtures/project-settings";
import type {
  CustomField,
  ImportRowError,
  ImportTarget,
  OwnershipTransfer,
  ProjectAccessSettings,
  ProjectRole,
  ProjectSummary,
  ProjectTask,
  WorkflowDraft,
} from "../project-domain";
import type {
  FieldRepository,
  ImportRepository,
  ProjectSettingsRepository,
  WorkflowDraftRepository,
} from "../project-repositories";
import { RepositoryError } from "../repositories";
import type { ProjectWorkStore } from "./mock-project-work";

/*
 * PJ-14 settings for the mock adapter: workflowRepo drafts (D16: edit a
 * draft, preview the migration, publish with a required mapping for removed
 * statuses), fieldRepo, importRepo (CSV parsed here, dry run changes
 * nothing, commit creates one batch with an Undo window from the server
 * config) and projectRepo general / access / lifecycle (archive, template,
 * transfer D17 with reauth, delete with name + reauth). Reauth in the mock:
 * any non-empty password except "wrong".
 */

const RANK: Record<ProjectRole, number> = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1, guest: 0 };
const TARGETS: readonly ImportTarget[] = ["title", "status", "assignee", "due", "estimate"];
const HEADER_HINTS: Record<ImportTarget, RegExp> = {
  title: /^(title|name|task|عنوان|نام|کار)$/i,
  status: /^(status|state|وضعیت)$/i,
  assignee: /^(assignee|owner|person|مسئول)$/i,
  due: /^(due|due date|deadline|موعد)$/i,
  estimate: /^(estimate|hours|estimate hours|تخمین)$/i,
};

export interface MockSettingsOptions {
  store: ProjectWorkStore;
  respond<T>(value: T): Promise<T>;
  now: string;
  projects: ProjectSummary[];
  recent: string[];
  find(projectId: string): ProjectSummary | undefined;
  /** Roles of people in the project (transfer successor must be Admin or Manager). */
  roleOf(projectId: string, personId: string): Promise<ProjectRole | undefined>;
}

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, CRLF / LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function createMockSettings({ store, respond, now, projects, recent, find, roleOf }: MockSettingsOptions) {
  const me = projectPeople.me;
  const drafts = new Map<string, WorkflowDraft>([["website-redesign", structuredClone(sampleWorkflowDraft)]]);
  const fields = new Map<string, CustomField[]>([["website-redesign", structuredClone([...sampleFields])]]);
  const access = new Map<string, ProjectAccessSettings>();
  const transfers = new Map<string, OwnershipTransfer>();
  const batches = new Map<string, { projectId: string; taskIds: string[]; until: number }>();
  let seq = 0;

  const project = (projectId: string) => {
    const found = find(projectId);
    if (!found) throw new RepositoryError("not-found", `No project ${projectId}`);
    return found;
  };
  const guard = (projectId: string, min: ProjectRole) => {
    const found = project(projectId);
    if (found.lifecycle === "archived") throw new RepositoryError("forbidden", "Archived");
    if (RANK[found.role] < RANK[min]) throw new RepositoryError("forbidden", `${min}+ only`);
    return found;
  };
  const reauth = (password: string) => {
    if (!password.trim() || password === "wrong") throw new RepositoryError("invalid", "reauth");
  };
  const tasksOf = (projectId: string) => store.tasks.get(projectId) ?? [];

  const workflowDrafts: WorkflowDraftRepository = {
    draft: async (projectId) => {
      project(projectId);
      return respond(drafts.get(projectId) ?? null);
    },
    async saveDraft(projectId, { statuses, transitions }) {
      guard(projectId, "admin");
      const names = statuses.map((status) => status.name.trim().toLocaleLowerCase());
      if (names.some((name) => !name) || new Set(names).size !== names.length)
        throw new RepositoryError("invalid", "status-names");
      if (!statuses.some((status) => status.category === "done")) throw new RepositoryError("invalid", "needs-done");
      const ids = new Set(statuses.map((status) => status.id));
      const clean = Object.fromEntries(
        statuses.map((status) => [status.id, (transitions[status.id] ?? []).filter((to) => ids.has(to) && to !== status.id)]),
      );
      const published = store.workflow(projectId);
      const current = drafts.get(projectId);
      const draft: WorkflowDraft = {
        version: current?.version ?? published.version + 1,
        basedOn: published.version,
        statuses: structuredClone([...statuses]),
        transitions: clean,
      };
      drafts.set(projectId, draft);
      return respond(draft);
    },
    async discardDraft(projectId) {
      guard(projectId, "admin");
      drafts.delete(projectId);
      return respond(undefined);
    },
    async previewPublish(projectId) {
      project(projectId);
      const draft = drafts.get(projectId);
      if (!draft) throw new RepositoryError("invalid", "no-draft");
      const published = store.workflow(projectId);
      const count = (statusId: string) => tasksOf(projectId).filter((task) => task.statusId === statusId).length;
      const draftIds = new Set(draft.statuses.map((status) => status.id));
      const publishedIds = new Set(published.statuses.map((status) => status.id));
      const had = new Set(Object.entries(published.transitions).flatMap(([from, list]) => list.map((to) => `${from}>${to}`)));
      return respond({
        version: draft.version,
        removed: published.statuses
          .filter((status) => !draftIds.has(status.id))
          .map((status) => ({ status, tasks: count(status.id) })),
        renamed: draft.statuses.flatMap((status) => {
          const before = published.statuses.find((candidate) => candidate.id === status.id);
          return before && before.name !== status.name ? [{ statusId: status.id, from: before.name, to: status.name }] : [];
        }),
        added: draft.statuses.filter((status) => !publishedIds.has(status.id)),
        addedTransitions: Object.entries(draft.transitions).flatMap(([from, list]) =>
          list.filter((to) => !had.has(`${from}>${to}`)).map((to) => [from, to] as const),
        ),
        staying: draft.statuses.filter((status) => publishedIds.has(status.id)).map((status) => ({ statusId: status.id, tasks: count(status.id) })),
      });
    },
    async publish(projectId, mapping) {
      guard(projectId, "admin");
      const draft = drafts.get(projectId);
      if (!draft) throw new RepositoryError("invalid", "no-draft");
      const published = store.workflow(projectId);
      const draftIds = new Set(draft.statuses.map((status) => status.id));
      for (const status of published.statuses) {
        if (draftIds.has(status.id)) continue;
        const moving = tasksOf(projectId).filter((task) => task.statusId === status.id);
        const target = mapping[status.id];
        if (moving.length > 0 && (!target || !draftIds.has(target))) throw new RepositoryError("invalid", "mapping");
        for (const task of moving) {
          task.statusId = target!;
          task.revision += 1;
        }
      }
      const next = {
        ...published,
        version: draft.version,
        statuses: draft.statuses,
        transitions: draft.transitions,
        publishedAt: now,
        publishedBy: me,
        wipLimits: Object.fromEntries(Object.entries(published.wipLimits ?? {}).filter(([id]) => draftIds.has(id))),
        transitionRoles: Object.fromEntries(
          draft.statuses.map((status) => [status.id, published.transitionRoles?.[status.id] ?? "manager"]),
        ),
      };
      store.setWorkflow(projectId, next);
      drafts.delete(projectId);
      return respond(next);
    },
  };

  const fieldRepo: FieldRepository = {
    list: async (projectId) => {
      project(projectId);
      return respond(fields.get(projectId) ?? []);
    },
    async save(projectId, list) {
      guard(projectId, "admin");
      const current = fields.get(projectId) ?? [];
      if (list.some((field) => !field.name.trim())) throw new RepositoryError("invalid", "field-name");
      const next = list.map((field): CustomField => {
        const before = field.id ? current.find((candidate) => candidate.id === field.id) : undefined;
        if (before && before.valueCount > 0 && before.type !== field.type) throw new RepositoryError("invalid", "type-locked");
        return { ...structuredClone(field), name: field.name.trim(), id: before?.id ?? `field-new-${++seq}`, valueCount: before?.valueCount ?? 0 };
      });
      fields.set(projectId, next);
      return respond(next);
    },
    async remove(projectId, fieldId) {
      guard(projectId, "admin");
      fields.set(projectId, (fields.get(projectId) ?? []).filter((field) => field.id !== fieldId));
      return respond(undefined);
    },
  };

  type Mapping = Readonly<Record<ImportTarget, number | null>>;
  const validate = (projectId: string, csv: string, mapping: Mapping) => {
    const [, ...rows] = parseCsv(csv);
    const workflow = store.workflow(projectId);
    const people = project(projectId).members;
    const errors: ImportRowError[] = [];
    const valid: { title: string; statusId: string; personId?: string; due?: string; estimate?: number }[] = [];
    rows.forEach((cells, index) => {
      const value = (target: ImportTarget) => (mapping[target] === null ? "" : (cells[mapping[target]!] ?? "").trim());
      const row = index + 1;
      const rowErrors: ImportRowError[] = [];
      const title = value("title");
      if (!title) rowErrors.push({ row, column: "title", problem: "required", value: "" });
      const statusText = value("status");
      const status = statusText
        ? workflow.statuses.find(
            (candidate) =>
              candidate.id === statusText || candidate.name.toLocaleLowerCase() === statusText.toLocaleLowerCase(),
          )
        : workflow.statuses.find((candidate) => candidate.category === "todo");
      if (!status) rowErrors.push({ row, column: "status", problem: "status", value: statusText });
      const assigneeText = value("assignee");
      const person = assigneeText
        ? people.find(
            (candidate) =>
              candidate.name.toLocaleLowerCase() === assigneeText.toLocaleLowerCase() ||
              candidate.name.split(" ")[0]!.toLocaleLowerCase() === assigneeText.toLocaleLowerCase(),
          )
        : undefined;
      if (assigneeText && !person) rowErrors.push({ row, column: "assignee", problem: "member", value: assigneeText });
      const due = value("due");
      const dueOk = !due || (/^\d{4}-\d{2}-\d{2}$/.test(due) && !Number.isNaN(Date.parse(`${due}T00:00:00Z`)) && new Date(`${due}T00:00:00Z`).toISOString().startsWith(due));
      if (!dueOk) rowErrors.push({ row, column: "due", problem: "date", value: due });
      const estimateText = value("estimate");
      const estimate = estimateText ? Number(estimateText) : undefined;
      if (estimateText && (!Number.isFinite(estimate) || estimate! < 0))
        rowErrors.push({ row, column: "estimate", problem: "number", value: estimateText });
      if (rowErrors.length > 0) errors.push(...rowErrors);
      else valid.push({ title, statusId: status!.id, personId: person?.id, due: due || undefined, estimate });
    });
    return { rowsRead: rows.length, valid, errors };
  };

  const imports: ImportRepository = {
    config: async (projectId) => {
      project(projectId);
      return respond(sampleImportConfig);
    },
    async inspect(projectId, csv) {
      guard(projectId, "manager");
      const rows = parseCsv(csv);
      if (rows.length === 0) throw new RepositoryError("invalid", "empty-csv");
      const headers = rows[0]!.map((header) => header.trim());
      const suggested = Object.fromEntries(
        TARGETS.map((target) => {
          const index = headers.findIndex((header) => HEADER_HINTS[target].test(header));
          return [target, index >= 0 ? index : null];
        }),
      ) as Record<ImportTarget, number | null>;
      return respond({ headers, rowCount: rows.length - 1, suggested });
    },
    async dryRun(projectId, csv, mapping) {
      guard(projectId, "manager");
      if (mapping.title === null) throw new RepositoryError("invalid", "map-title");
      const result = validate(projectId, csv, mapping);
      return respond({ rowsRead: result.rowsRead, ready: result.valid.length, errors: result.errors });
    },
    async commit(projectId, csv, mapping) {
      guard(projectId, "manager");
      if (mapping.title === null) throw new RepositoryError("invalid", "map-title");
      const { valid } = validate(projectId, csv, mapping);
      const list = store.tasks.get(projectId) ?? [];
      store.tasks.set(projectId, list);
      const phaseId = (store.phases.get(projectId) ?? []).find((phase) => !phase.done)?.id ?? "imported";
      const people = project(projectId).members;
      const created = valid.map((row): ProjectTask => {
        const person = people.find((candidate) => candidate.id === row.personId);
        return {
          id: `import-${++seq}`,
          projectId,
          title: row.title,
          statusId: row.statusId,
          phaseId,
          milestoneId: null,
          assignees: person ? [{ person, state: "pending", by: me }] : [],
          priority: "medium",
          due: row.due ?? null,
          estimateHours: row.estimate ?? null,
          blockedBy: [],
          subtasks: { done: 0, total: 0 },
          commentCount: 0,
          revision: 1,
          updatedAt: now,
        };
      });
      list.push(...created);
      const batchId = `batch-${++seq}`;
      const until = Date.parse(now) + sampleImportConfig.undoMinutes * 60_000;
      batches.set(batchId, { projectId, taskIds: created.map((task) => task.id), until });
      return respond({ created: created.length, batchId, undoUntil: new Date(until).toISOString() });
    },
    async undo(projectId, batchId) {
      guard(projectId, "manager");
      const batch = batches.get(batchId);
      if (!batch || batch.projectId !== projectId) throw new RepositoryError("not-found", "No batch");
      const ids = new Set(batch.taskIds);
      store.tasks.set(projectId, tasksOf(projectId).filter((task) => !ids.has(task.id)));
      batches.delete(batchId);
      return respond(undefined);
    },
  };

  const settings: ProjectSettingsRepository = {
    async update(projectId, patch) {
      const found = guard(projectId, "manager");
      if (patch.name !== undefined && !patch.name.trim()) throw new RepositoryError("invalid", "name");
      if (patch.key !== undefined) {
        if (!isValidProjectKey(patch.key)) throw new RepositoryError("invalid", "key-format");
        if (projects.some((other) => other.id !== projectId && other.key === patch.key))
          throw new RepositoryError("invalid", "key-taken");
      }
      const start = patch.startDate ?? found.startDate;
      const end = patch.endDate ?? found.endDate;
      if (end < start) throw new RepositoryError("invalid", "dates");
      Object.assign(found, {
        ...patch,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        updatedAt: now,
      });
      return respond(found);
    },
    access: async (projectId) => {
      project(projectId);
      return respond(access.get(projectId) ?? sampleAccessSettings);
    },
    async setAccess(projectId, patch) {
      guard(projectId, "admin");
      const next = { ...(access.get(projectId) ?? sampleAccessSettings), ...patch };
      access.set(projectId, next);
      return respond(next);
    },
    async saveTemplate(projectId) {
      const found = guard(projectId, "admin");
      return respond({ name: found.name });
    },
    async archive(projectId) {
      const found = guard(projectId, "admin");
      found.lifecycle = "archived";
      found.lifecycleBy = me;
      found.lifecycleAt = now;
      return respond(found);
    },
    transfer: async (projectId) => {
      project(projectId);
      return respond(transfers.get(projectId) ?? null);
    },
    async requestTransfer(projectId, personId) {
      guard(projectId, "owner");
      const role = await roleOf(projectId, personId);
      if (role !== "admin" && role !== "manager") throw new RepositoryError("invalid", "successor-role");
      const person = project(projectId).members.find((candidate) => candidate.id === personId) ?? {
        id: personId,
        name: personId,
        initials: personId.slice(0, 2).toUpperCase(),
      };
      const transfer: OwnershipTransfer = { successor: person, requestedAt: now, accepted: false };
      transfers.set(projectId, transfer);
      return respond(transfer);
    },
    async cancelTransfer(projectId) {
      guard(projectId, "owner");
      transfers.delete(projectId);
      return respond(undefined);
    },
    async confirmTransfer(projectId, password) {
      const found = guard(projectId, "owner");
      const transfer = transfers.get(projectId);
      if (!transfer?.accepted) throw new RepositoryError("invalid", "not-accepted");
      reauth(password);
      found.role = "admin";
      transfers.delete(projectId);
      return respond(undefined);
    },
    async remove(projectId, { name, password }) {
      const found = guard(projectId, "owner");
      if (name.trim() !== found.name) throw new RepositoryError("invalid", "name-mismatch");
      reauth(password);
      const index = projects.findIndex((candidate) => candidate.id === projectId);
      if (index >= 0) projects.splice(index, 1);
      const at = recent.indexOf(projectId);
      if (at >= 0) recent.splice(at, 1);
      return respond(undefined);
    },
  };

  /** Mock-only: the successor accepts the pending transfer (D17 step 2). */
  const acceptTransfer = (projectId: string) => {
    const transfer = transfers.get(projectId);
    if (transfer) transfer.accepted = true;
  };

  return { workflowDrafts, fields: fieldRepo, imports, settings, acceptTransfer };
}
