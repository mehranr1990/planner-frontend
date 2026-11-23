import type { ApiClient, RequestBodyIn, ResponseData, ResponseDataIn } from "@/api/client";
import { newIdempotencyKey, typedAs } from "@/api/client";
import type { paths as PersonalPaths } from "@/api/generated/openapi-p6-personal";
import { parseClockTime } from "@/lib/dates/clock-time";
import type { ModuleChannels, NotificationModule, NotificationPreferences, NotificationsRepository, PlannerNotification, PushDevice } from "../personal-services";
import { NOTIFICATION_MODULES } from "../personal-services";
import { CHANNEL_FROM_API, CHANNEL_TO_API } from "./api-reminders-repository";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * The bell's inbox over /notifications (owner-private, server-owned read
 * state). "All" = ACTIVE (not dismissed), "Unread" = UNREAD. The deep link
 * is the reminder's task: one /reminders read joins reminderId → taskId.
 * Read / dismiss / snooze send the notification revision (If-Match) and an
 * Idempotency-Key; a 409 re-reads it and sends once more. Preferences and
 * push subscriptions follow the same rule. Nothing here is ever invented:
 * the mock adapter has an empty inbox.
 */

type ApiNotification = ResponseData<"/api/v1/notifications/{id}", "get">;
type ApiPreferences = ResponseDataIn<PersonalPaths, "/api/v1/notifications/preferences", "get">;
type ApiPushSubscription = ResponseData<"/api/v1/push/subscriptions", "post">;

const toDevice = (dto: ApiPushSubscription): PushDevice => ({ id: dto.id, revision: dto.revision, label: dto.label, host: dto.endpointHost, createdAt: dto.createdAt });

const PAGE = "100";
const INBOX_SIZE = "50";

function toPreferences(dto: ApiPreferences): NotificationPreferences {
  return {
    channels: { inApp: dto.inApp, email: dto.email, webPush: dto.webPush },
    available: dto.availableChannels.map((channel) => CHANNEL_FROM_API[channel]),
    reactivateOnReopen: dto.reactivateOnReopen,
    quietStart: dto.quietStart,
    quietEnd: dto.quietEnd,
    pushPublicKey: dto.webPushPublicKey,
    // A server without module switches yet (older API) serves none: the matrix is not offered.
    modules: dto.moduleChannels ? toModules(dto.moduleChannels) : null,
  };
}

const MODULE_TO_API: Record<NotificationModule, string> = {
  personal: "PERSONAL",
  projects: "PROJECTS",
  teams: "TEAMS",
  company: "COMPANY",
  messaging: "MESSAGING_MEETINGS",
  social: "SOCIAL",
};

function toModules(served: ApiPreferences["moduleChannels"]): ModuleChannels {
  return Object.fromEntries(
    NOTIFICATION_MODULES.map((module) => {
      // The server returns all six modules; a missing one reads as off rather than guessed on.
      const row = served[MODULE_TO_API[module]];
      return [module, { inApp: row?.IN_APP ?? false, email: row?.EMAIL ?? false, webPush: row?.WEB_PUSH ?? false }];
    }),
  ) as ModuleChannels;
}

