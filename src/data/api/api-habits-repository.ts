import type { ApiClient, RequestBodyIn, ResponseDataIn } from "@/api/client";
import { newIdempotencyKey, typedAs } from "@/api/client";
import type { paths as PersonalPaths } from "@/api/generated/openapi-p6-personal";
import { addDaysToDay, parseClockTime, parseDay, weekdayOfDay } from "@/lib/dates/clock-time";
import { getPlannerTimeZone } from "@/lib/dates/zone";
import type { Habit, HabitIcon, HabitReminder, HabitTimeOfDay } from "../domain";
import { RepositoryError, type HabitDayMark, type HabitInput, type HabitPatch, type HabitsRepository } from "../repositories";
import { invalid, isConflict, mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";

/*
 * Habits (Phase 05) over /habits and /habits/{id}/entries.
 * - A habit without a target is a CHECKBOX habit (COUNT / "1"); with a target
 *   it is QUANTITY with the unit as an API code ("pages" → PAGES). Type and
 *   unit are immutable in the API, so adding/removing a target or changing the
 *   unit later is refused; a unit that is not A–Z/0–9 text is refused too.
 * - Frequency: no rest weekdays → DAILY, else WEEKDAYS (ISO Monday=1…Sunday=7).
 * - Days come from the current RECORDED entries of the last 366 dates: done =
 *   a checkbox entry or logged total ≥ target; skipped = a SKIP entry. Marks
 *   are cleared by voiding entries (history stays on the server).
 * - Entry writes carry habitRevision + Idempotency-Key / the entry's If-Match;
 *   a 409 reloads the habit and its entries and repeats the intent once.
 * - Metadata (contract 0f9ff0a): icon (fixed ids DEFAULT…HEALTH), category
 *   (= the sheet's area), timeOfDay, preferredTime (descriptive only), unitLabel
 *   (display only; the canonical `unit` code keeps every calculation) and
 *   reminder {time, ifNotDone} (null disables; the server schedules it in the
 *   habit's time zone — no frontend scheduler). Metadata edits carry the habit
 *   revision; a 409 reloads and rejects "conflict" instead of re-sending, so a
 *   newer edit made elsewhere is never overwritten.
 * - No API field: one-off rest days → refused ("unsupported"). "Pinned" is not
 *   stored either: the first active habit stands in (the screen's own fallback).
 */

type ApiHabit = ResponseDataIn<PersonalPaths, "/api/v1/habits/{id}", "get">;
type ApiEntry = ResponseDataIn<PersonalPaths, "/api/v1/habits/{id}/entries", "get">["items"][number];
type ApiRule = ApiHabit["latestSchedule"]["schedule"]["rule"];
type HabitPatchBody = RequestBodyIn<PersonalPaths, "/api/v1/habits/{id}", "patch">;
type HabitCreateBody = RequestBodyIn<PersonalPaths, "/api/v1/habits", "post">;
type ApiIcon = NonNullable<HabitPatchBody["icon"]>;
type ApiTimeOfDay = NonNullable<HabitPatchBody["timeOfDay"]>;

interface Known {
  dto: ApiHabit;
  /** Current logical entries by entry id (VOID ones included). */
  entries: Map<string, ApiEntry>;
}

export interface ApiHabitsOptions {
  /** The planner's calendar day ("YYYY-MM-DD"). */
  today: () => string;
}

const PAGE = "100";
const HISTORY_DAYS = 365;
const UNIT_CODE = /^[A-Z][A-Z0-9_]{0,29}$/;
const DECIMAL = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/;
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** category / unitLabel bound (trimmed Unicode text). */
const LABEL_MAX = 100;

const toApiIcon = (icon: HabitIcon): ApiIcon => icon.toUpperCase() as ApiIcon;
const fromApiIcon = (icon: ApiIcon | undefined): HabitIcon => (icon ?? "DEFAULT").toLowerCase() as HabitIcon;
const toApiTime = (time: HabitTimeOfDay): ApiTimeOfDay => time.toUpperCase() as ApiTimeOfDay;
const fromApiTime = (time: ApiTimeOfDay | undefined): HabitTimeOfDay => (time ?? "ANYTIME").toLowerCase() as HabitTimeOfDay;

/** Trimmed text or null (cleared); over the bound → invalid. */
function label(text: string | null | undefined): string | null {
  const value = text?.trim() || null;
  if (value && [...value].length > LABEL_MAX) invalid(`At most ${LABEL_MAX} characters`);
  return value;
}

const reminderBody = (reminder: HabitReminder | null | undefined) => (reminder ? { time: reminder.time, ifNotDone: reminder.ifNotDone } : null);

const isoWeekday = (day: number) => (day === 0 ? 7 : day);

function ruleFor(restWeekdays: readonly number[]): ApiRule {
  const rest = new Set(restWeekdays);
  if (rest.size === 0) return { kind: "DAILY" };
  return { kind: "WEEKDAYS", weekdays: ALL_WEEKDAYS.filter((day) => !rest.has(day)).map(isoWeekday).sort((a, b) => a - b) };
}

function restWeekdaysOf(schedule: ApiHabit["latestSchedule"]["schedule"]): number[] {
  const { rule } = schedule;
  const allBut = (due: ReadonlySet<number>) => ALL_WEEKDAYS.filter((day) => !due.has(day));
  if (rule.kind === "WEEKDAYS") return allBut(new Set(rule.weekdays.map((iso) => iso % 7)));
  if (rule.kind === "WEEKLY" || (rule.kind === "INTERVAL" && rule.days === 7)) return allBut(new Set([weekdayOfDay(schedule.startDate)]));
  // DAILY, and INTERVAL rules the weekday model cannot express.
  return [];
}

/** An exact API decimal (≤ 3 fraction digits) for an amount. */
function decimal(amount: number): string {
  const text = String(Math.round(amount * 1000) / 1000);
  if (!DECIMAL.test(text)) invalid("Amount out of range");
  return text;
}

function unitCode(unit: string): string {
  const code = unit.trim().toUpperCase().replace(/\s+/g, "_");
  if (!UNIT_CODE.test(code)) unsupported("The API stores units as Latin codes only");
  return code;
}

const unitLabel = (code: string) => code.toLowerCase().replace(/_/g, " ");

function checkInput(patch: HabitPatch): void {
  if (patch.title !== undefined && !patch.title.trim()) invalid("A habit needs a name");
  const days = patch.restWeekdays;
  if (days) {
    if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) invalid("Weekdays are 0–6");
    if (new Set(days).size >= 7) invalid("A habit needs at least one day");
  }
  if (patch.target && !(patch.target.amount > 0)) invalid("A target needs a positive amount");
  if (patch.preferredTime && parseClockTime(patch.preferredTime) === null) invalid("Bad time");
  if (patch.reminder && parseClockTime(patch.reminder.time) === null) invalid("Bad time");
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((day, index) => day === right[index]);
}

