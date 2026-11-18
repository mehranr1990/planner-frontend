import { newIdempotencyKey, type ApiClient } from "@/api/client";
import { isValidProjectKey } from "../project-key";
import type { ProjectSummary, ProjectTemplate } from "../project-domain";
import { ProjectCreatePartialError, type ProjectCreateRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { invalid, isConflict, mapErrors, unsupported } from "./api-shared";
import { catalogVersion } from "./api-retention";
import { createApiProjectDirectory } from "./api-project-directory-repository";
import { conflictReason, projectsClient } from "./api-project-shared";

/*
 * PJ-90 New project over the atomic create (P2 gap closure):
 *
 *   1. checks that need no request (name, key format, dates; a template that
 *      is not in the server's initial catalogue is refused here, never dropped),
 *   2. `POST /projects` {id, title, description, retentionPolicyVersion, key,
 *      startDate, endDate, template BLANK | KANBAN | SCRUM, ownerTeamId?} in
 *      one request (Idempotency-Key = the sheet's attempt id),
 *   3. the factual summary re-read.
 *
 * Only step 3 can fail after the project exists (`ProjectCreatePartialError`
 * "read"), so the sheet never submits again and creates a duplicate.
 *
 * Keys are unique per owner account / selected Team (case-insensitive) and
 * checked by the server only: a 409 with reason `PROJECT_KEY_CONFLICT` is
 * "key-taken"; any other 409 is the generic conflict. There is no
 * availability read, so a well-formed key is never reported as available
 * globally. Undo of create would be a deletion request, which needs the
 * owner's password: refused here, the Settings deletion flow remains.
 */

const TEMPLATE: Partial<Record<ProjectTemplate, "BLANK" | "KANBAN" | "SCRUM">> = { blank: "BLANK", kanban: "KANBAN", scrum: "SCRUM" };

export function createApiProjectCreateRepository(client: ApiClient): ProjectCreateRepository {
  const api = projectsClient(client);
  const directory = createApiProjectDirectory(client);

  return {
    limits: { templates: ["blank", "kanban", "scrum"], teamOwner: true, discard: false },
    create: (input) =>
      mapErrors(async (): Promise<ProjectSummary> => {
        const title = input.name.trim();
        if (!title) invalid("name");
        if (!isValidProjectKey(input.key)) invalid("key-format");
        if (input.endDate < input.startDate) invalid("dates");
        const template = TEMPLATE[input.template];
        if (!template) unsupported("template");

        const retentionPolicyVersion = await catalogVersion(client, "PROJECT");
        const id = input.attemptId ?? crypto.randomUUID();
        try {
          await api.request("post", "/api/v1/projects", {
            header: { "Idempotency-Key": input.attemptId ?? newIdempotencyKey() },
            body: {
              id,
              title,
              description: input.description?.trim() || null,
              retentionPolicyVersion,
              key: input.key,
              startDate: input.startDate,
              endDate: input.endDate,
              template,
              ...(input.ownerTeamId ? { ownerTeamId: input.ownerTeamId } : {}),
            },
          });
        } catch (error) {
          // PB-18 reason in `error.details`; a 409 without it stays the generic conflict.
          if (conflictReason(error) === "PROJECT_KEY_CONFLICT") throw new RepositoryError("invalid", "key-taken");
          if (isConflict(error)) throw new RepositoryError("conflict", "Changed elsewhere");
          throw error;
        }

        try {
          const access = await directory.access(id);
          if (access.status !== "ok") throw new RepositoryError("not-found", "Not found");
          return access.project;
        } catch (cause) {
          throw new ProjectCreatePartialError(id, title, "read", cause);
        }
      }),

    // Uniqueness is the server's (per owner / team namespace): only the format can be checked here.
    isKeyAvailable: (key) => Promise.resolve(isValidProjectKey(key)),

    discard: () =>
      mapErrors(async () => unsupported("Deleting a project needs the owner's password (Settings → Delete project)")),
  };
}