export function createApiNotificationsRepository(client: ApiClient): NotificationsRepository {
  const toNotification = (dto: ApiNotification, tasks: Map<string, string | null>): PlannerNotification => ({
    id: dto.id,
    revision: dto.revision,
    title: dto.title,
    body: dto.body,
    scheduledAt: dto.scheduledAt,
    read: dto.readAt !== null,
    reminderId: dto.reminderId,
    taskId: tasks.get(dto.reminderId) ?? null,
  });

  const reminderTasks = async () =>
    new Map(
      (await pageAll(async (cursor) => (await client.request("get", "/api/v1/reminders", { query: { limit: PAGE, cursor } })).data)).map(
        (reminder) => [reminder.id, reminder.taskId] as const,
      ),
    );

  /** A revision-checked notification write (409 → re-read → once more). */
  async function write<T>(notification: PlannerNotification, send: (ifMatch: string) => Promise<T>): Promise<T> {
    let revision = notification.revision;
    return retryOnConflict(
      () => send(revisionTag(revision)),
      async () => {
        revision = (await client.request("get", "/api/v1/notifications/{id}", { path: { id: notification.id } })).data.revision;
      },
    );
  }

  const headers = (ifMatch: string) => ({ "If-Match": ifMatch, "Idempotency-Key": newIdempotencyKey() });

  return {
    list: (filter) =>
      mapErrors(async () => {
        const [{ data }, tasks] = await Promise.all([
          client.request("get", "/api/v1/notifications", { query: { limit: INBOX_SIZE, state: filter === "unread" ? "UNREAD" : "ACTIVE" } }),
          reminderTasks(),
        ]);
        return data.items.map((dto) => toNotification(dto, tasks)).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
      }),

    get: (id) =>
      mapErrors(async () => {
        const { data } = await client.request("get", "/api/v1/notifications/{id}", { path: { id } });
        const reminder = (await client.request("get", "/api/v1/reminders/{id}", { path: { id: data.reminderId } })).data;
        return toNotification(data, new Map([[reminder.id, reminder.taskId]]));
      }),

    unreadCount: () =>
      mapErrors(async () => {
        // Exact count over the whole Personal inbox (read / dismissed excluded).
        const { data } = await typedAs<PersonalPaths>(client).request("get", "/api/v1/notifications/unread-count", {});
        return data.count;
      }),

    setRead: (notification, read) =>
      mapErrors(async () => {
        const dto = await write(notification, async (ifMatch) =>
          (await client.request("patch", "/api/v1/notifications/{id}/read", { path: { id: notification.id }, header: headers(ifMatch), body: { read } })).data,
        );
        return { ...notification, revision: dto.revision, read: dto.readAt !== null };
      }),

    dismiss: (notification) =>
      mapErrors(async () => {
        await write(notification, (ifMatch) => client.request("post", "/api/v1/notifications/{id}/dismiss", { path: { id: notification.id }, header: headers(ifMatch), body: {} }));
      }),

    snooze: (notification, until) =>
      mapErrors(async () => {
        if (Number.isNaN(Date.parse(until)) || Date.parse(until) <= Date.now()) invalid("Snooze needs a future time");
        await write(notification, (ifMatch) =>
          client.request("post", "/api/v1/notifications/{id}/snooze", { path: { id: notification.id }, header: headers(ifMatch), body: { until } }),
        );
      }),

    preferences: () => mapErrors(async () => toPreferences((await typedAs<PersonalPaths>(client).request("get", "/api/v1/notifications/preferences", {})).data)),

    updatePreferences: (patch) =>
      mapErrors(async () => {
        for (const time of [patch.quietStart, patch.quietEnd]) if (time && parseClockTime(time) === null) invalid(`Bad time "${time}"`);
        const body: RequestBodyIn<PersonalPaths, "/api/v1/notifications/preferences", "patch"> = {};
        if (patch.channels?.inApp !== undefined) body.inApp = patch.channels.inApp;
        if (patch.channels?.email !== undefined) body.email = patch.channels.email;
        if (patch.channels?.webPush !== undefined) body.webPush = patch.channels.webPush;
        if (patch.reactivateOnReopen !== undefined) body.reactivateOnReopen = patch.reactivateOnReopen;
        if (patch.quietStart !== undefined) body.quietStart = patch.quietStart;
        if (patch.quietEnd !== undefined) body.quietEnd = patch.quietEnd;
        if (patch.modules) {
          const rows = Object.entries(patch.modules).filter((entry): entry is [NotificationModule, ModuleChannels[NotificationModule]] => entry[1] !== undefined);
          if (rows.length > 0)
            body.moduleChannels = Object.fromEntries(
              rows.map(([module, row]) => [MODULE_TO_API[module], Object.fromEntries(Object.entries(CHANNEL_TO_API).map(([channel, api]) => [api, row[channel as keyof typeof row]]))]),
            ) as NonNullable<typeof body.moduleChannels>;
        }
        const current = async () => {
          const { etag, data } = await typedAs<PersonalPaths>(client).request("get", "/api/v1/notifications/preferences", {});
          return etag ?? revisionTag(data.revision);
        };
        let ifMatch = await current();
        const { data } = await retryOnConflict(
          () => typedAs<PersonalPaths>(client).request("patch", "/api/v1/notifications/preferences", { header: { "If-Match": ifMatch, "Idempotency-Key": newIdempotencyKey() }, body }),
          async () => {
            ifMatch = await current();
          },
        );
        return toPreferences(data);
      }),

    pushDevices: () =>
      mapErrors(async () =>
        (await pageAll(async (cursor) => (await client.request("get", "/api/v1/push/subscriptions", { query: { limit: PAGE, cursor, state: "ACTIVE" } })).data)).map(
          toDevice,
        ),
      ),

    registerPushDevice: (input) =>
      mapErrors(async () =>
        toDevice((await client.request("post", "/api/v1/push/subscriptions", { header: { "Idempotency-Key": newIdempotencyKey() }, body: input })).data),
      ),

    revokePushDevice: (device) =>
      mapErrors(async () => {
        let revision = device.revision;
        await retryOnConflict(
          () => client.request("delete", "/api/v1/push/subscriptions/{id}", { path: { id: device.id }, header: headers(revisionTag(revision)) }),
          async () => {
            const items = (await client.request("get", "/api/v1/push/subscriptions", { query: { limit: PAGE } })).data.items;
            revision = items.find((item) => item.id === device.id)?.revision ?? revision;
          },
        );
      }),
  };
}