export function createApiHabitsRepository(apiClient: ApiClient, { today }: ApiHabitsOptions): HabitsRepository {
  const client = typedAs<PersonalPaths>(apiClient);
  const known = new Map<string, Known>();
  /** List order (creation order), so "first active" is stable. */
  let order: string[] = [];

  async function loadEntries(id: string): Promise<Map<string, ApiEntry>> {
    const to = addDaysToDay(today(), 1);
    const items = await pageAll(async (cursor) => (await client.request("get", "/api/v1/habits/{id}/entries", { path: { id }, query: { limit: PAGE, cursor, from: addDaysToDay(to, -(HISTORY_DAYS + 1)), to } })).data);
    return new Map(items.filter((entry) => entry.current).map((entry) => [entry.id, entry]));
  }

  /** Reloads one habit and its entries (unknown id → "not-found"). */
  async function reload(id: string): Promise<Known> {
    const [dto, entries] = await mapErrors(() => Promise.all([client.request("get", "/api/v1/habits/{id}", { path: { id } }).then((r) => r.data), loadEntries(id)]));
    const entry = { dto, entries };
    known.set(id, entry);
    if (!order.includes(id)) order.push(id);
    return entry;
  }

  const knownOrLoad = async (id: string) => known.get(id) ?? reload(id);

  const isArchived = (dto: ApiHabit) => dto.latestSchedule.status === "ARCHIVED";

  function toHabit({ dto, entries }: Known): Habit {
    const quantity = dto.type !== "CHECKBOX";
    const target = Number(dto.latestSchedule.target);
    const done = new Set<string>();
    const skipped = new Set<string>();
    const amounts: Record<string, number> = {};
    for (const entry of entries.values()) {
      if (entry.state !== "RECORDED") continue;
      if (entry.kind === "SKIP") skipped.add(entry.localDate);
      else if (quantity) amounts[entry.localDate] = Math.round(((amounts[entry.localDate] ?? 0) + Number(entry.value ?? 0)) * 1000) / 1000;
      else if (Number(entry.value ?? 1) >= 1) done.add(entry.localDate);
    }
    if (quantity) for (const [day, amount] of Object.entries(amounts)) if (amount >= target) done.add(day);
    const firstActive = order.find((id) => known.has(id) && !isArchived(known.get(id)!.dto));
    return {
      id: dto.id,
      title: dto.title,
      pinned: dto.id === firstActive,
      doneDays: [...done].sort(),
      restWeekdays: restWeekdaysOf(dto.latestSchedule.schedule),
      startDay: dto.latestSchedule.schedule.startDate,
      skippedDays: [...skipped].sort(),
      target: quantity ? { amount: target, unit: unitLabel(dto.unit), label: dto.unitLabel ?? null } : null,
      ...(quantity ? { amounts } : {}),
      archived: isArchived(dto),
      icon: fromApiIcon(dto.icon),
      ...(dto.category ? { area: dto.category } : {}),
      timeOfDay: fromApiTime(dto.timeOfDay),
      preferredTime: dto.preferredTime ?? null,
      reminder: dto.reminder ? { time: dto.reminder.time, ifNotDone: dto.reminder.ifNotDone ?? true } : null,
    };
  }

  /**
   * PATCH the habit with its revision. `resend` (status only): 409 → reload and
   * re-send once. Edits: 409 → reload and reject "conflict" (never overwrite).
   */
  async function patchHabit(id: string, body: HabitPatchBody, resend = false): Promise<Known> {
    const entry = await knownOrLoad(id);
    const send = async () => {
      const current = known.get(id)!;
      current.dto = (await client.request("patch", "/api/v1/habits/{id}", { path: { id }, header: { "If-Match": revisionTag(current.dto.revision) }, body })).data;
    };
    if (resend) await mapErrors(() => retryOnConflict(send, () => reload(id)));
    else
      await mapErrors(async () => {
        try {
          await send();
        } catch (error) {
          if (!isConflict(error)) throw error;
          await reload(id).catch(() => undefined);
          throw new RepositoryError("conflict", "The habit changed elsewhere; reopen it to see the latest version");
        }
      });
    return known.get(id) ?? entry;
  }

  const recorded = (entry: Known, day: string) => [...entry.entries.values()].filter((item) => item.state === "RECORDED" && item.localDate === day);

  async function voidEntry(entry: Known, item: ApiEntry): Promise<void> {
    const { data } = await client.request("patch", "/api/v1/habits/{id}/entries/{entryId}", {
      path: { id: entry.dto.id, entryId: item.id },
      header: { "If-Match": revisionTag(item.revision) },
      body: { habitRevision: entry.dto.revision, void: true },
    });
    entry.entries.set(data.id, data);
  }

  async function post(entry: Known, day: string, body: { action?: "LOG" | "SKIP"; value?: string }): Promise<void> {
    const { data } = await client.request("post", "/api/v1/habits/{id}/entries", {
      path: { id: entry.dto.id },
      header: { "Idempotency-Key": newIdempotencyKey() },
      body: { habitRevision: entry.dto.revision, localDate: day, ...body },
    });
    entry.entries.set(data.id, data);
  }

  /** Makes the day's logged total exactly `amount` (one entry; extra logs are voided). */
  async function setAmount(entry: Known, day: string, amount: number): Promise<void> {
    const [first, ...rest] = recorded(entry, day).filter((item) => item.kind !== "SKIP");
    for (const item of rest) await voidEntry(entry, item);
    const value = decimal(amount);
    if (!first) return post(entry, day, { value });
    if (first.value !== null && Number(first.value) === amount) return;
    const { data } = await client.request("patch", "/api/v1/habits/{id}/entries/{entryId}", {
      path: { id: entry.dto.id, entryId: first.id },
      header: { "If-Match": revisionTag(first.revision) },
      body: { habitRevision: entry.dto.revision, value },
    });
    entry.entries.set(data.id, data);
  }

  /** Runs a day change against the habit's current state; a 409 reloads it and repeats the intent once. */
  async function onDay(id: string, day: string, change: (entry: Known) => Promise<void>): Promise<Habit> {
    if (parseDay(day) === null) invalid(`Bad day "${day}"`);
    await knownOrLoad(id);
    await mapErrors(() => retryOnConflict(() => change(known.get(id)!), () => reload(id)));
    return toHabit(known.get(id)!);
  }

  return {
    async list() {
      const dtos = await pageAll(async (cursor) => (await client.request("get", "/api/v1/habits", { query: { limit: PAGE, cursor } })).data);
      const active = dtos.filter((dto) => !isArchived(dto));
      const entries = await Promise.all(active.map((dto) => loadEntries(dto.id)));
      for (const dto of dtos) if (isArchived(dto)) known.delete(dto.id);
      active.forEach((dto, index) => known.set(dto.id, { dto, entries: entries[index]! }));
      order = active.map((dto) => dto.id);
      return order.map((id) => toHabit(known.get(id)!));
    },

    async create(input: HabitInput) {
      if (!input.title.trim()) invalid("A habit needs a name");
      checkInput(input);
      const target = input.target ?? null;
      const body: HabitCreateBody = {
        title: input.title.trim(),
        type: target ? "QUANTITY" : "CHECKBOX",
        unit: target ? unitCode(target.unit) : "COUNT",
        target: target ? decimal(target.amount) : "1",
        timezone: getPlannerTimeZone(),
        schedule: { version: 1, startDate: today(), rule: ruleFor(input.restWeekdays ?? []) },
        icon: toApiIcon(input.icon ?? "default"),
        timeOfDay: toApiTime(input.timeOfDay ?? "anytime"),
      };
      const category = label(input.area);
      if (category) body.category = category;
      const unitText = target ? label(target.label) : null;
      if (unitText) body.unitLabel = unitText;
      if (input.preferredTime) body.preferredTime = input.preferredTime;
      if (input.reminder) body.reminder = reminderBody(input.reminder);
      const { data } = await mapErrors(async () => client.request("post", "/api/v1/habits", { header: { "Idempotency-Key": newIdempotencyKey() }, body }));
      const entry: Known = { dto: data, entries: new Map() };
      known.set(data.id, entry);
      order.push(data.id);
      return toHabit(entry);
    },

    async update(id, patch) {
      checkInput(patch);
      const entry = await knownOrLoad(id);
      const { dto } = entry;
      const body: HabitPatchBody = {};
      if (patch.title !== undefined && patch.title.trim() !== dto.title) body.title = patch.title.trim();
      if (patch.icon !== undefined && toApiIcon(patch.icon) !== (dto.icon ?? "DEFAULT")) body.icon = toApiIcon(patch.icon);
      if (patch.area !== undefined && label(patch.area) !== (dto.category ?? null)) body.category = label(patch.area);
      if (patch.timeOfDay !== undefined && toApiTime(patch.timeOfDay) !== (dto.timeOfDay ?? "ANYTIME")) body.timeOfDay = toApiTime(patch.timeOfDay);
      if (patch.preferredTime !== undefined && (patch.preferredTime || null) !== (dto.preferredTime ?? null)) body.preferredTime = patch.preferredTime || null;
      if (patch.reminder !== undefined) {
        const next = reminderBody(patch.reminder);
        const current = dto.reminder ? { time: dto.reminder.time, ifNotDone: dto.reminder.ifNotDone ?? true } : null;
        if (JSON.stringify(next) !== JSON.stringify(current)) body.reminder = next;
      }
      if (patch.restWeekdays !== undefined && !sameDays(patch.restWeekdays, restWeekdaysOf(dto.latestSchedule.schedule))) {
        body.schedule = { version: 1, startDate: dto.latestSchedule.schedule.startDate, rule: ruleFor(patch.restWeekdays) };
      }
      if (patch.target !== undefined) {
        const quantity = dto.type !== "CHECKBOX";
        if (Boolean(patch.target) !== quantity) unsupported("A habit's type cannot change");
        if (patch.target) {
          if (unitCode(patch.target.unit) !== dto.unit) unsupported("A habit's unit cannot change");
          if (Number(dto.latestSchedule.target) !== patch.target.amount) body.target = decimal(patch.target.amount);
          if (patch.target.label !== undefined && label(patch.target.label) !== (dto.unitLabel ?? null)) body.unitLabel = label(patch.target.label);
        }
      }
      if (Object.keys(body).length === 0) return toHabit(entry);
      return toHabit(await patchHabit(id, body));
    },

    async setArchived(id, archived) {
      const entry = await knownOrLoad(id);
      if (isArchived(entry.dto) === archived) return toHabit(entry);
      if (!archived) return toHabit(await patchHabit(id, { status: "ACTIVE" }, true));
      const send = async () => {
        const current = known.get(id)!;
        current.dto = (await client.request("delete", "/api/v1/habits/{id}", { path: { id }, header: { "If-Match": revisionTag(current.dto.revision) }, body: {} })).data;
      };
      await mapErrors(() => retryOnConflict(send, () => reload(id)));
      return toHabit(known.get(id)!);
    },

    setDone(id, day, done) {
      return onDay(id, day, async (entry) => {
        const items = recorded(entry, day);
        if (!done) {
          for (const item of items) await voidEntry(entry, item);
          return;
        }
        for (const item of items.filter((item) => item.kind === "SKIP")) await voidEntry(entry, item);
        if (entry.dto.type !== "CHECKBOX") {
          const target = Number(entry.dto.latestSchedule.target);
          const total = items.reduce((sum, item) => (item.kind === "SKIP" ? sum : sum + Number(item.value ?? 0)), 0);
          if (total < target) await setAmount(entry, day, target);
        } else if (!items.some((item) => item.kind === "CHECKBOX" && Number(item.value ?? 1) >= 1)) {
          for (const item of items.filter((item) => item.kind === "CHECKBOX")) await voidEntry(entry, item);
          await post(entry, day, {});
        }
      });
    },

    async setDayMark(id, day, mark: HabitDayMark) {
      if (mark === "rest") unsupported("One-off rest days are not stored by the API");
      return onDay(id, day, async (entry) => {
        const items = recorded(entry, day);
        const skip = items.find((item) => item.kind === "SKIP");
        for (const item of items) if (item !== skip || mark !== "skip") await voidEntry(entry, item);
        if (mark === "skip" && !skip) await post(entry, day, { action: "SKIP" });
      });
    },

    async logAmount(id, day, amount) {
      if (!(amount >= 0)) invalid("An amount cannot be negative");
      return onDay(id, day, async (entry) => {
        if (entry.dto.type === "CHECKBOX") invalid("This habit has no target");
        for (const item of recorded(entry, day).filter((item) => item.kind === "SKIP")) await voidEntry(entry, item);
        await setAmount(entry, day, amount);
      });
    },
  };
}
