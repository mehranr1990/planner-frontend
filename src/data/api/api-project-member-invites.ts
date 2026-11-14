import { newIdempotencyKey, type ApiClient } from "@/api/client";
import type { InviteRole, PendingInvite } from "../project-domain";
import type { MemberInviteRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { mapErrors, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { conflictAware, projectsClient } from "./api-project-shared";

/*
 * PJ-13 / PJ-90 invitations, inviter side, through the project's space:
 * `POST /spaces/{spaceId}/invitations` {kind MEMBERSHIP, memberRole, recipient
 * {email}} one email at a time, cancel = `…/{id}/revoke` with If-Match.
 *
 * The one-time `proof` in the create answer is never kept or shown: the
 * recipient fetches their own proof in the app (OD-4). Not in the contract,
 * refused without a request: a per-project pending list, resend, restoring a
 * revoked invitation, and the Task-only (guest) role (guests are task grants,
 * not memberships).
 */

const ROLE = { admin: "ADMIN", manager: "MANAGER", member: "MEMBER", viewer: "VIEWER" } as const;

export function createApiProjectMemberInviteRepository(client: ApiClient): MemberInviteRepository {
  const api = projectsClient(client);
  const spaceOf = async (projectId: string) => (await api.request("get", "/api/v1/projects/{id}", { path: { id: projectId } })).data.spaceId;

  return {
    listPending: () => mapErrors(async () => unsupported("The API lists no pending invitations per project")),

    send: (projectId, emails, role) =>
      mapErrors(async () => {
        if (role === "guest") unsupported("guest-role");
        const memberRole = ROLE[role as Exclude<InviteRole, "guest">];
        const spaceId = await spaceOf(projectId);
        const sent: PendingInvite[] = [];
        for (const [index, email] of emails.entries()) {
          try {
            const { data } = await api.request("post", "/api/v1/spaces/{spaceId}/invitations", {
              path: { spaceId },
              header: { "Idempotency-Key": newIdempotencyKey() },
              body: { kind: "MEMBERSHIP", memberRole, recipient: { email } },
            });
            // `data.proof` is deliberately dropped (recipient-only delivery).
            sent.push({ id: data.invitation.id, email, role, sentAt: new Date().toISOString(), expiresAt: data.invitation.expiresAt });
          } catch (error) {
            if (sent.length === 0) throw error;
            // Some were sent: name the emails that were not (nothing is resent automatically).
            throw new RepositoryError("partial", "invites", { failedIds: emails.slice(index) });
          }
        }
        return sent;
      }),

    resend: () => mapErrors(async () => unsupported("The API has no resend; a new invitation would need a reissue rule")),

    cancel: (projectId, inviteId) =>
      mapErrors(async () => {
        const spaceId = await spaceOf(projectId);
        const read = async () => {
          const { data, etag } = await api.request("get", "/api/v1/spaces/{spaceId}/invitations/{id}", { path: { spaceId, id: inviteId } });
          return { state: data.state, tag: etag ?? revisionTag(data.revision) };
        };
        let current = await read();
        if (current.state !== "PENDING") return;
        const send = () =>
          api.request("post", "/api/v1/spaces/{spaceId}/invitations/{id}/revoke", { path: { spaceId, id: inviteId }, header: { "If-Match": current.tag }, body: {} });
        await conflictAware(() => retryOnConflict(send, async () => (current = await read())));
      }),

    restore: () => mapErrors(async () => unsupported("A revoked invitation cannot be restored")),
  };
}
