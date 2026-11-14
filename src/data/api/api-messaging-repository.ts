import { newIdempotencyKey, typedAs, type ApiClient, type ApiClientFor, type RequestBodyIn, type ResponseDataIn } from "@/api/client";
import { ApiHttpError } from "@/api/errors";
import type { paths as CompanyPaths } from "@/api/generated/openapi-p6-companies";
import type { paths } from "@/api/generated/openapi-p6-messaging";
import type { paths as ProjectPaths } from "@/api/generated/openapi-p6-projects";
import type { paths as TeamPaths } from "@/api/generated/openapi-p6-teams";
import type {
  Attachment,
  ConversationDetail,
  ConversationKind,
  ConversationSummary,
  ConversationTab,
  Message,
  MessagePage,
  MessagingNotice,
  MsgPerson,
  MsgSource,
  Participant,
  SearchHit,
} from "../messaging-domain";
import {
  MessagingError,
  type ChannelRepository,
  type ConversationRepository,
  type MessagingSettingsRepository,
  type MessageRepository,
  type MessagingRepository,
} from "../messaging-repositories";
import { createWorkSources } from "./api-meeting-sources";
import { createApiAnnouncements } from "./api-announcements-repository";
import { createApiMeetings } from "./api-meetings-repository";
import { revisionTag } from "./api-shared";
import { catalogVersion } from "./api-retention";
import { initialsOf } from "./api-project-shared";

/*
 * Messages & Meetings (Phase 5) in live mode, over the 864-op subset in
 * `src/api/generated/openapi-p6-messaging.d.ts`. Never mock data, never
 * simulated events.
 * - People: a person's id is the server actor id (stable across
 *   conversations); my own actor becomes the seam's `me` ("me"). Names are
 *   member `displayName` (null → blank). Member (access) ids stay internal.
 * - Rights: `GET /conversations/{id}/access/me` capabilities (`message.send`,
 *   `membership.manage`, `conversation.rename`); the 48 h author window and
 *   the author-delete policy mirror the server, which re-checks every command.
 * - Not served, so never shown as facts: presence (hidden),
 *   edited time, thread counts, link previews. Receipts: server counts for my
 *   latest messages only; unread mentions: `/mentions` after my read-through.
 * - Message commands carry only a message id: the adapter remembers which
 *   conversation each loaded message belongs to.
 * - No realtime transport: `subscribe` never emits.
 * `API_COVERAGE_MATRIX.md` → "Messages & Meetings".
 */

type MsgClient = ApiClientFor<paths>;
type Data<P extends keyof paths, M extends "get" | "post" | "patch" | "put" | "delete"> = ResponseDataIn<paths, P, M>;
type ApiConversation = Data<"/api/v1/conversations", "get">["items"][number];
type ApiMember = Data<"/api/v1/conversations/{id}/members", "get">["items"][number];
type ApiMe = Data<"/api/v1/conversations/{id}/access/me", "get">;
type ApiItem = Data<"/api/v1/conversations/{id}/timeline", "get">["items"][number];
type ApiMediaItem = Data<"/api/v1/conversations/{id}/media-timeline", "get">["items"][number];
type ApiAttachment = ApiMediaItem["attachments"][number];
type ApiInvitation = Data<"/api/v1/conversation-invitations", "get">["items"][number];
type ApiNotice = Data<"/api/v1/messaging-notifications", "get">["items"][number];

const toNotice = (dto: ApiNotice): MessagingNotice => ({
  id: dto.id,
  revision: dto.revision,
  conversationId: dto.conversationId,
  kind: dto.kind === "INVITATION" ? "invitation" : "message",
  messageId: dto.messageId,
  invitationId: dto.invitationId,
  read: dto.read,
  at: dto.createdAt,
});
/** One message as both timelines serve it (text timeline items have no attachments). */
type Item = Omit<ApiItem, "content" | "kind"> & { kind: ApiMediaItem["kind"]; text: string | null; attachments: ApiAttachment[]; sourceId?: string | null };
const fromTimeline = ({ content, ...item }: ApiItem): Item => ({ ...item, text: content?.text ?? null, attachments: [] });
const fromMedia = (item: ApiMediaItem): Item => ({ ...item });

/** Accepted upload types per kind (contract enums); anything else is refused before upload. */
const ACCEPTED: Record<Attachment["kind"], readonly string[]> = {
  image: ["image/png", "image/jpeg"],
  voice: ["audio/wav"],
  file: ["text/plain", "application/pdf", "image/png", "image/jpeg"],
};
const API_KIND = { image: "IMAGE", voice: "VOICE", file: "FILE" } as const;
const SEAM_KIND = { IMAGE: "image", VOICE: "voice", FILE: "file" } as const;

/** The signed-in user (from the session): the seam's `me`. */
export interface MessagingUser {
  id: string;
  name: string;
}

const PAGE = 100;
/** How many of my latest messages per page get a receipt read (one request each). */
const RECEIPTS = 20;
const AUTHOR_WINDOW_MS = 48 * 3_600_000;


const unavailable = (requirement: string) => () => Promise.reject(new MessagingError("unavailable", `Messaging API: ${requirement}`));

/** Live-mode refusals for whole repositories: every method answers "unavailable" with the reason. */
function refused<T extends object>(requirement: string, supported: Partial<T> = {}): T {
  return new Proxy(supported as T, {
    get: (target, name) => (name in target ? target[name as keyof T] : typeof name === "string" && name !== "then" ? unavailable(requirement) : undefined),
  });
}

/** HTTP statuses → the messaging seam's codes. */
async function mapped<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof ApiHttpError) {
      if (error.status === 404) throw new MessagingError("not-found");
      if (error.status === 403) throw new MessagingError(error.message === "AUTHOR_WINDOW_CLOSED" ? "window-expired" : "forbidden");
      if (error.status === 400 || error.status === 422) throw new MessagingError("invalid");
      if (error.status === 409) throw new MessagingError("invalid", "Changed elsewhere");
    }
    throw error;
  }
}

