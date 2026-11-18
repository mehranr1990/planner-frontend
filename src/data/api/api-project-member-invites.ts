import { newIdempotencyKey, type ApiClient } from "@/api/client";
import type { InviteRole, PendingInvite } from "../project-domain";
import type { MemberInviteRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { conflictAware, projectsClient, type ProjectsData } from "./api-project-shared";

/*
 * PJ-13 / PJ-90 invitations, inviter side, through the project's space:
 * `POST /spaces/{spaceId}/invitations` {kind MEMBERSHIP, memberRole, recipient
 * {email}} one email at a time, cancel = `…/{id}/revoke` with If-Match.
 *
 * The one-time `proof` in the create answer is never kept or shown: the
 * recipient fetches their own proof in the app (OD-4). Pending list = the
 * space's management list (`state=PENDING`, MEMBERSHIP kind; `sentAt` is the
 * in-app offer time, a withheld email stays ""). Resend = `…/{id}/resend`
 * (If-Match + Idempotency-Key; rotates the proof, which is never shown).
 * Refused without a request: restoring a revoked invitation and the
 * Task-only (guest) role (guests are task grants, not memberships).
 */

const ROLE = { admin: "ADMIN", manager: "MANAGER", member: "MEMBER", viewer: "VIEWER" } as const;
const FROM_ROLE = { ADMIN: "admin", MANAGER: "manager", MEMBER: "member", VIEWER: "viewer" } as const;
const PAGE = 100;

type ApiSentInvitation = ProjectsData<"/api/v1/spaces/{spaceId}/invitations", "get">["items"][number];

const toPending = (invitation: ApiSentInvitation): PendingInvite => ({
  id: invitation.id,
  email: invitation.recipientEmail ?? "",
  role: FROM_ROLE[invitation.memberRole],
  sentAt: invitation.sentAt,
  expiresAt: invitation.expiresAt,
});

export function createApiProjectMemberInviteRepository(client: ApiClient): MemberInviteRepository {
  const api = projectsClient(client);
  const spaceOf = async (projectId: string) => (await api.request("get", "/api/v1/projects/{id}", { path: { id: projectId } })).data.spaceId;

  const pending = async (spaceId: string): Promise<ApiSentInvitation[]> =>
    (
      await pageAll<ApiSentInvitation>(
        async (after) => (await api.request("get", "/api/v1/spaces/{spaceId}/invitations", { path: { spaceId }, query: { state: "PENDING", limit: PAGE, after } })).data,
      )
    ).filter((invitation) => invitation.kind === "MEMBERSHIP");

  return {
    listPending: (projectId) => mapErrors(async () => (await pending(await spaceOf(projectId))).map(toPending)),

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

    resend: (projectId, inviteId) =>
      mapErrors(async () => {
        const spaceId = await spaceOf(projectId);
        const current = (await pending(spaceId)).find((invitation) => invitation.id === inviteId);
        if (!current) throw new RepositoryError("not-found", "Not found");
        // The answer carries no acceptance proof for the inviter; the new revision is read back with the list.
        await conflictAware(() =>
          api.request("post", "/api/v1/spaces/{spaceId}/invitations/{id}/resend", {
            path: { spaceId, id: inviteId },
            header: { "If-Match": revisionTag(current.revision), "Idempotency-Key": newIdempotencyKey() },
            body: {},
          }),
        );
        const fresh = (await pending(spaceId)).find((invitation) => invitation.id === inviteId);
        if (!fresh) throw new RepositoryError("not-found", "Not found");
        return toPending(fresh);
      }),

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
