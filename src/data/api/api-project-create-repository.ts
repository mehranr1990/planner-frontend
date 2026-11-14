import { newIdempotencyKey, type ApiClient } from "@/api/client";
import { isValidProjectKey } from "../project-key";
import type { ProjectSummary } from "../project-domain";
import { ProjectCreatePartialError, type ProjectCreateRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { invalid, mapErrors, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { catalogVersion } from "./api-retention";
import { createApiProjectDirectory } from "./api-project-directory-repository";
import { conflictAware, projectsClient } from "./api-project-shared";

/*
 * PJ-90 New project over the contract, as one ordered sequence:
 *
 *   1. checks that need no request (name, key format, dates; template and
 *      owning team the API cannot store are refused here, never dropped),
 *   2. `POST /projects` {id, title, description, retentionPolicyVersion}
 *      (the catalog's single PROJECT policy; Idempotency-Key),
 *   3. `PATCH /projects/{id}/metadata` {key, startDate, endDate} with If-Match,
 *   4. the factual summary re-read.
 *
 * Once step 2 has succeeded the project exists: any later failure rejects with
 * `ProjectCreatePartialError` (the created id + what was not saved), so the
 * sheet never submits again and creates a duplicate.
 *
 * Keys: the API keeps no unique index on a project key (each project is its
 * own space), so every well-formed key is accepted; there is no availability
 * read to ask. Undo of create would be a deletion request, which needs the
 * owner's password: refused here, the Settings deletion flow remains.
 */
export function createApiProjectCreateRepository(client: ApiClient): ProjectCreateRepository {
  const api = projectsClient(client);
  const directory = createApiProjectDirectory(client);

  const metadata = async (id: string) => {
    const { data, etag } = await api.request("get", "/api/v1/projects/{id}/metadata", { path: { id } });
    return etag ?? revisionTag(data.revision);
  };

  return {
    limits: { templates: ["blank"], teamOwner: false, discard: false },
    create: (input) =>
      mapErrors(async (): Promise<ProjectSummary> => {
        const title = input.name.trim();
        if (!title) invalid("name");
        if (!isValidProjectKey(input.key)) invalid("key-format");
        if (input.endDate < input.startDate) invalid("dates");
        if (input.template !== "blank") unsupported("template");
        if (input.ownerTeamId) unsupported("The API creates independent projects only; a team-owned project is not in the contract");

        const retentionPolicyVersion = await catalogVersion(client, "PROJECT");
        const id = input.attemptId ?? crypto.randomUUID();
        await api.request("post", "/api/v1/projects", {
          header: { "Idempotency-Key": input.attemptId ?? newIdempotencyKey() },
          body: { id, title, description: input.description?.trim() || null, retentionPolicyVersion },
        });

        // From here the project exists: report exactly what is missing, never "failed".
        try {
          let tag = await metadata(id);
          const send = () =>
            api.request("patch", "/api/v1/projects/{id}/metadata", {
              path: { id },
              header: { "If-Match": tag },
              body: { key: input.key, startDate: input.startDate, endDate: input.endDate },
            });
          await conflictAware(() => retryOnConflict(send, async () => (tag = await metadata(id))));
        } catch (cause) {
          throw new ProjectCreatePartialError(id, title, "details", cause);
        }
        try {
          const access = await directory.access(id);
          if (access.status !== "ok") throw new RepositoryError("not-found", "Not found");
          return access.project;
        } catch (cause) {
          throw new ProjectCreatePartialError(id, title, "read", cause);
        }
      }),

    isKeyAvailable: (key) => Promise.resolve(isValidProjectKey(key)),

    discard: () =>
      mapErrors(async () => unsupported("Deleting a project needs the owner's password (Settings → Delete project)")),
  };
}
