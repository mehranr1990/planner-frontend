import { newIdempotencyKey, type ApiClientFor, type ResponseDataIn } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths } from "@/api/generated/openapi-p6-messaging";
import type { Announcement, AnnouncementReminder, MsgSourceKind } from "../messaging-domain";
import { MessagingError, type AnnouncementRepository } from "../messaging-repositories";
import type { WorkSources } from "./api-meetings-repository";
import { initialsOf } from "./api-project-shared";
import { revisionTag } from "./api-shared";

/*
 * Announcements (MT-04) in live mode — the read + acknowledge part (M-A1).
 * - Feed: `GET /announcements/scopes/{kind}/{scopeId}` versions; one card per
 *   announcement = its latest PUBLISHED version. Author = the version's
 *   `authorDisplayName` (null → no author shown, never invented).
 * - Acknowledgement totals: the manager-only `…/acknowledgements` summary
 *   ({eligible, acknowledged}); 403 → none. Pending names are not served.
 * - Not served, so never shown: audience, schedule, pin end, reminder history.
 * - Publish (S5): announcement → DRAFT version → publish to the whole source
 *   (audience ALL; NAMED takes access ids, and the API serves no subsets to
 *   offer). The composer shows only where the root access/me allows it (Team /
 *   Company `announcement.publish`; Projects serve no such hint and the server
 *   applies the same source-manager rule as `meeting.create`). Scheduling and
 *   pins with an end date are refused before any write.
 * - Remind (OD-13): offered when the manager-only totals are readable (the same
 *   source-manager rule) and someone is still pending.
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
  work: Pick<WorkSources, "capabilities">;
}

const PAGE = 100;
const WORK_KIND: Partial<Record<MsgSourceKind, WorkKind>> = { project: "PROJECT", team: "TEAM", company: "COMPANY" };
const SOURCE_KIND = { PROJECT: "project", TEAM: "team", COMPANY: "company" } as const;

export function createApiAnnouncements(api: AnnClient, { mapped, allPages, workspaceName, work }: ApiAnnouncementsDeps): AnnouncementRepository {
  /** announcement id → its shown (latest published) version id, filled by `list`. */
  const shown = new Map<string, string>();
  /** clientOpId → the ids and keys of one publish, so a retry replays instead of duplicating. */
  const publishing = new Map<string, { id: string; versionId: string; keys: [string, string, string] }>();

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
            const ack = version.acknowledgement ? await totals(version) : null;
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
              ack,
              canRemind: ack !== null && ack.done < ack.total,
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
    access: (workspaceId, kind) =>
      mapped(async () => {
        const scope = kind && WORK_KIND[kind];
        if (!scope) return { canPublish: false, audiences: [] };
        const capabilities = await work.capabilities(scope, workspaceId);
        const canPublish = !!capabilities?.includes(scope === "PROJECT" ? "meeting.create" : "announcement.publish");
        return { canPublish, audiences: canPublish ? [{ kind: "workspace" as const, label: await workspaceName(scope, workspaceId), memberIds: [] }] : [] };
      }),
    publish: (input) =>
      mapped(async () => {
        const scope = WORK_KIND[input.workspace.kind];
        if (!scope || !input.workspace.workspaceId) throw new MessagingError("unavailable", "Announcements API: announcements belong to a Project, Team or Company");
        if (input.audience.kind !== "workspace") throw new MessagingError("unavailable", "Announcements API: audience subsets are not served (whole source only)");
        if (input.scheduleAt) throw new MessagingError("unavailable", "Announcements API: scheduled publishing is not in the API");
        if (input.pinDays !== null) throw new MessagingError("unavailable", "Announcements API: pins have no end date in the API");
        const run = publishing.get(input.clientOpId) ?? { id: newIdempotencyKey(), versionId: newIdempotencyKey(), keys: [newIdempotencyKey(), newIdempotencyKey(), newIdempotencyKey()] };
        publishing.set(input.clientOpId, run);
        const { id, versionId, keys } = run;
        await api.request("post", "/api/v1/announcements", { header: { "Idempotency-Key": keys[0] }, body: { id, kind: scope, sourceId: input.workspace.workspaceId } });
        const { data: draft } = await api.request("post", "/api/v1/announcements/{id}/versions", {
          path: { id },
          header: { "Idempotency-Key": keys[1] },
          body: { id: versionId, title: input.title.trim().slice(0, 300), text: input.body.trim(), acknowledgement: input.requireAck },
        });
        // A replayed draft that already went out needs no second publish.
        if (draft.state === "DRAFT")
          await api.request("post", "/api/v1/announcements/{id}/versions/{versionId}/publish", {
            path: { id, versionId },
            header: { "If-Match": revisionTag(draft.revision), "Idempotency-Key": keys[2] },
            body: { audience: "ALL" },
          });
        publishing.delete(input.clientOpId);
        return id;
      }),
    // OD-13: one in-app reminder per recipient per day for the latest published version (the server deduplicates).
    remind: (id) =>
      mapped(async () => {
        const versionId = shown.get(id);
        if (!versionId) throw new MessagingError("not-found");
        await api.request("post", "/api/v1/announcements/{id}/versions/{versionId}/remind", { path: { id, versionId }, body: {} });
      }),

    // Bell: my reminders; the title and source come only from reads the server still authorises (403 / 404 → generic row, no link).
    reminders: () =>
      mapped(async () => {
        const { data } = await api.request("get", "/api/v1/announcement-reminders");
        const rows = await Promise.all(
          data.items.map(async (row): Promise<AnnouncementReminder> => {
            const base = { id: row.id, announcementId: row.announcementId, at: row.createdAt, read: row.readAt !== null, title: null, source: null };
            try {
              const [{ data: announcement }, { data: version }] = await Promise.all([
                api.request("get", "/api/v1/announcements/{id}", { path: { id: row.announcementId } }),
                api.request("get", "/api/v1/announcements/{id}/versions/{versionId}", { path: { id: row.announcementId, versionId: row.versionId } }),
              ]);
              const kind = SOURCE_KIND[announcement.kind];
              return { ...base, title: version.title, source: { kind, workspaceId: announcement.sourceId, name: await workspaceName(announcement.kind, announcement.sourceId) } };
            } catch (error) {
              if (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) return base;
              throw error;
            }
          }),
        );
        return rows.sort((a, b) => b.at.localeCompare(a.at));
      }),

    readReminder: (id) =>
      mapped(async () => {
        await api.request("post", "/api/v1/announcement-reminders/{reminderId}/read", { path: { reminderId: id }, body: {} });
      }),
  };
}
