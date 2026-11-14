import type { ApiClient, RequestBody, ResponseData } from "@/api/client";
import { newIdempotencyKey } from "@/api/client";
import { parseClockTime, parseDay } from "@/lib/dates/clock-time";
import type { Weekday } from "@/lib/dates/week";
import type {
  DeliveryState,
  NotificationChannel,
  Reminder,
  ReminderDelivery,
  ReminderInput,
  ReminderSchedule,
  RemindersRepository,
  RepeatFrequency,
  RepeatRule,
  TaskReminderField,
} from "../personal-services";
import { invalid, mapErrors, pageAll, retryOnConflict, revisionTag } from "./api-shared";

/*
 * Reminders over /reminders (owner-private). Rules map 1:1 to the contract's
 * ABSOLUTE / LOCAL (+ recurrence) / TASK kinds; the zone is always the
 * account zone (timezoneMode ACCOUNT). A task link sends the task's current
 * revision. Delete cancels the reminder (the server keeps it as CANCELED,
 * which the list hides). Writes send the reminder revision as If-Match and
 * re-read once on 409. Delivery history is read-only; nothing here promises
 * that a send happened.
 */

type ApiReminder = ResponseData<"/api/v1/reminders/{id}", "get">;
type ApiRule = ApiReminder["rule"];
type ApiChannel = ApiReminder["channels"][number];
export type ApiSchedule = NonNullable<Extract<ApiRule, { kind: "LOCAL" }>["recurrence"]>;

const PAGE = "100";

export const CHANNEL_FROM_API: Record<ApiChannel, NotificationChannel> = { IN_APP: "inApp", EMAIL: "email", WEB_PUSH: "webPush" };
export const CHANNEL_TO_API: Record<NotificationChannel, ApiChannel> = { inApp: "IN_APP", email: "EMAIL", webPush: "WEB_PUSH" };

const FREQ_TO_API: Record<RepeatFrequency, ApiSchedule["frequency"]> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  weekdays: "SELECTED_WEEKDAYS",
  monthly: "MONTHLY",
  yearly: "YEARLY",
  interval: "INTERVAL",
};
const FREQ_FROM_API = Object.fromEntries(Object.entries(FREQ_TO_API).map(([key, value]) => [value, key])) as Record<ApiSchedule["frequency"], RepeatFrequency>;

const FIELD_TO_API: Record<TaskReminderField, "DUE_AT" | "PLANNED_START_AT" | "SCHEDULED_DATE"> = { due: "DUE_AT", start: "PLANNED_START_AT", scheduled: "SCHEDULED_DATE" };
const FIELD_FROM_API = { DUE_AT: "due", PLANNED_START_AT: "start", SCHEDULED_DATE: "scheduled" } as const;

/** The contract's schedule rule (shared by reminders and bills). */
export function repeatToApi(rule: RepeatRule): ApiSchedule {
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 365) invalid("Repeat interval is 1–365");
  if (rule.until !== null && parseDay(rule.until) === null) invalid(`Bad day "${rule.until}"`);
  if (rule.count !== null && (!Number.isInteger(rule.count) || rule.count < 1 || rule.count > 10000)) invalid("Repeat count is 1–10000");
  const weekdays = rule.frequency === "weekdays" ? [...new Set(rule.weekdays)].sort((a, b) => a - b) : [];
  if (rule.frequency === "weekdays" && weekdays.length === 0) invalid("Pick at least one weekday");
  return { version: 1, frequency: FREQ_TO_API[rule.frequency], interval: rule.interval, weekdays, until: rule.until, count: rule.count, exclusions: [] };
}

export function repeatFromApi(schedule: ApiSchedule | null | undefined): RepeatRule | null {
  if (!schedule) return null;
  return {
    frequency: FREQ_FROM_API[schedule.frequency],
    interval: schedule.interval ?? 1,
    weekdays: (schedule.weekdays ?? []) as Weekday[],
    until: schedule.until ?? null,
    count: schedule.count ?? null,
  };
}

function ruleToApi(schedule: ReminderSchedule): ApiRule {
  if (schedule.kind === "at") {
    if (Number.isNaN(Date.parse(schedule.at))) invalid("Bad reminder time");
    return { version: 1, kind: "ABSOLUTE", at: schedule.at };
  }
  if (schedule.kind === "local") {
    if (parseDay(schedule.day) === null || parseClockTime(schedule.time) === null) invalid("Bad reminder day or time");
    return { version: 1, kind: "LOCAL", startDate: schedule.day, time: schedule.time, recurrence: schedule.repeat ? repeatToApi(schedule.repeat) : null };
  }
  if (!Number.isInteger(schedule.offsetMinutes) || Math.abs(schedule.offsetMinutes) > 525600) invalid("Bad reminder offset");
  if (schedule.field === "scheduled") {
    if (!schedule.time || parseClockTime(schedule.time) === null) invalid("A scheduled-day reminder needs a time");
    return { version: 1, kind: "TASK", field: "SCHEDULED_DATE", offsetMinutes: schedule.offsetMinutes, localTime: schedule.time };
  }
  return { version: 1, kind: "TASK", field: FIELD_TO_API[schedule.field], offsetMinutes: schedule.offsetMinutes };
}