const KIND: Record<ApiConversation["kind"], ConversationKind> = { DM: "direct", PRIVATE_GROUP: "group", PROJECT: "channel", TEAM: "channel", COMPANY: "channel" };
const TAB: Record<ConversationTab, (kind: ConversationKind) => boolean> = {
  all: () => true,
  direct: (kind) => kind === "direct",
  groups: (kind) => kind === "group",
  channels: (kind) => kind === "channel",
};

/** Cursor pages ({items, nextCursor, hasMore?}) until the end. */
async function allPages<T>(fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor?: string | null; hasMore?: boolean }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    if (!page.nextCursor || page.hasMore === false) return items;
    cursor = page.nextCursor;
  }
}

export function createApiMessaging(client: ApiClient, user: MessagingUser): MessagingRepository {
  // My own member row in any conversation (found through that conversation's access/me) is this person.
  const ME: MsgPerson = { id: user.id, name: user.name, initials: initialsOf(user.name) };
  const api: MsgClient = typedAs<paths>(client);
  /** messageId → conversationId, filled by every read. */
  const where = new Map<string, { conversationId: string; media: boolean }>();
  /** Attachment id → object URL of its downloaded bytes. */
  const urls = new Map<string, string>();
  /** Uploads staged by `upload` until `send` posts them into a conversation. */
  const staged = new Map<string, { blob: Blob; sha256: string; kind: Attachment["kind"]; name: string; mime: string }>();
  const workspaceNames = new Map<string, Promise<string>>();

  const conversations = () => allPages<ApiConversation>(async (cursor) => (await api.request("get", "/api/v1/conversations", { query: { cursor, limit: PAGE } })).data);
  const roster = (id: string) => allPages<ApiMember>(async (cursor) => (await api.request("get", "/api/v1/conversations/{id}/members", { path: { id }, query: { cursor, limit: PAGE } })).data);
  const accessMe = async (id: string): Promise<ApiMe> => (await api.request("get", "/api/v1/conversations/{id}/access/me", { path: { id } })).data;
  const readConversation = async (id: string) => {
    const { data, etag } = await api.request("get", "/api/v1/conversations/{id}", { path: { id } });
    return { conversation: data, tag: etag ?? revisionTag(data.revision) };
  };

  /** The workspace title of a channel (blank when the caller cannot read it). */
  const workspaceName = (kind: ApiConversation["kind"], id: string): Promise<string> => {
    const key = `${kind}:${id}`;
    let name = workspaceNames.get(key);
    if (!name) {
      const read =
        kind === "PROJECT"
          ? typedAs<ProjectPaths>(client).request("get", "/api/v1/projects/{id}", { path: { id } })
          : kind === "TEAM"
            ? typedAs<TeamPaths>(client).request("get", "/api/v1/teams/{id}", { path: { id } })
            : typedAs<CompanyPaths>(client).request("get", "/api/v1/companies/{id}", { path: { id } });
      name = read.then(
        ({ data }) => data.title,
        () => "",
      );
      workspaceNames.set(key, name);
    }
    return name;
  };
  const sourceOf = async (conversation: Pick<ApiConversation, "kind" | "sourceId">): Promise<MsgSource> => {
    if (conversation.kind === "DM" || conversation.kind === "PRIVATE_GROUP" || !conversation.sourceId) return { kind: "personal", workspaceId: null, name: "" };
    const kind = conversation.kind === "PROJECT" ? "project" : conversation.kind === "TEAM" ? "team" : "company";
    return { kind, workspaceId: conversation.sourceId, name: await workspaceName(conversation.kind, conversation.sourceId) };
  };

  const personOf = (member: ApiMember | undefined, me: ApiMe | null): MsgPerson => {
    if (!member) return { id: "", name: "", initials: "" };
    if (me && member.actorId === me.actorId) return ME;
    const name = member.displayName ?? "";
    return { id: member.actorId, name, initials: initialsOf(name), ...(member.state === "ACTIVE" || member.displayName ? {} : { deleted: true }) };
  };

  /** Visible messages that mention my membership after my read-through (only asked when something is unread). */
  const unreadMentions = async (row: ApiConversation) => {
    if (row.unreadCount === 0) return 0;
    const [progress, items] = await Promise.all([
      api.request("get", "/api/v1/conversations/{id}/progress", { path: { id: row.id } }).then(({ data }) => BigInt(data.readThrough)),
      allPages(async (cursor) => (await api.request("get", "/api/v1/conversations/{id}/mentions", { path: { id: row.id }, query: { cursor, limit: PAGE } })).data),
    ]);
    return items.filter((item) => item.state === "VISIBLE" && BigInt(item.sequence) > progress).length;
  };

  const summaryOf = async (row: ApiConversation, blocks: ReadonlySet<string>): Promise<ConversationSummary> => {
    const kind = KIND[row.kind];
    // Names: direct titles and the last author come from the roster (only read when needed).
    const needRoster = (kind === "direct" && !row.title) || row.lastMessage !== null;
    const [members, me, source, mentions] = await Promise.all([
      needRoster ? roster(row.id) : Promise.resolve([]),
      needRoster ? accessMe(row.id) : Promise.resolve(null),
      sourceOf(row),
      unreadMentions(row),
    ]);
    const other = kind === "direct" ? members.find((member) => me && member.actorId !== me.actorId) : undefined;
    const title = row.title ?? other?.displayName ?? "";
    const last = row.lastMessage;
    const author = last ? members.find((member) => member.id === last.memberId) : undefined;
    return {
      id: row.id,
      kind,
      title,
      initials: initialsOf(title),
      source,
      lastMessage: last
        ? {
            author: author?.displayName ?? "",
            mine: !!me && last.memberId === me.accessId,
            preview: last.text ?? "",
            kind: last.kind === "MEDIA" ? "file" : "text",
            at: last.createdAt,
          }
        : null,
      unread: row.unreadCount,
      mentions,
      muted: row.muted,
      blocked: kind === "direct" && blocks.has(row.id),
    };
  };

  const activeBlocks = async () =>
    new Set(
      (await allPages<Data<"/api/v1/messaging/blocks", "get">["items"][number]>(async (cursor) => (await api.request("get", "/api/v1/messaging/blocks", { query: { cursor, limit: PAGE } })).data))
        .filter((block) => block.active)
        .map((block) => block.conversationId)
        .filter((id): id is string => id !== null),
    );

  const messageOf = (item: Item, members: readonly ApiMember[], me: ApiMe, context: { authorDelete: boolean; kind: ConversationKind; manage: boolean; byId: ReadonlyMap<string, Item> }): Message | null => {
    if (item.state === "HIDDEN") return null;
    where.set(item.id, { conversationId: item.conversationId, media: item.kind === "MEDIA" });
    const mine = item.memberId === me.accessId;
    const visible = item.state === "VISIBLE";
    const left = Date.parse(item.createdAt) + AUTHOR_WINDOW_MS - Date.now();
    const inWindow = left > 0;
    const hoursLeft = Math.ceil(left / 3_600_000);
    const replied = item.replyToId ? context.byId.get(item.replyToId) : undefined;
    const repliedAuthor = replied ? members.find((member) => member.id === replied.memberId) : undefined;
    return {
      id: item.id,
      conversationId: item.conversationId,
      author: personOf(
        members.find((member) => member.id === item.memberId),
        me,
      ),
      mine,
      createdAt: item.createdAt,
      editedAt: null,
      state: visible ? "visible" : item.state === "DELETED" ? "deleted" : "removed",
      body: visible ? (item.text ?? "") : "",
      replyTo: item.replyToId
        ? { id: item.replyToId, author: repliedAuthor?.displayName ?? "", excerpt: replied?.text?.slice(0, 120) ?? "", deleted: !!replied && replied.state !== "VISIBLE" }
        : null,
      attachments: item.attachments.filter((attachment) => attachment.status === "READY").map(attachmentOf),
      reactions: item.reactions,
      forwarded: item.kind === "FORWARD" || !!item.sourceId,
      pinned: item.pinned,
      mentionsMe: item.mentions.includes(me.accessId),
      taskLink: null,
      thread: null,
      parentId: item.threadId && item.threadId !== item.id ? item.threadId : null,
      alsoInConversation: false,
      receipt: null,
      clientOpId: null,
      fromBlocked: false,
      can: {
        editHoursLeft: mine && visible && inWindow ? hoursLeft : null,
        deleteForEveryone: !mine
          ? { allowed: false, reason: "not-author" }
          : !inWindow
            ? { allowed: false, reason: "window" }
            : context.kind === "channel" && !context.authorDelete
              ? { allowed: false, reason: "policy" }
              : { allowed: true, hoursLeft },
        pin: context.manage || context.kind !== "channel",
        moderate: context.manage && context.kind === "channel",
      },
    };
  };

  /** Everything a message mapping needs for one conversation. */
  const contextOf = async (id: string) => {
    const [members, me, { conversation }, policy] = await Promise.all([
      roster(id),
      accessMe(id),
      readConversation(id),
      api.request("get", "/api/v1/conversations/{id}/message-policy", { path: { id } }).then(
        ({ data }) => data.authorDelete,
        () => true,
      ),
    ]);
    return { members, me, kind: KIND[conversation.kind], authorDelete: policy, manage: me.capabilities.includes("membership.manage") };
  };
  const mapItems = (items: readonly Item[], context: Awaited<ReturnType<typeof contextOf>>) => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return items.map((item) => messageOf(item, context.members, context.me, { ...context, byId })).filter((message): message is Message => message !== null);
  };

  /** Downloads each READY attachment once (bytes stay in the browser as an object URL). */
  const prefetch = async (items: readonly Item[]) => {
    const missing = items.flatMap((item) => item.attachments.filter((attachment) => attachment.status === "READY" && !urls.has(attachment.id)).map((attachment) => ({ item, attachment })));
    await Promise.all(
      missing.map(async ({ item, attachment }) => {
        const { data } = await api.request("get", "/api/v1/conversations/{id}/media-messages/{messageId}/attachments/{attachmentId}/download", {
          path: { id: item.conversationId, messageId: item.id, attachmentId: attachment.id },
        });
        const raw: unknown = data;
        if (raw instanceof Blob) urls.set(attachment.id, URL.createObjectURL(raw));
      }),
    );
  };
  function attachmentOf(attachment: ApiAttachment): Attachment {
    return {
      id: attachment.id,
      kind: SEAM_KIND[attachment.kind],
      name: attachment.filename,
      bytes: attachment.actualSize ?? attachment.expectedSize,
      ...(attachment.durationMs !== null ? { durationSec: Math.round(attachment.durationMs / 1000) } : {}),
      mime: attachment.mimeType,
      ...(urls.has(attachment.id) ? { url: urls.get(attachment.id) } : {}),
      shareable: true,
    };
  }
  /**
   * Receipts of my latest visible messages, as the server counts them after its
   * privacy rules (share flag, consent, blocks). Not sharing, unreadable or older
   * than the last RECEIPTS of mine → left null (nothing shown). Direct
   * conversations may show "seen"; groups and channels stop at "delivered".
   */
  const receiptsOf = async (conversationId: string, ordered: readonly Item[], context: Awaited<ReturnType<typeof contextOf>>) => {
    const mine = ordered.filter((item) => item.state === "VISIBLE" && item.memberId === context.me.accessId).slice(-RECEIPTS);
    const rows = await Promise.all(
      mine.map(async (item) => {
        try {
          const { data } = await api.request("get", "/api/v1/conversations/{id}/messages/{messageId}/receipts", { path: { id: conversationId, messageId: item.id } });
          if (!data.sharing || data.deliveredCount === null || data.readCount === null) return null;
          const receipt: NonNullable<Message["receipt"]> = context.kind === "direct" && data.readCount > 0 ? "seen" : data.deliveredCount > 0 ? "delivered" : "sent";
          return [item.id, receipt] as const;
        } catch (error) {
          if (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) return null;
          throw error;
        }
      }),
    );
    return new Map(rows.filter((row) => row !== null));
  };

  const mapLoaded = async (items: readonly Item[], context: Awaited<ReturnType<typeof contextOf>>) => {
    await prefetch(items);
    return mapItems(items, context);
  };

  const located = (messageId: string) => {
    const at = where.get(messageId);
    if (!at) throw new MessagingError("not-found", "Message not loaded");
    return at;
  };
  const conversationOfMessage = (messageId: string) => located(messageId).conversationId;
  const act = (conversationId: string, body: RequestBodyIn<paths, "/api/v1/conversations/{id}/advanced-actions", "post">) =>
    api.request("post", "/api/v1/conversations/{id}/advanced-actions", { path: { id: conversationId }, header: { "Idempotency-Key": newIdempotencyKey() }, body });
  const details = async (conversationId: string, messageId: string): Promise<Item> =>
    fromTimeline((await api.request("get", "/api/v1/conversations/{id}/message-details/{messageId}", { path: { id: conversationId, messageId } })).data);
  /** A media message by id (text detail when it is not a media message). */
  const mediaDetails = async (conversationId: string, messageId: string): Promise<Item> =>
    fromMedia((await api.request("get", "/api/v1/conversations/{id}/media-messages/{messageId}", { path: { id: conversationId, messageId } })).data);
  const oneMessage = async (conversationId: string, messageId: string, media = false): Promise<Message> => {
    const [item, context] = await Promise.all([media ? mediaDetails(conversationId, messageId) : details(conversationId, messageId), contextOf(conversationId)]);
    const message = (await mapLoaded([item], context))[0];
    if (!message) throw new MessagingError("not-found");
    return message;
  };
  const mediaTimeline = (conversationId: string) =>
    allPages<ApiMediaItem>(
      async (cursor) => (await api.request("get", "/api/v1/conversations/{id}/media-timeline", { path: { id: conversationId }, query: { cursor, limit: PAGE } })).data,
    ).then((items) => items.map(fromMedia));
  /** The other participant's member row in a direct conversation. */
  const otherOf = async (conversationId: string) => {
    const [members, me] = await Promise.all([roster(conversationId), accessMe(conversationId)]);
    return { other: members.find((member) => member.actorId !== me.actorId), me };
  };

  const conversationRepo: ConversationRepository = refused<ConversationRepository>(
    "every conversation call is mapped",
    {
      list: (tab) =>
        mapped(async () => {
          const [rows, blocks] = await Promise.all([conversations(), activeBlocks()]);
          const shown = rows.filter((row) => TAB[tab](KIND[row.kind]));
          const summaries = await Promise.all(shown.map((row) => summaryOf(row, blocks)));
          // The API keeps id cursor order; newest activity first is the screen's order.
          const at = new Map(shown.map((row) => [row.id, row.lastActivityAt]));
          return summaries.sort((a, b) => Date.parse(at.get(b.id)!) - Date.parse(at.get(a.id)!));
        }),

      get: (id) =>
        mapped(async () => {
          let me: ApiMe;
          try {
            me = await accessMe(id);
          } catch (error) {
            if (error instanceof ApiHttpError && (error.status === 403 || error.status === 404)) return { access: "not-found" as const };
            throw error;
          }
          const [rows, blocks, members, pins] = await Promise.all([
            conversations(),
            activeBlocks(),
            roster(id),
            allPages<ApiItem>(async (cursor) => (await api.request("get", "/api/v1/conversations/{id}/pins", { path: { id }, query: { cursor, limit: PAGE } })).data),
          ]);
          const row = rows.find((candidate) => candidate.id === id);
          if (!row) return { access: "not-found" as const };
          const summary = await summaryOf(row, blocks);
          const mine = members.find((member) => member.id === me.accessId);
          const active = members.filter((member) => member.state === "ACTIVE");
          const other = summary.kind === "direct" ? active.find((member) => member.actorId !== me.actorId) : undefined;
          const has = (capability: string) => me.capabilities.includes(capability);
          const detail: ConversationDetail = {
            ...summary,
            access: "member",
            memberCount: active.length,
            myRole: mine?.role === "ADMIN" ? "admin" : "member",
            workspaceAdmin: summary.kind === "channel" && has("membership.manage"),
            joinedAt: mine?.joinedAt ?? row.createdAt,
            joinedLater: !!mine?.historyAfter,
            other: other ? { ...personOf(other, me), presence: { kind: "hidden" } } : null,
            blockedBy: summary.blocked ? "me" : null,
            policy: null,
            linkPreviews: false,
            newcomerHistory: mine?.historyAfter ? "from-join" : "full",
            canPost: has("message.send"),
            canPin: summary.kind !== "channel" || has("membership.manage"),
            canManage: has("membership.manage"),
            threadUnread: 0,
            pinnedCount: pins.filter((item) => item.state === "VISIBLE").length,
            collapseBlocked: false,
          };
          return detail;
        }),

      participants: (id) =>
        mapped(async () => {
          const [members, me] = await Promise.all([roster(id), accessMe(id)]);
          return members
            .filter((member) => member.state === "ACTIVE")
            .map((member): Participant => ({ ...personOf(member, me), role: member.role === "ADMIN" ? "admin" : "member", you: member.actorId === me.actorId }));
        }),

      // Exact-email discovery only; the answer never says whether an account exists.
      // OD-1: direct / private group conversations take the single approved CONVERSATION policy of the operator catalog.
      create: (input) =>
        mapped(async () => {
          if (input.personIds.length === 0) throw new MessagingError("invalid", "Choose at least one person");
          const retentionPolicyVersion = await catalogVersion(client, "CONVERSATION").catch((error: unknown) => {
            throw new MessagingError("unavailable", error instanceof Error ? error.message : "No approved retention policy");
          });
          const id = newIdempotencyKey();
          const header = { "Idempotency-Key": /^[0-9a-f-]{36}$/i.test(input.clientOpId) ? input.clientOpId : newIdempotencyKey() };
          const body =
            input.personIds.length === 1 && !input.name?.trim()
              ? { id, kind: "DM" as const, participants: [input.personIds[0]!] as [string], retentionPolicyVersion }
              : { id, kind: "PRIVATE_GROUP" as const, title: (input.name?.trim() || "").slice(0, 200), participants: input.personIds, retentionPolicyVersion };
          const { data } = await api.request("post", "/api/v1/conversations", { header, body });
          return data.id;
        }),

      // OD-10: my own view (link previews, collapse blocked) is a preference; newcomer history is the conversation's setting.
      updateSettings: (id, patch) =>
        mapped(async () => {
          const read = async () => (await api.request("get", "/api/v1/conversations/{id}/settings", { path: { id } })).data;
          let current = await read();
          if (patch.linkPreviews !== undefined || patch.collapseBlocked !== undefined) {
            current = (
              await api.request("patch", "/api/v1/conversations/{id}/preferences", {
                path: { id },
                header: { "If-Match": revisionTag(current.me.revision) },
                body: { ...(patch.linkPreviews !== undefined ? { linkPreviews: patch.linkPreviews } : {}), ...(patch.collapseBlocked !== undefined ? { collapseBlocked: patch.collapseBlocked } : {}) },
              })
            ).data;
          }
          if (patch.newcomerHistory !== undefined) {
            await api.request("patch", "/api/v1/conversations/{id}/settings", {
              path: { id },
              header: { "If-Match": revisionTag(current.revision) },
              body: { newcomerHistory: patch.newcomerHistory === "full" ? "FULL" : "FROM_JOIN" },
            });
          }
        }),

      updatePolicy: (id, patch) =>
        mapped(async () => {
          if (patch.authorDeleteForEveryone !== undefined) throw new MessagingError("unavailable", "Messaging API: the author-delete policy is read-only");
          const { data: current } = await api.request("get", "/api/v1/conversations/{id}/settings", { path: { id } });
          await api.request("patch", "/api/v1/conversations/{id}/settings", {
            path: { id },
            header: { "If-Match": revisionTag(current.revision) },
            body: {
              ...(patch.newcomerHistory !== undefined ? { newcomerHistory: patch.newcomerHistory === "full" ? ("FULL" as const) : ("FROM_JOIN" as const) } : {}),
              ...(patch.membersCanPin !== undefined ? { membersCanPin: patch.membersCanPin } : {}),
            },
          });
        }),

      // OD-10: a conversation-level report goes to the conversation's moderators.
      report: (id, reason) => mapped(async () => void (await api.request("post", "/api/v1/conversations/{id}/reports", { path: { id }, body: { id: newIdempotencyKey(), reason: String(reason).slice(0, 2000) } }))),

      lookup: (query) =>
        mapped(async () => {
          const email = query.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { people: [] };
          const { data } = await api.request("post", "/api/v1/social/discovery", { body: { email } });
          return { people: data.items.map((person) => ({ id: person.id, name: person.name, initials: initialsOf(person.name) })) };
        }),

      markRead: (id) =>
        mapped(async () => {
          const row = (await conversations()).find((candidate) => candidate.id === id);
          if (!row?.lastMessage) return;
          await api.request("post", "/api/v1/conversations/{id}/acknowledgements", {
            path: { id },
            header: { "Idempotency-Key": newIdempotencyKey() },
            body: { messageId: row.lastMessage.id, state: "READ" },
          });
        }),

      mute: (id, muted) =>
        mapped(async () => {
          const { data: current } = await api.request("get", "/api/v1/conversations/{id}/notification-settings", { path: { id } });
          await api.request("patch", "/api/v1/conversations/{id}/notification-settings", {
            path: { id },
            header: { "If-Match": revisionTag(current.revision), "Idempotency-Key": newIdempotencyKey() },
            body: { mode: muted ? "MUTED" : "ALL", quietStart: current.quietStart, quietEnd: current.quietEnd, mentionQuiet: current.mentionQuiet },
          });
        }),

      leave: (id) =>
        mapped(async () => {
          const [members, me] = await Promise.all([roster(id), accessMe(id)]);
          const mine = members.find((member) => member.id === me.accessId);
          if (!mine) throw new MessagingError("not-found");
          await api.request("post", "/api/v1/conversations/{id}/leave", { path: { id }, header: { "If-Match": revisionTag(mine.revision) }, body: {} });
        }),

      rename: (id, name) =>
        mapped(async () => {
          const title = name.trim();
          if (!title || title.length > 200) throw new MessagingError("invalid");
          const { tag } = await readConversation(id);
          await api.request("patch", "/api/v1/conversations/{id}", { path: { id }, header: { "If-Match": tag }, body: { title } });
        }),

      // Invitations: each person joins after accepting.
      addPeople: (id, personIds) =>
        mapped(async () => {
          for (const userId of personIds) {
            const { tag } = await readConversation(id);
            await api.request("post", "/api/v1/conversations/{id}/invitations", {
              path: { id },
              header: { "If-Match": tag, "Idempotency-Key": newIdempotencyKey() },
              body: { id: crypto.randomUUID(), userId },
            });
          }
        }),

      removePerson: (id, personId) =>
        mapped(async () => {
          const member = (await roster(id)).find((candidate) => candidate.actorId === personId && candidate.state === "ACTIVE");
          if (!member) throw new MessagingError("not-found");
          await api.request("post", "/api/v1/conversations/{id}/members/{memberId}/remove", {
            path: { id, memberId: member.id },
            header: { "If-Match": revisionTag(member.revision) },
            body: {},
          });
        }),

      unreadCount: () => mapped(async () => (await conversations()).reduce((total, row) => total + row.unreadCount, 0)),

      // Rail badge: unread mentions across the workspace's channels I am admitted to.
      workspaceMentions: (workspaceId) =>
        mapped(async () => {
          const channels = (await conversations()).filter((row) => KIND[row.kind] === "channel" && row.sourceId === workspaceId);
          return (await Promise.all(channels.map(unreadMentions))).reduce((total, count) => total + count, 0);
        }),

      // Recipient-only: the server lists PENDING, unexpired invitations it still authorises (no conversation title is served).
      invitations: () =>
        mapped(async () =>
          (await allPages<ApiInvitation>(async (cursor) => (await api.request("get", "/api/v1/conversation-invitations", { query: { cursor, limit: PAGE } })).data))
            .filter((row) => row.state === "PENDING" && Date.parse(row.expiresAt) > Date.now())
            .map((row) => ({ id: row.id, revision: row.revision, conversationId: row.conversationId, kind: KIND[row.kind], inviterName: row.inviterDisplayName ?? null, expiresAt: row.expiresAt })),
        ),

      // If-Match = the invitation revision; a revoked / expired / already-answered one comes back 409 / 404 (shown, never retried).
      respondInvitation: (invitation, accept) =>
        mapped(async () => {
          const call = { path: { invitationId: invitation.id }, header: { "If-Match": revisionTag(invitation.revision) }, body: {} };
          const { data } = accept
            ? await api.request("post", "/api/v1/conversation-invitations/{invitationId}/accept", call)
            : await api.request("post", "/api/v1/conversation-invitations/{invitationId}/decline", call);
          return data.conversationId;
        }),

      notices: () =>
        mapped(async () =>
          (await allPages<ApiNotice>(async (cursor) => (await api.request("get", "/api/v1/messaging-notifications", { query: { cursor, limit: PAGE } })).data))
            .map(toNotice)
            .sort((a, b) => b.at.localeCompare(a.at)),
        ),

      readNotice: (notice) =>
        mapped(async () => {
          if (notice.read) return;
          await api.request("post", "/api/v1/messaging-notifications/{noticeId}/read", { path: { noticeId: notice.id }, header: { "If-Match": revisionTag(notice.revision) }, body: {} });
        }),
    },
  );

  /** Mentions are written as @[Name](actorId); the API takes member ids. */
  const mentionIds = (text: string, members: readonly ApiMember[]) =>
    [
      ...new Set(
        [...text.matchAll(/@\[[^\]]*\]\(([^)]+)\)/g)]
          .map((match) => members.find((member) => member.actorId === match[1] && member.state === "ACTIVE")?.id)
          .filter((id): id is string => !!id),
      ),
    ];

  /** Posts each staged upload into the conversation: create → bytes (complete) → READY attachment ids. */
  const postAttachments = async (conversationId: string, attachments: readonly Attachment[]) => {
    const ids: string[] = [];
    for (const attachment of attachments) {
      const upload = staged.get(attachment.id);
      if (!upload) throw new MessagingError("invalid", "Messaging API: attachment was not staged by upload");
      const { data: created } = await api.request("post", "/api/v1/conversations/{id}/attachments", {
        path: { id: conversationId },
        header: { "Idempotency-Key": newIdempotencyKey() },
        body: { id: crypto.randomUUID(), filename: upload.name, expectedSize: upload.blob.size, sha256: upload.sha256, kind: API_KIND[upload.kind], mimeType: upload.mime } as RequestBodyIn<
          paths,
          "/api/v1/conversations/{id}/attachments",
          "post"
        >,
      });
      const { data: done } = await api.request("post", "/api/v1/conversations/{id}/attachments/{attachmentId}/complete", {
        path: { id: conversationId, attachmentId: created.id },
        body: upload.blob,
      });
      if (done.status !== "READY") throw new MessagingError("invalid", "Messaging API: the attachment was rejected");
      urls.set(done.id, URL.createObjectURL(upload.blob));
      staged.delete(attachment.id);
      ids.push(done.id);
    }
    return ids;
  };

  const sha256 = async (blob: Blob) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, "0")).join("");

  const messageRepo: MessageRepository = refused<MessageRepository>("not in the API", {
    page: (conversationId) =>
      mapped(async (): Promise<MessagePage> => {
        const [items, context, progress] = await Promise.all([
          mediaTimeline(conversationId),
          contextOf(conversationId),
          api.request("get", "/api/v1/conversations/{id}/progress", { path: { id: conversationId } }).then(({ data }) => data),
        ]);
        const ordered = [...items].sort((a, b) => (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1));
        const [mappedMessages, receipts] = await Promise.all([mapLoaded(ordered, context), receiptsOf(conversationId, ordered, context)]);
        const messages = mappedMessages.map((message) => (receipts.has(message.id) ? { ...message, receipt: receipts.get(message.id)! } : message));
        const readThrough = BigInt(progress.readThrough);
        const unread = ordered.filter((item) => item.state === "VISIBLE" && item.memberId !== context.me.accessId && BigInt(item.sequence) > readThrough);
        const mine = context.members.find((member) => member.id === context.me.accessId);
        return {
          items: messages,
          firstUnreadId: unread[0]?.id ?? null,
          unreadCount: unread.length,
          joinedLater: !!mine?.historyAfter,
          joinedAt: mine?.joinedAt ?? "",
        };
      }),

    thread: (conversationId, parentId) =>
      mapped(async () => {
        const [replies, parent, context] = await Promise.all([
          allPages<ApiItem>(
            async (cursor) => (await api.request("get", "/api/v1/conversations/{id}/threads/{messageId}", { path: { id: conversationId, messageId: parentId }, query: { cursor, limit: PAGE } })).data,
          ),
          details(conversationId, parentId),
          contextOf(conversationId),
        ]);
        const [mappedParent, ...mappedReplies] = await mapLoaded([parent, ...replies.filter((item) => item.id !== parentId).map(fromTimeline)], context);
        if (!mappedParent) throw new MessagingError("not-found");
        return { parent: mappedParent, replies: mappedReplies };
      }),

    send: (conversationId, input) =>
      mapped(async () => {
        const text = input.body.trim();
        const attachments = input.attachments ?? [];
        if (!text && !attachments.length) throw new MessagingError("invalid");
        if (text.length > 8000) throw new MessagingError("too-long");
        const members = await roster(conversationId);
        const mentions = mentionIds(text, members);
        const replyToId = input.parentId ?? input.replyToId;
        if (attachments.length) {
          const ids = await postAttachments(conversationId, attachments);
          const { data } = await api.request("post", "/api/v1/conversations/{id}/media-messages", {
            path: { id: conversationId },
            header: { "Idempotency-Key": input.clientOpId },
            body: { id: crypto.randomUUID(), caption: text || null, attachments: ids, ...(replyToId ? { replyToId } : {}), mentions } as RequestBodyIn<
              paths,
              "/api/v1/conversations/{id}/media-messages",
              "post"
            >,
          });
          return oneMessage(conversationId, data.id, true);
        }
        const { data } = await api.request("post", "/api/v1/conversations/{id}/advanced-actions", {
          path: { id: conversationId },
          header: { "Idempotency-Key": input.clientOpId },
          body: { action: "compose", id: crypto.randomUUID(), text, ...(replyToId ? { replyToId } : {}), mentions },
        });
        return oneMessage(conversationId, data.resourceId);
      }),

    // Text messages edit their text; media messages edit their caption.
    edit: (messageId, body) =>
      mapped(async () => {
        const { conversationId, media } = located(messageId);
        const text = body.trim();
        if (media) {
          const current = await mediaDetails(conversationId, messageId);
          await api.request("patch", "/api/v1/conversations/{id}/media-messages/{messageId}", {
            path: { id: conversationId, messageId },
            header: { "If-Match": revisionTag(current.revision), "Idempotency-Key": newIdempotencyKey() },
            body: { caption: text || null },
          });
          return oneMessage(conversationId, messageId, true);
        }
        if (!text) throw new MessagingError("invalid");
        await act(conversationId, { action: "edit", messageId, text });
        return oneMessage(conversationId, messageId);
      }),

    deleteForEveryone: (messageId) => mapped(async () => void (await act(conversationOfMessage(messageId), { action: "delete", messageId }))),
    deleteForMe: (messageId) => mapped(async () => void (await act(conversationOfMessage(messageId), { action: "hide", messageId }))),
    moderate: (messageId) => mapped(async () => void (await act(conversationOfMessage(messageId), { action: "moderate", messageId, reason: "moderation" }))),

    react: (messageId, emoji) =>
      mapped(async () => {
        const { conversationId, media } = located(messageId);
        const current = media ? await mediaDetails(conversationId, messageId) : await details(conversationId, messageId);
        const active = !current.reactions.some((reaction) => reaction.emoji === emoji && reaction.mine);
        await act(conversationId, { action: "reaction", messageId, emoji, active });
      }),

    pin: (messageId, pinned) => mapped(async () => void (await act(conversationOfMessage(messageId), { action: "pin", messageId, active: pinned }))),

    pinned: (conversationId) =>
      mapped(async () => {
        const [items, context] = await Promise.all([
          allPages<ApiItem>(async (cursor) => (await api.request("get", "/api/v1/conversations/{id}/pins", { path: { id: conversationId }, query: { cursor, limit: PAGE } })).data),
          contextOf(conversationId),
        ]);
        return mapLoaded(items.map(fromTimeline), context);
      }),

    // Every READY attachment of the conversation, newest first.
    media: (conversationId) =>
      mapped(async () => {
        const [items, context] = await Promise.all([mediaTimeline(conversationId), contextOf(conversationId)]);
        const withFiles = items.filter((item) => item.state === "VISIBLE" && item.attachments.some((attachment) => attachment.status === "READY"));
        const messages = await mapLoaded(withFiles, context);
        return messages
          .flatMap((message) => message.attachments.map((attachment) => ({ message, attachment })))
          .sort((a, b) => Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt));
      }),

    // Conversations I may post in; the source conversation itself is left out.
    forwardTargets: (messageId) =>
      mapped(async () => {
        const source = conversationOfMessage(messageId);
        const [rows, blocks] = await Promise.all([conversations(), activeBlocks()]);
        const targets = rows.filter((row) => row.id !== source && row.writable);
        const summaries = await Promise.all(targets.map((row) => summaryOf(row, blocks)));
        return summaries.filter((summary) => !summary.blocked).map((summary) => ({ conversationId: summary.id, title: summary.title, kind: summary.kind, source: summary.source, canPost: true }));
      }),

    forward: (messageId, targetId, clientOpId) =>
      mapped(async () => {
        const { conversationId, media } = located(messageId);
        if (media) {
          await api.request("post", "/api/v1/conversations/{id}/media-forwards", {
            path: { id: targetId },
            header: { "Idempotency-Key": clientOpId },
            body: { id: crypto.randomUUID(), sourceConversationId: conversationId, sourceId: messageId },
          });
          return;
        }
        await api.request("post", "/api/v1/conversations/{id}/advanced-actions", {
          path: { id: targetId },
          header: { "Idempotency-Key": clientOpId },
          body: { action: "forward", id: crypto.randomUUID(), sourceConversationId: conversationId, sourceId: messageId },
        });
      }),

    report: (messageId, reason) => mapped(async () => void (await act(conversationOfMessage(messageId), { action: "report", id: crypto.randomUUID(), messageId, reason }))),

    // OD-11: text search over the caller's current conversations (one or all); `has` supports only links; no media / OCR search.
    search: (query, filters) =>
      mapped(async () => {
        if (filters.has && filters.has !== "link") throw new MessagingError("unavailable", "Messaging API: search finds text and links only (no file, image or voice search)");
        let fromMemberId: string | undefined;
        if (filters.from) {
          if (!filters.in) throw new MessagingError("unavailable", "Messaging API: filtering by person needs a conversation");
          const member = (await contextOf(filters.in)).members.find((entry) => entry.actorId === filters.from || entry.id === filters.from);
          if (!member) return [];
          fromMemberId = member.id;
        }
        const hits = await allPages<{ conversationId: string; conversationTitle: string | null; message: ApiItem }>(
          async (cursor) =>
            (
              await api.request("get", "/api/v1/messaging/search", {
                query: {
                  q: query,
                  cursor,
                  limit: PAGE,
                  ...(filters.in ? { conversationId: filters.in } : {}),
                  ...(fromMemberId ? { fromMemberId } : {}),
                  ...(filters.has ? { has: "link" as const } : {}),
                  ...(filters.after ? { after: filters.after } : {}),
                  ...(filters.before ? { before: filters.before } : {}),
                },
              })
            ).data,
        );
        const results: SearchHit[] = [];
        for (const conversationId of [...new Set(hits.map((hit) => hit.conversationId))]) {
          const [context, row] = await Promise.all([contextOf(conversationId), readConversation(conversationId)]);
          const source = await sourceOf(row.conversation);
          const own = hits.filter((hit) => hit.conversationId === conversationId);
          for (const message of await mapLoaded(own.map((hit) => fromTimeline(hit.message)), context)) {
            results.push({ message, conversationId, conversationTitle: own[0]!.conversationTitle ?? row.conversation.title ?? "", kind: context.kind, source });
          }
        }
        return results;
      }),

    /**
     * Stages a file or a voice clip (the seam has no conversation here): reads the
     * picked / recorded bytes from their object URL and checks them against the
     * contract's accepted types. `send` uploads them into the conversation.
     */
    upload: (file, onProgress) =>
      mapped(async (): Promise<Attachment> => {
        if (!ACCEPTED[file.kind].includes(file.mime)) throw new MessagingError("invalid", `Messaging API: ${file.mime || "this type"} is not accepted for ${file.kind}`);
        if (!file.url) throw new MessagingError("invalid", "Messaging API: no file content");
        const blob = await (await fetch(file.url)).blob();
        const id = crypto.randomUUID();
        staged.set(id, { blob, sha256: await sha256(blob), kind: file.kind, name: file.name, mime: file.mime });
        onProgress?.(1);
        return {
          id,
          kind: file.kind,
          name: file.name,
          bytes: blob.size,
          ...(file.durationSec !== undefined ? { durationSec: file.durationSec } : {}),
          mime: file.mime,
          url: file.url,
          shareable: true,
        };
      }),
  });

  const channelRepo: ChannelRepository = refused<ChannelRepository>(
    "creating a channel and the workspace channel defaults (newcomer history, members-can-pin) are not mapped: the API takes participants and has only the author-delete policy",
    {
      list: (workspaceId) =>
        mapped(async () => {
          const [rows, blocks] = await Promise.all([conversations(), activeBlocks()]);
          return Promise.all(rows.filter((row) => KIND[row.kind] === "channel" && row.sourceId === workspaceId).map((row) => summaryOf(row, blocks)));
        }),
    },
  );

  // Blocks are per direct conversation: a person is blocked through our direct conversation with them.
  type ApiBlock = Data<"/api/v1/messaging/blocks", "get">["items"][number];
  const blockRows = () =>
    allPages<ApiBlock>(async (cursor) => (await api.request("get", "/api/v1/messaging/blocks", { query: { cursor, limit: PAGE } })).data).then((rows) => rows.filter((row) => row.active));
  /** The contact-block state of a direct conversation (its ETag guards the change). */
  const contactBlock = async (conversationId: string) => {
    const { data, etag } = await api.request("get", "/api/v1/conversations/{id}/contact-block", { path: { id: conversationId } });
    return { block: data, tag: etag ?? revisionTag(data.revision) };
  };
  const directWith = async (personId: string) => {
    for (const row of (await conversations()).filter((candidate) => candidate.kind === "DM")) {
      const { other } = await otherOf(row.id);
      if (other?.actorId === personId) return row.id;
    }
    throw new MessagingError("not-found", "No direct conversation with this person");
  };

  const settingsRepo: MessagingSettingsRepository = refused<MessagingSettingsRepository>(
    "global receipt / last-seen / online / typing / who-can-message / quiet-hours settings are not in the API (only notifications on/off and web push)",
    {
      blocked: () =>
        mapped(async () => {
          const people: MsgPerson[] = [];
          for (const block of await blockRows()) {
            if (!block.conversationId) continue;
            const { other, me } = await otherOf(block.conversationId);
            if (other) people.push(personOf(other, me));
          }
          return people;
        }),

      block: (personId) =>
        mapped(async () => {
          const conversationId = await directWith(personId);
          const { block, tag } = await contactBlock(conversationId);
          if (block.active) return;
          await api.request("post", "/api/v1/messaging/blocks", { header: { "If-Match": tag, "Idempotency-Key": newIdempotencyKey() }, body: { conversationId, active: true } });
        }),

      unblock: (personId) =>
        mapped(async () => {
          const conversationId = await directWith(personId);
          const { block, tag } = await contactBlock(conversationId);
          if (!block.active || !block.id) return;
          await api.request("post", "/api/v1/messaging/blocks", { header: { "If-Match": tag, "Idempotency-Key": newIdempotencyKey() }, body: { blockId: block.id, active: false } });
        }),
    },
  );

  const work = createWorkSources(client);
  return {
    me: ME,
    conversations: conversationRepo,
    messages: messageRepo,
    channels: channelRepo,
    settings: settingsRepo,
    ...createApiMeetings(api, { me: ME, mapped, allPages, workspaceName, work, retention: () => catalogVersion(client, "MEETING") }),
    announcements: createApiAnnouncements(api, { mapped, allPages, workspaceName, work }),
    // No realtime transport in the contract: nothing is emitted (never simulated).
    subscribe: () => () => undefined,
  };
}

/**
 * Live mode without a signed-in session: the caller's identity is unknown, so
 * every messaging call fails explicitly (never mock data, never a guessed "me").
 */
export function createUnavailableMessaging(): MessagingRepository {
  const reason = "Messaging API: no signed-in session — the caller's identity is unknown";
  const none = refused<object>(reason);
  return {
    me: { id: "", name: "", initials: "" },
    conversations: none as ConversationRepository,
    messages: none as MessageRepository,
    channels: none as ChannelRepository,
    settings: none as MessagingSettingsRepository,
    meetings: none as MessagingRepository["meetings"],
    minutes: none as MessagingRepository["minutes"],
    announcements: none as MessagingRepository["announcements"],
    subscribe: () => () => undefined,
  };
}
