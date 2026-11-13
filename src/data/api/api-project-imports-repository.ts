import { newIdempotencyKey, type ApiClient } from "@/api/client";
import type { ImportDryRun, ImportInspection, ImportRowError, ImportTarget } from "../project-domain";
import type { ImportRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { parseCsv } from "../mock/mock-project-settings";
import { localInstant } from "./api-tasks-repository";
import { invalid, mapErrors, revisionTag, unsupported } from "./api-shared";
import { liveOnly, projectsClient, type ProjectsData } from "./api-project-shared";

/*
 * Settings › Import over `…/change-plans/csv`. The API takes a fixed layout
 * (`title` required; `estimatedMinutes`, `dueAt`, … optional) and creates fresh
 * OPEN, unassigned tasks only, so:
 * - the user's mapping is rewritten into that layout here: estimate hours →
 *   whole minutes, a due day → that day 23:59 local (as Personal deadlines);
 *   a mapped status or assignee column is refused, never dropped silently;
 * - a plan is all-or-nothing, so the commit sends only the rows the dry run
 *   found ready;
 * - an applied plan has no undo (the 30-minute expiry is the preview's), so
 *   `config` / `undo` are refused.
 */

type ApiCsvError = ProjectsData<"/api/v1/projects/{projectId}/change-plans/csv", "post">["errors"][number];
type Mapping = Readonly<Record<ImportTarget, number | null>>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The API header per importable target. */
const HEADERS = { title: "title", estimate: "estimatedMinutes", due: "dueAt" } as const;
const TARGET_OF: Readonly<Record<string, ImportTarget>> = { title: "title", estimatedMinutes: "estimate", dueAt: "due" };
const PROBLEM: Readonly<Record<string, ImportRowError["problem"]>> = { title: "required", estimate: "number", due: "date" };

const quote = (cell: string) => `"${cell.replace(/"/g, '""')}"`;

/** The data rows (header dropped, blank lines skipped). */
const dataRows = (csv: string): string[][] => parseCsv(csv).slice(1).filter((row) => row.some((cell) => cell.trim() !== ""));

const toApiValue = (target: keyof typeof HEADERS, raw: string): string => {
  const value = raw.trim();
  if (!value) return "";
  if (target === "estimate") {
    const hours = Number(value);
    return Number.isFinite(hours) && hours >= 0 ? String(Math.round(hours * 60)) : value;
  }
  if (target === "due") return DAY.test(value) ? localInstant(value, "23:59") : value;
  return value;
};

/** The rows in the API layout; `null` mapping targets are left out. */
function toApiCsv(rows: readonly string[][], mapping: Mapping): string {
  if (mapping.status !== null || mapping.assignee !== null) unsupported("The API imports new open, unassigned tasks only");
  if (mapping.title === null) invalid("title-unmapped");
  const targets = (Object.keys(HEADERS) as (keyof typeof HEADERS)[]).filter((target) => mapping[target] !== null);
  const lines = [targets.map((target) => HEADERS[target]), ...rows.map((row) => targets.map((target) => toApiValue(target, row[mapping[target]!] ?? "")))];
  return lines.map((line) => line.map(quote).join(",")).join("\r\n");
}

/** File-level codes end the run; row errors come back per data row (the API counts the header as row 1). */
function rowErrors(errors: readonly ApiCsvError[], rows: readonly string[][], mapping: Mapping): ImportRowError[] {
  return errors.map((error) => {
    const column = TARGET_OF[error.column];
    if (!column || error.code === "FORMULA" || (error.code !== "VALUE" && error.code !== "REQUIRED")) throw new RepositoryError("invalid", error.code.toLowerCase());
    const row = error.row - 1;
    return { row, column, problem: PROBLEM[column]!, value: rows[row - 1]?.[mapping[column]!] ?? "" };
  });
}

export function createApiProjectImportRepository(client: ApiClient): ImportRepository {
  const api = projectsClient(client);
  const validate = async (projectId: string, csv: string) =>
    (
      await api.request("post", "/api/v1/projects/{projectId}/change-plans/csv", {
        path: { projectId },
        header: { "Idempotency-Key": newIdempotencyKey() },
        body: { id: crypto.randomUUID(), csv },
      })
    ).data;

  return liveOnly<ImportRepository>("an applied change plan cannot be undone (no undo window)", {
    inspect: (projectId, csv) =>
      mapErrors(async (): Promise<ImportInspection> => {
        const { data } = await api.request("post", "/api/v1/projects/{projectId}/change-plans/csv/inspection", { path: { projectId }, body: { csv } });
        const fatal = data.errors.find((error) => error.code === "SIZE" || error.code === "ROWS" || error.code === "CSV_SYNTAX");
        if (fatal) invalid(fatal.code.toLowerCase());
        const title = data.columns.findIndex((column) => column.trim().toLowerCase() === "title");
        // Only an exact `title` header is suggested; other columns are the user's to map.
        return { headers: data.columns, rowCount: data.rowCount, suggested: { title: title >= 0 ? title : null, status: null, assignee: null, due: null, estimate: null } };
      }),

    dryRun: (projectId, csv, mapping) =>
      mapErrors(async (): Promise<ImportDryRun> => {
        const rows = dataRows(csv);
        const result = await validate(projectId, toApiCsv(rows, mapping));
        const errors = rowErrors(result.errors, rows, mapping);
        return { rowsRead: rows.length, ready: rows.length - new Set(errors.map((error) => error.row)).size, errors };
      }),

    commit: (projectId, csv, mapping) =>
      mapErrors(async () => {
        const rows = dataRows(csv);
        const first = await validate(projectId, toApiCsv(rows, mapping));
        const failed = new Set(rowErrors(first.errors, rows, mapping).map((error) => error.row));
        const ready = rows.filter((_, index) => !failed.has(index + 1));
        const { plan } = ready.length === rows.length ? first : await validate(projectId, toApiCsv(ready, mapping));
        if (!plan) invalid("nothing-to-import");
        const { data } = await api.request("post", "/api/v1/projects/{projectId}/change-plans/{planId}/apply", {
          path: { projectId, planId: plan.id },
          header: { "If-Match": revisionTag(plan.revision) },
          body: { manifestHash: plan.manifestHash },
        });
        const appliedAt = data.appliedAt ?? new Date().toISOString();
        // No undo window: it ends when the plan is applied.
        return { created: data.operations.filter((operation) => operation.kind === "CREATE_TASK").length, batchId: data.id, undoUntil: appliedAt };
      }),
  });
}
