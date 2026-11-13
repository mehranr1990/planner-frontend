import { typedAs, type ApiClient, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-projects";
import type { ProjectPerson } from "../project-domain";
import { RepositoryError } from "../repositories";
import { isConflict, pageAll } from "./api-shared";

/*
 * Projects (Phase 2) over the P6-01 contract subset in
 * `src/api/generated/openapi-p6-projects.d.ts`. The same cookie-session client,
 * typed against that subset.
 *
 * Whatever the contract cannot answer truthfully (health, expected progress,
 * a single project workflow, …) is refused in live mode ("unsupported",
 * naming what the API lacks) instead of being served from mock data.
 */

export type ProjectsPaths = paths;
export type ProjectsClient = ApiClientFor<paths>;
export type ProjectsData<P extends keyof paths, M extends "get" | "post" | "put" | "patch" | "delete"> = ResponseDataIn<paths, P, M>;

export const projectsClient = (client: ApiClient): ProjectsClient => typedAs<paths>(client);

const refuse = (area: string, requirement: string) => () => Promise.reject(new RepositoryError("unsupported", `${area} API: ${requirement}`));

/** A live repository of `area` ("Teams", …): the `supported` methods answer from the API, every other one is refused. */
export function liveOnlyIn<T extends object>(area: string, requirement: string, supported: Partial<T> = {}): T {
  return new Proxy(supported as T, {
    get: (target, name) => (name in target ? target[name as keyof T] : typeof name === "string" && name !== "then" ? refuse(area, requirement) : undefined),
  });
}

/** A live Projects repository: the `supported` methods answer from the API, every other one is refused. */
export const liveOnly = <T extends object>(requirement: string, supported: Partial<T> = {}): T => liveOnlyIn("Projects", requirement, supported);

/** After the one retry of `retryOnConflict`: a second 409 is the seam's "conflict". */
export async function conflictAware<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (isConflict(error)) throw new RepositoryError("conflict", "Changed elsewhere");
    throw error;
  }
}

// ── People and tasks shared by the Projects adapters ─────────────────────

export type ApiProjectMember = ProjectsData<"/api/v1/projects/{id}/members", "get">["items"][number];
export type ApiViewItem = ProjectsData<"/api/v1/projects/{projectId}/views", "get">["items"][number];

const PAGE = 100;

/** Every membership of the project (any state), from the members read model. */
export const projectRoster = (api: ProjectsClient, projectId: string): Promise<ApiProjectMember[]> =>
  pageAll<ApiProjectMember>(async (after) => (await api.request("get", "/api/v1/projects/{id}/members", { path: { id: projectId }, query: { limit: PAGE, after } })).data);

export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase();

/**
 * The seam's person for a membership: its id is the membership (access) id,
 * the name is the server's display name. The API serves no email or avatar.
 */
export const toProjectPerson = (member: ApiProjectMember): ProjectPerson => {
  const name = member.displayName ?? "";
  return { id: member.id, name, initials: initialsOf(name) };
};

/** The project's live tasks with schedule and estimate (the LIST view, every page). */
export const projectViewItems = async (api: ProjectsClient, projectId: string): Promise<ApiViewItem[]> =>
  (
    await pageAll<ApiViewItem>(
      async (after) => (await api.request("get", "/api/v1/projects/{projectId}/views", { path: { projectId }, query: { kind: "LIST", limit: PAGE, after } })).data,
    )
  ).filter((item) => item.task.deletedAt === null);

export type ApiAccessMe = ProjectsData<"/api/v1/projects/{id}/access/me", "get">;

/** The caller's own admission (access id, role, capabilities): hints only, every command is still checked by the server. */
export const accessMe = async (api: ProjectsClient, projectId: string): Promise<ApiAccessMe> =>
  (await api.request("get", "/api/v1/projects/{id}/access/me", { path: { id: projectId } })).data;

/** The person behind an access id; a name the roster no longer shows stays blank (never invented). */
export const personOf = (roster: readonly ApiProjectMember[], accessId: string): ProjectPerson => {
  const member = roster.find((candidate) => candidate.id === accessId);
  return member ? toProjectPerson(member) : { id: accessId, name: "", initials: "" };
};

export const isOpenTask = (item: ApiViewItem): boolean => item.task.status === "OPEN" || item.task.status === "IN_PROGRESS";
