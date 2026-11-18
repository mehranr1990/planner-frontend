import { newIdempotencyKey, type ApiClient } from "@/api/client";
import type { WorkflowCategory, WorkflowDraft, WorkflowMigrationPreview, WorkflowStatus } from "../project-domain";
import type { WorkflowDraftRepository } from "../project-repositories";
import { invalid, mapErrors, pageAll, revisionTag, unsupported } from "./api-shared";
import { conflictAware, projectViewItems, projectsClient, type ProjectsClient, type ProjectsData } from "./api-project-shared";
import { createApiProjectWorkflowRepository } from "./api-project-tasks-repository";

/*
 * PJ-14 › Workflow drafts over `/projects/{id}/workflow-drafts` (P2 gap
 * closure). The draft edits the project's workflow (the only one; none → a
 * new workflow, several → refused) and publishes it as its next version.
 * - Status ids: a state of the workflow's current version keeps the catalogue
 *   id "<workflowId>:<version>:<stateId>" (so the editor sees it as kept);
 *   other draft states are "draft:<stateId>". A status the draft has never
 *   seen (a base status, a new row) gets a fresh state id on save.
 * - Category ⇄ status: todo OPEN, active / review / blocked IN_PROGRESS,
 *   done DONE, canceled CANCELED. Existing edges keep their id and approvers.
 * - Publish preview = the server's removed states with their pinned task
 *   counts (pinned bindings, not a migration). The server never rebinds tasks
 *   (ADR 0053), so the editor asks for no mapping (`keepsTasksOnPublish`); a
 *   mapping is still refused before any request. Publish uses the draft
 *   revision + key; a 409 (stale draft / terminal draft) is the generic
 *   conflict — the editor refreshes and retries with the current revision.
 */

type ApiDraft = ProjectsData<"/api/v1/projects/{projectId}/workflow-drafts", "get">["items"][number];
type ApiWorkflow = ProjectsData<"/api/v1/projects/{projectId}/workflows", "get">["items"][number];
type ApiVersion = ProjectsData<"/api/v1/projects/{projectId}/workflows/{workflowId}/versions", "get">;
type ApiState = ApiDraft["definition"]["states"][number];
type ApiStatus = ApiState["status"];

const PAGE = 100;
const STATUS: Record<WorkflowCategory, ApiStatus> = { todo: "OPEN", active: "IN_PROGRESS", review: "IN_PROGRESS", blocked: "IN_PROGRESS", done: "DONE", canceled: "CANCELED" };
const CATEGORY: Record<ApiStatus, WorkflowCategory> = { OPEN: "todo", IN_PROGRESS: "active", DONE: "done", CANCELED: "canceled" };
const BASE_KEY = { OPEN: "todo", IN_PROGRESS: "in-progress", DONE: "done", CANCELED: "canceled" } as const;

interface Base {
  workflow: ApiWorkflow | null;
  version: ApiVersion | null;
}

async function baseOf(api: ProjectsClient, projectId: string): Promise<Base> {
  const workflows = await pageAll<ApiWorkflow>(async (after) => (await api.request("get", "/api/v1/projects/{projectId}/workflows", { path: { projectId }, query: { limit: PAGE, after } })).data);
  if (workflows.length > 1) unsupported("The project has several workflows; a draft edits one of them");
  const workflow = workflows[0] ?? null;
  if (!workflow) return { workflow: null, version: null };
  const { data } = await api.request("get", "/api/v1/projects/{projectId}/workflows/{workflowId}/versions", {
    path: { projectId, workflowId: workflow.id },
    query: { version: workflow.currentVersion },
  });
  return { workflow, version: data };
}

const openDraft = async (api: ProjectsClient, projectId: string): Promise<ApiDraft | null> =>
  (await pageAll<ApiDraft>(async (after) => (await api.request("get", "/api/v1/projects/{projectId}/workflow-drafts", { path: { projectId }, query: { limit: PAGE, after } })).data)).find(
    (draft) => draft.state === "DRAFT",
  ) ?? null;