function ruleFromApi(rule: ApiRule): ReminderSchedule {
  if (rule.kind === "ABSOLUTE") return { kind: "at", at: rule.at };
  if (rule.kind === "LOCAL") return { kind: "local", day: rule.startDate, time: rule.time, repeat: repeatFromApi(rule.recurrence) };
  return { kind: "task", field: FIELD_FROM_API[rule.field], offsetMinutes: rule.offsetMinutes ?? 0, time: rule.localTime ?? null };
}

export function toReminder(dto: ApiReminder): Reminder {
  return {
    id: dto.id,
    revision: dto.revision,
    title: dto.title,
    body: dto.body,
    taskId: dto.taskId,
    schedule: ruleFromApi(dto.rule),
    channels: dto.channels.map((channel) => CHANNEL_FROM_API[channel]),
    urgent: dto.urgent,
    state: dto.state === "PAUSED" ? "paused" : "active",
    nextAt: dto.nextAt,
    exhausted: dto.exhausted,
  };
}

function checkInput(input: Partial<ReminderInput>) {
  if (input.title !== undefined && (!input.title.trim() || input.title.length > 300)) invalid("A reminder needs a title (≤ 300)");
  if (input.body && input.body.length > 2000) invalid("Note is too long");
  if (input.channels !== undefined && (input.channels.length === 0 || new Set(input.channels).size !== input.channels.length)) invalid("Pick at least one channel");
  if (input.schedule?.kind === "task" && input.taskId === null) invalid("A task reminder needs its task");
  if (input.schedule?.kind === "local" && input.schedule.repeat && input.taskId) invalid("A task reminder cannot repeat");
}

export function createApiRemindersRepository(client: ApiClient): RemindersRepository {
  const taskRevision = async (taskId: string) => (await client.request("get", "/api/v1/tasks/{id}", { path: { id: taskId } })).data.revision;
  const load = async (id: string) => (await client.request("get", "/api/v1/reminders/{id}", { path: { id } })).data;

  async function body(input: Partial<ReminderInput>) {
    const out: RequestBody<"/api/v1/reminders/{id}", "patch"> = {};
    if (input.title !== undefined) out.title = input.title.trim();
    if (input.body !== undefined) out.body = input.body?.trim() || null;
    if (input.taskId !== undefined) {
      out.taskId = input.taskId;
      if (input.taskId) out.taskRevision = await taskRevision(input.taskId);
    }
    if (input.schedule !== undefined) out.rule = ruleToApi(input.schedule);
    if (input.channels !== undefined) out.channels = input.channels.map((channel) => CHANNEL_TO_API[channel]);
    if (input.urgent !== undefined) out.urgent = input.urgent;
    return out;
  }

  /** A revision-checked write; on 409 the reminder is re-read and the write sent once more. */
  async function write(reminder: Reminder, send: (ifMatch: string) => Promise<ApiReminder>): Promise<Reminder> {
    let revision = reminder.revision;
    return toReminder(
      await retryOnConflict(
        () => send(revisionTag(revision)),
        async () => {
          revision = (await load(reminder.id)).revision;
        },
      ),
    );
  }

  return {
    list: (filter = {}) =>
      mapErrors(async () =>
        (await pageAll(async (cursor) => (await client.request("get", "/api/v1/reminders", { query: { limit: PAGE, cursor, taskId: filter.taskId } })).data))
          .filter((dto) => dto.state !== "CANCELED")
          .map(toReminder),
      ),

    create: (input) =>
      mapErrors(async () => {
        checkInput(input);
        const payload = { ...(await body(input)), rule: ruleToApi(input.schedule), timezoneMode: "ACCOUNT" as const };
        const { data } = await client.request("post", "/api/v1/reminders", { header: { "Idempotency-Key": newIdempotencyKey() }, body: payload });
        return toReminder(data);
      }),

    update: (reminder, patch) =>
      mapErrors(async () => {
        checkInput({ taskId: reminder.taskId, ...patch });
        const payload = await body(patch);
        return write(reminder, async (ifMatch) =>
          (await client.request("patch", "/api/v1/reminders/{id}", { path: { id: reminder.id }, header: { "If-Match": ifMatch, "Idempotency-Key": newIdempotencyKey() }, body: payload })).data,
        );
      }),

    setPaused: (reminder, paused) =>
      mapErrors(() =>
        write(reminder, async (ifMatch) => {
          const init = { path: { id: reminder.id }, header: { "If-Match": ifMatch, "Idempotency-Key": newIdempotencyKey() }, body: {} };
          return (paused ? await client.request("post", "/api/v1/reminders/{id}/pause", init) : await client.request("post", "/api/v1/reminders/{id}/resume", init)).data;
        }),
      ),

    remove: (reminder) =>
      mapErrors(async () => {
        await write(reminder, async (ifMatch) =>
          (await client.request("delete", "/api/v1/reminders/{id}", { path: { id: reminder.id }, header: { "If-Match": ifMatch, "Idempotency-Key": newIdempotencyKey() } })).data,
        );
      }),

    deliveries: (reminderId) =>
      mapErrors(async () => {
        const { data } = await client.request("get", "/api/v1/reminders/{id}/deliveries", { path: { id: reminderId }, query: { limit: "50", kind: "CHANNEL" } });
        return data.items
          .map(
            (item): ReminderDelivery => ({
              id: item.id,
              channel: CHANNEL_FROM_API[item.channel],
              state: item.state.toLowerCase() as DeliveryState,
              at: item.sentAt ?? item.scheduledAt,
              attempts: item.attempts,
              reason: item.reason,
            }),
          )
          .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
      }),
  };
}
