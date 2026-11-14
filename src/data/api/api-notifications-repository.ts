import type { ApiClient, RequestBody, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { parseClockTime } from "@/lib/dates/clock-time";
import type { NotificationPreferences, NotificationsRepository, PlannerNotification, PushDevice } from "../personal-services";
import { CHANNEL_FROM_API } from "./api-reminders-repository";
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
type ApiPreferences = ResponseData<"/api/v1/notifications/preferences", "get">;

const PAGE = "100";
const INBOX_SIZE = "50";

function toPreferences(dto: ApiPreferences): NotificationPreferences {
  return {
    channels: { inApp: dto.inApp, email: dto.email, webPush: dto.webPush },
    available: dto.availableChannels.map((channel) => CHANNEL_FROM_API[channel]),
    reactivateOnReopen: dto.reactivateOnReopen,
    quietStart: dto.quietStart,
    quietEnd: dto.quietEnd,
  };
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

    unreadCount: () =>
      mapErrors(async () => {
        const { data } = await client.request("get", "/api/v1/notifications", { query: { limit: PAGE, state: "UNREAD" } });
        return data.nextCursor ? Number(PAGE) : data.items.length;
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

    preferences: () => mapErrors(async () => toPreferences((await client.request("get", "/api/v1/notifications/preferences")).data)),

    updatePreferences: (patch) =>
      mapErrors(async () => {
        for (const time of [patch.quietStart, patch.quietEnd]) if (time && parseClockTime(time) === null) invalid(`Bad time "${time}"`);
        const body: RequestBody<"/api/v1/notifications/preferences", "patch"> = {};
        if (patch.channels?.inApp !== undefined) body.inApp = patch.channels.inApp;
        if (patch.channels?.email !== undefined) body.email = patch.channels.email;
        if (patch.channels?.webPush !== undefined) body.webPush = patch.channels.webPush;
        if (patch.reactivateOnReopen !== undefined) body.reactivateOnReopen = patch.reactivateOnReopen;
        if (patch.quietStart !== undefined) body.quietStart = patch.quietStart;
        if (patch.quietEnd !== undefined) body.quietEnd = patch.quietEnd;
        const current = async () => {
          const { etag, data } = await client.request("get", "/api/v1/notifications/preferences");
          return etag ?? revisionTag(data.revision);
        };
        let ifMatch = await current();
        const { data } = await retryOnConflict(
          () => client.request("patch", "/api/v1/notifications/preferences", { header: { "If-Match": ifMatch, "Idempotency-Key": newIdempotencyKey() }, body }),
          async () => {
            ifMatch = await current();
          },
        );
        return toPreferences(data);
      }),

    pushDevices: () =>
      mapErrors(async () =>
        (await pageAll(async (cursor) => (await client.request("get", "/api/v1/push/subscriptions", { query: { limit: PAGE, cursor, state: "ACTIVE" } })).data)).map(
          (dto): PushDevice => ({ id: dto.id, revision: dto.revision, label: dto.label, host: dto.endpointHost, createdAt: dto.createdAt }),
        ),
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