/** The editor's id for a draft state. */
const displayId = (base: Base, stateId: string) =>
  base.version && base.version.states.some((state) => state.id === stateId) ? `${base.version.workflowId}:${base.version.version}:${stateId}` : `draft:${stateId}`;

/** The state id behind an editor id (undefined = not a state of this workflow / draft yet). */
function stateIdOf(base: Base, id: string): string | undefined {
  if (id.startsWith("draft:")) return id.slice("draft:".length);
  const [workflowId, , stateId] = id.split(":");
  return base.workflow && workflowId === base.workflow.id && stateId ? stateId : undefined;
}

const toStatus = (base: Base, state: ApiState): WorkflowStatus => {
  // A state named after a base status keeps that status's translated label.
  const key = state.label === state.status ? BASE_KEY[state.status] : undefined;
  return { id: displayId(base, state.id), name: state.label, category: CATEGORY[state.status], ...(key ? { key } : {}) };
};

function toDraft(base: Base, draft: ApiDraft): WorkflowDraft {
  const { states, edges } = draft.definition;
  const statuses = states.map((state) => toStatus(base, state));
  const transitions = Object.fromEntries(
    states.map((state) => [displayId(base, state.id), edges.filter((edge) => edge.fromStateId === state.id).map((edge) => displayId(base, edge.toStateId))]),
  );
  const current = base.workflow?.currentVersion ?? 0;
  return { version: current + 1, basedOn: current, statuses, transitions };
}

