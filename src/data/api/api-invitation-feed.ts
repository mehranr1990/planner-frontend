import { typedAs, type ApiClient, type ResponseDataIn } from "@/api/client";
import type { paths as PersonalPaths } from "@/api/generated/openapi-p6-personal";
import type { InvitationFeedKind, InvitationFeedRepository, InvitationNotice } from "../personal-services";
import { mapErrors } from "./api-shared";

/*
 * Invitation notifications (contract 0f9ff0a, B1–B4):
 * GET /invitation-notifications?kind&limit&after — one feed per kind, only
 * current authorized pending offers (resolved / revoked / expired ones and
 * lost authority drop out server side); it honors the recipient's IN_APP
 * preference, so it never replaces the modules' ordinary pending lists.
 * POST /invitation-notifications/{kind}/{id}/read {} — recipient-only read
 * mark; the offer and its revision are untouched (never an accept).
 */

type ApiKind = PersonalPaths["/api/v1/invitation-notifications"]["get"]["parameters"]["query"]["kind"];
type ApiItem = ResponseDataIn<PersonalPaths, "/api/v1/invitation-notifications", "get">["items"][number];

const PAGE = 25;

const TO_API: Record<InvitationFeedKind, ApiKind> = {
  project: "PROJECT",
  team: "TEAM",
  company: "COMPANY",
  conversation: "CONVERSATION",
  meeting: "MEETING",
  socialGroup: "SOCIAL_GROUP",
};
const FROM_API = Object.fromEntries(Object.entries(TO_API).map(([kind, api]) => [api, kind])) as Record<ApiKind, InvitationFeedKind>;

export const toInvitationNotice = (item: ApiItem): InvitationNotice => ({
  id: item.invitationId,
  kind: FROM_API[item.kind],
  targetId: item.targetId,
  targetName: item.targetDisplayName,
  inviterName: item.inviterDisplayName?.trim() || null,
  role: item.role ?? null,
  createdAt: item.createdAt,
  readAt: item.readAt ?? null,
  revision: item.revision,
  expiresAt: item.expiresAt,
});

export function createApiInvitationFeed(client: ApiClient): InvitationFeedRepository {
  const api = typedAs<PersonalPaths>(client);
  return {
    list: (kind, after) =>
      mapErrors(async () => {
        const query = { kind: TO_API[kind], limit: PAGE, ...(after ? { after } : {}) };
        const { data } = await api.request("get", "/api/v1/invitation-notifications", { query });
        return { items: data.items.map(toInvitationNotice), next: data.nextCursor ?? null };
      }),
    markRead: (kind, id) =>
      mapErrors(async () => {
        const { data } = await api.request("post", "/api/v1/invitation-notifications/{kind}/{id}/read", { path: { kind: TO_API[kind], id }, body: {} });
        return { readAt: data.readAt };
      }),
  };
}
