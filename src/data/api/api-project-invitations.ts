import { typedAs, type ApiClient } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-projects";
import type { ProjectInvitation } from "../project-domain";
import type { InvitationRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { conflictAware } from "./api-project-shared";
import { mapErrors, pageAll, revisionTag, unsupported } from "./api-shared";

/*
 * Project invitations for the recipient (OD-4): the list is public-safe (no
 * project, inviter, role or time before accepting → null); the recipient
 * fetches their own one-time proof in the app and answers with it at once
 * (never stored). A decline note is not part of the contract: a decline with
 * a note is refused ("decline-note"), never sent without it.
 */
export function createApiProjectInvitations(client: ApiClient): InvitationRepository {
  const api = typedAs<paths>(client);
  type Mine = { id: string; contextLabel: "Project"; revision: number; expiresAt: string };
  const mine = () => pageAll<Mine>(async (after) => (await api.request("get", "/api/v1/project-invitations", { query: { limit: 100, after } })).data);

  async function proofFor(invitationId: string) {
    const row = (await mine()).find((item) => item.id === invitationId);
    if (!row) throw new RepositoryError("not-found", "Invitation not found");
    return (await api.request("post", "/api/v1/invitations/{invitationId}/proof", { path: { invitationId }, header: { "If-Match": revisionTag(row.revision) }, body: {} })).data;
  }

  return {
    listMine: () =>
      mapErrors(async (): Promise<ProjectInvitation[]> => (await mine()).map((item) => ({ id: item.id, projectId: null, projectName: null, inviter: null, role: null, sentAt: null }))),

    accept: (id) =>
      mapErrors(async () => {
        const proof = await proofFor(id);
        const { data } = await conflictAware(() =>
          api.request("post", "/api/v1/invitations/{id}/accept", { path: { id }, header: { "X-Invitation-Proof": proof.proof, "If-Match": revisionTag(proof.revision) }, body: {} }),
        );
        const projects = await pageAll<{ id: string; spaceId: string }>(async (after) => (await api.request("get", "/api/v1/projects", { query: { limit: 100, after } })).data);
        const project = projects.find((entry) => entry.spaceId === data.invitation.spaceId);
        if (!project) throw new RepositoryError("not-found", "Project not found");
        return { projectId: project.id };
      }),

    decline: (id, note) =>
      mapErrors(async () => {
        // The contract carries no decline note: refused rather than silently dropped.
        if (note?.trim()) unsupported("decline-note");
        const proof = await proofFor(id);
        await conflictAware(() =>
          api.request("post", "/api/v1/invitations/{id}/decline", { path: { id }, header: { "X-Invitation-Proof": proof.proof, "If-Match": revisionTag(proof.revision) }, body: {} }),
        );
      }),
  };
}