export function createApiProjectWorkflowDraftRepository(client: ApiClient): WorkflowDraftRepository {
  const api = projectsClient(client);

  const definitionOf = (base: Base, existing: ApiDraft | null, input: Pick<WorkflowDraft, "statuses" | "transitions">): ApiDraft["definition"] => {
    const names = input.statuses.map((status) => status.name.trim().toLocaleLowerCase());
    if (names.some((name) => !name) || new Set(names).size !== names.length) invalid("status-names");
    if (!input.statuses.some((status) => status.category === "done")) invalid("needs-done");
    const ids = new Map<string, string>();
    for (const status of input.statuses) {
      const known = stateIdOf(base, status.id);
      ids.set(status.id, known && ![...ids.values()].includes(known) ? known : crypto.randomUUID());
    }
    const states = input.statuses.map((status) => ({ id: ids.get(status.id)!, label: status.name.trim(), status: STATUS[status.category] }));
    const previous = [...(existing?.definition.edges ?? []), ...(base.version?.edges ?? [])];
    const edges = Object.entries(input.transitions).flatMap(([from, targets]) =>
      targets.flatMap((to) => {
        const fromStateId = ids.get(from);
        const toStateId = ids.get(to);
        if (!fromStateId || !toStateId || fromStateId === toStateId) return [];
        const kept = previous.find((edge) => edge.fromStateId === fromStateId && edge.toStateId === toStateId);
        return [kept ? { id: kept.id, fromStateId, toStateId, requiresApproval: kept.requiresApproval, approvers: kept.approvers } : { id: crypto.randomUUID(), fromStateId, toStateId, requiresApproval: false, approvers: [] }];
      }),
    );
    return { name: (existing?.definition.name ?? base.workflow?.name ?? base.version?.name ?? "Workflow").slice(0, 100), states, edges };
  };

  const requireDraft = async (projectId: string) => {
    const draft = await openDraft(api, projectId);
    if (!draft) invalid("no-draft");
    return draft;
  };

  return {
    keepsTasksOnPublish: true,
    draft: (projectId) =>
      mapErrors(async () => {
        const [base, draft] = await Promise.all([baseOf(api, projectId), openDraft(api, projectId)]);
        return draft ? toDraft(base, draft) : null;
      }),

    saveDraft: (projectId, input) =>
      mapErrors(async () => {
        const [base, existing] = await Promise.all([baseOf(api, projectId), openDraft(api, projectId)]);
        const definition = definitionOf(base, existing, input);
        const { data } = existing
          ? await conflictAware(() =>
              api.request("patch", "/api/v1/projects/{projectId}/workflow-drafts/{draftId}", {
                path: { projectId, draftId: existing.id },
                header: { "If-Match": revisionTag(existing.revision), "Idempotency-Key": newIdempotencyKey() },
                body: { definition },
              }),
            )
          : await conflictAware(() =>
              api.request("post", "/api/v1/projects/{projectId}/workflow-drafts", {
                path: { projectId },
                header: { "Idempotency-Key": newIdempotencyKey() },
                body: { id: crypto.randomUUID(), workflowId: base.workflow?.id ?? null, baseRevision: base.workflow?.revision ?? 0, definition },
              }),
            );
        return toDraft(base, data);
      }),

    discardDraft: (projectId) =>
      mapErrors(async () => {
        const draft = await requireDraft(projectId);
        await conflictAware(() =>
          api.request("post", "/api/v1/projects/{projectId}/workflow-drafts/{draftId}/discard", {
            path: { projectId, draftId: draft.id },
            header: { "If-Match": revisionTag(draft.revision), "Idempotency-Key": newIdempotencyKey() },
            body: {},
          }),
        );
      }),

    previewPublish: (projectId) =>
      mapErrors(async (): Promise<WorkflowMigrationPreview> => {
        const [base, draft] = await Promise.all([baseOf(api, projectId), requireDraft(projectId)]);
        const [{ data: preview }, items] = await Promise.all([
          api.request("get", "/api/v1/projects/{projectId}/workflow-drafts/{draftId}/publish-preview", { path: { projectId, draftId: draft.id } }),
          projectViewItems(api, projectId),
        ]);
        const versions = new Map<number, ApiVersion>();
        if (base.version) versions.set(base.version.version, base.version);
        for (const version of new Set(preview.removedStates.map((entry) => entry.version)))
          if (!versions.has(version) && base.workflow)
            versions.set(
              version,
              (await api.request("get", "/api/v1/projects/{projectId}/workflows/{workflowId}/versions", { path: { projectId, workflowId: base.workflow.id }, query: { version } })).data,
            );
        const { states, edges } = draft.definition;
        const before = base.version?.states ?? [];
        const beforeEdges = base.version?.edges ?? [];
        return {
          version: (base.workflow?.currentVersion ?? 0) + 1,
          removed: preview.removedStates.flatMap((entry) => {
            const version = versions.get(entry.version);
            const state = version?.states.find((candidate) => candidate.id === entry.stateId);
            if (!version || !state) return [];
            return [{ status: { id: `${version.workflowId}:${version.version}:${state.id}`, name: state.label, category: CATEGORY[state.status] }, tasks: entry.taskCount }];
          }),
          renamed: states.flatMap((state) => {
            const old = before.find((candidate) => candidate.id === state.id);
            return old && old.label !== state.label ? [{ statusId: displayId(base, state.id), from: old.label, to: state.label }] : [];
          }),
          added: states.filter((state) => !before.some((candidate) => candidate.id === state.id)).map((state) => toStatus(base, state)),
          addedTransitions: edges
            .filter((edge) => !beforeEdges.some((candidate) => candidate.fromStateId === edge.fromStateId && candidate.toStateId === edge.toStateId))
            .map((edge) => [displayId(base, edge.fromStateId), displayId(base, edge.toStateId)] as const),
          staying: states.flatMap((state) => {
            const tasks = items.filter((item) => item.workflow.binding?.workflowId === base.workflow?.id && item.workflow.binding?.stateId === state.id).length;
            return tasks > 0 ? [{ statusId: displayId(base, state.id), tasks }] : [];
          }),
        };
      }),

    publish: (projectId, mapping) =>
      mapErrors(async () => {
        // The server keeps every task on its pinned version; moving tasks is not part of a publish.
        if (Object.keys(mapping).length > 0) unsupported("Publishing keeps tasks on their pinned workflow version; tasks of a removed status cannot be moved");
        const draft = await requireDraft(projectId);
        await conflictAware(() =>
          api.request("post", "/api/v1/projects/{projectId}/workflow-drafts/{draftId}/publish", {
            path: { projectId, draftId: draft.id },
            header: { "If-Match": revisionTag(draft.revision), "Idempotency-Key": newIdempotencyKey() },
            body: {},
          }),
        );
        return createApiProjectWorkflowRepository(client).published(projectId);
      }),
  };
}
