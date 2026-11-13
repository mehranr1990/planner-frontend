import type { ApiClientFor, ResponseDataIn } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths } from "@/api/generated/openapi-p6-messaging";
import type { Announcement, MsgSourceKind } from "../messaging-domain";
import { MessagingError, type AnnouncementRepository } from "../messaging-repositories";
import { initialsOf } from "./api-project-shared";

/*
 * Announcements (MT-04) in live mode — the read + acknowledge part (M-A1).
 * - Feed: `GET /announcements/scopes/{kind}/{scopeId}` versions; one card per
 *   announcement = its latest PUBLISHED version. Author = the version's
 *   `authorDisplayName` (null → no author shown, never invented).
 * - Acknowledgement totals: the manager-only `…/acknowledgements` summary
 *   ({eligible, acknowledged}); 403 → none. Pending names are not served.
 * - Not served, so never shown: audience, schedule, pin end, reminders.
 * - Publishing (audience / schedule model) and remind (OD-13) stay refused.
 * `API_COVERAGE_MATRIX.md` → "Messages & Meetings".
 */

type AnnClient = ApiClientFor<paths>;
type ApiVersion = ResponseDataIn<paths, "/api/v1/announcements/scopes/{kind}/{scopeId}", "get">["items"][number];
type Page<T> = { items: T[]; nextCursor?: string | null; hasMore?: boolean };
type WorkKind = "PROJECT" | "TEAM" | "COMPANY";

export interface ApiAnnouncementsDeps {
  mapped: <T>(call: () => Promise<T>) => Promise<T>;
  allPages: <T>(fetchPage: (cursor: string | undefined) => Promise<Page<T>>) => Promise<T[]>;
  workspaceName: (kind: WorkKind, id: string) => Promise<string>;
}

const PAGE = 100;
const WORK_KIND: Partial<Record<MsgSourceKind, WorkKind>> = { project: "PROJECT", team: "TEAM", company: "COMPANY" };
const unavailable = (reason: string) => () => Promise.reject(new MessagingError("unavailable", `Announcements API: ${reason}`));

export function createApiAnnouncements(api: AnnClient, { mapped, allPages, workspaceName }: ApiAnnouncementsDeps): AnnouncementRepository {
  /** announcement id → its shown (latest published) version id, filled by `list`. */
  const shown = new Map<string, string>();

  /** Manager-only totals; null when the caller may not read them. */
  const totals = async (version: ApiVersion) => {
    try {
      const { data } = await api.request("get", "/api/v1/announcements/{id}/versions/{versionId}/acknowledgements", { path: { id: version.announcementId, versionId: version.id } });
      return { done: data.acknowledged, total: data.eligible, pending: [], lastReminderAt: null };
    } catch (error) {
      if (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) return null;
      throw error;
    }
  };

  return {
    list: (workspaceId, kind) =>
      mapped(async () => {
        const scope = kind && WORK_KIND[kind];
        if (!scope) throw new MessagingError("unavailable", "Announcements API: announcements belong to a Project, Team or Company");
        const versions = await allPages<ApiVersion>(
          async (cursor) => (await api.request("get", "/api/v1/announcements/scopes/{kind}/{scopeId}", { path: { kind: scope, scopeId: workspaceId }, query: { cursor, limit: PAGE } })).data,
        );
        const latest = new Map<string, ApiVersion>();
        for (const version of versions)
          if (version.state === "PUBLISHED" && (latest.get(version.announcementId)?.number ?? 0) < version.number) latest.set(version.announcementId, version);
        const name = await workspaceName(scope, workspaceId);
        const rows = await Promise.all(
          [...latest.values()].map(async (version): Promise<Announcement> => {
            shown.set(version.announcementId, version.id);
            const author = version.authorDisplayName ? { id: "", name: version.authorDisplayName, initials: initialsOf(version.authorDisplayName) } : null;
            return {
              id: version.announcementId,
              workspace: { kind: kind!, workspaceId, name },
              title: version.title,
              body: version.text,
              author,
              publishedAt: version.publishedAt,
              scheduledFor: null,
              audience: null,
              pinned: version.pinned,
              pinnedUntil: null,
              requireAck: version.acknowledgement,
              acked: version.acknowledged,
              ack: version.acknowledgement ? await totals(version) : null,
              canRemind: false,
            };
          }),
        );
        return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
      }),
    ack: (id) =>
      mapped(async () => {
        const versionId = shown.get(id);
        if (!versionId) throw new MessagingError("not-found");
        await api.request("post", "/api/v1/announcements/{id}/versions/{versionId}/acknowledge", { path: { id, versionId }, body: {} });
      }),
    access: unavailable("no audience model or publish capability read; the composer stays hidden"),
    publish: unavailable("audience subsets and scheduling are not in the API"),
    remind: unavailable("reminders are not in the API (OD-13)"),
  };
}
