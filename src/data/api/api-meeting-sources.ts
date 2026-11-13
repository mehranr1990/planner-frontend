import { typedAs, type ApiClient } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths as CompanyPaths } from "@/api/generated/openapi-p6-companies";
import type { paths as ProjectPaths } from "@/api/generated/openapi-p6-projects";
import type { paths as TeamPaths } from "@/api/generated/openapi-p6-teams";
import type { WorkMember, WorkSource, WorkSources } from "./api-meetings-repository";
import { projectRoster } from "./api-project-shared";
import { pageAll } from "./api-shared";

/*
 * Work sources for New meeting (M-X4 / M-X5): the caller's Projects, Teams and
 * Companies with their root `access/me` capabilities (the `meeting.create`
 * hint), and the root roster whose actor ids `POST /meetings` accepts as
 * `participantActorIds`. A Company's root is its `scopeId` context. Sources
 * the server does not admit me to (403 / 404) are left out; account ids are
 * never read or inferred.
 */

const PAGE = 100;
const notAdmitted = (error: unknown) => error instanceof ApiHttpError && (error.status === 403 || error.status === 404);

export function createWorkSources(client: ApiClient): WorkSources {
  const projects = typedAs<ProjectPaths>(client);
  const teams = typedAs<TeamPaths>(client);
  const companies = typedAs<CompanyPaths>(client);
  const companyScope = async (id: string) => (await companies.request("get", "/api/v1/companies/{id}", { path: { id } })).data.scopeId;

  const accessOf = async (kind: WorkSource["kind"], id: string, scopeId?: string) => {
    if (kind === "PROJECT") return (await projects.request("get", "/api/v1/projects/{id}/access/me", { path: { id } })).data;
    if (kind === "TEAM") return (await teams.request("get", "/api/v1/teams/{id}/access/me", { path: { id } })).data;
    return (await companies.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/access/me", { path: { id, scopeId: scopeId ?? (await companyScope(id)) } })).data;
  };

  return {
    async list() {
      const [projectRows, teamRows, companyRows] = await Promise.all([
        pageAll(async (after) => (await projects.request("get", "/api/v1/projects", { query: { limit: PAGE, after } })).data),
        pageAll(async (after) => (await teams.request("get", "/api/v1/teams", { query: { limit: PAGE, after } })).data),
        pageAll(async (after) => (await companies.request("get", "/api/v1/companies", { query: { limit: PAGE, after } })).data),
      ]);
      const rows = [
        ...projectRows.map((row) => ({ kind: "PROJECT" as const, row })),
        ...teamRows.map((row) => ({ kind: "TEAM" as const, row })),
        ...companyRows.map((row) => ({ kind: "COMPANY" as const, row })),
      ];
      const sources = await Promise.all(
        rows.map(async ({ kind, row }): Promise<WorkSource | null> => {
          try {
            const me = await accessOf(kind, row.id, row.scopeId);
            return { kind, id: row.id, title: row.title, capabilities: me.capabilities };
          } catch (error) {
            if (notAdmitted(error)) return null;
            throw error;
          }
        }),
      );
      return sources.filter((source): source is WorkSource => source !== null);
    },

    async roster(kind, id) {
      let members: WorkMember[];
      let scopeId: string | undefined;
      if (kind === "PROJECT") members = await projectRoster(projects, id);
      else if (kind === "TEAM")
        members = await pageAll(async (after) => (await teams.request("get", "/api/v1/teams/{id}/memberships", { path: { id }, query: { limit: PAGE, after } })).data);
      else {
        const root = await companyScope(id);
        scopeId = root;
        members = await pageAll(
          async (after) => (await companies.request("get", "/api/v1/companies/{id}/contexts/{scopeId}/members", { path: { id, scopeId: root }, query: { limit: PAGE, after } })).data,
        );
      }
      const me = await accessOf(kind, id, scopeId);
      return { me: me.actorId, members };
    },
  };
}
