import type { EnergyLevel, Scope, TaskPriority } from "@/data/domain";
import { parseClockTime, parseDay } from "@/lib/dates/clock-time";
import { TASK_CREATE_HREF } from "@/features/personal/routes";
import { ENERGIES, PRIORITIES } from "../domain/filters";

/*
 * The Quick Add → Task Create handoff (P05 · "Add details opens the full
 * page with the parsed values"). The draft travels in the query string so the
 * page is linkable and SSR-safe; every value is validated on the way in.
 * `from` is where creation started: Done returns there (Personal paths only).
 */

export interface TaskDraft {
  title: string;
  scope: Scope;
  /** "YYYY-MM-DD" or null (no date). */
  date: string | null;
  /** "HH:mm"; only with a date. */
  time: string | null;
  durationMinutes: number | null;
  priority: TaskPriority | null;
  energy: EnergyLevel | null;
  areaId: string | null;
}

const SCOPES: readonly Scope[] = ["personal", "project", "team", "company"];
const MAX_DURATION = 24 * 60;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** A same-app Personal path, never an absolute or protocol-relative URL. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/personal") || value.startsWith("//")) return null;
  return value;
}

export function draftFromParams(params: Pick<URLSearchParams, "get">, defaults: Pick<TaskDraft, "durationMinutes" | "energy">): TaskDraft {
  const date = params.get("date");
  const validDate = date !== null && parseDay(date) !== null ? date : null;
  const time = params.get("time");
  const duration = Number(params.get("duration"));
  return {
    title: (params.get("title") ?? "").slice(0, 300),
    scope: pick(params.get("scope"), SCOPES) ?? "personal",
    date: validDate,
    time: validDate && time !== null && parseClockTime(time) !== null ? time : null,
    durationMinutes: Number.isInteger(duration) && duration > 0 && duration <= MAX_DURATION ? duration : defaults.durationMinutes,
    priority: pick(params.get("priority"), PRIORITIES),
    energy: pick(params.get("energy"), ENERGIES) ?? defaults.energy,
    areaId: params.get("area") || null,
  };
}

/** `/personal/tasks/create?title=…&date=…` with only the values that are set. */
export function taskCreateHref(draft: Partial<TaskDraft>, from?: string | null): string {
  const params = new URLSearchParams();
  if (draft.title) params.set("title", draft.title);
  if (draft.scope && draft.scope !== "personal") params.set("scope", draft.scope);
  if (draft.date) params.set("date", draft.date);
  if (draft.date && draft.time) params.set("time", draft.time);
  if (draft.durationMinutes) params.set("duration", String(draft.durationMinutes));
  if (draft.priority) params.set("priority", draft.priority);
  if (draft.energy) params.set("energy", draft.energy);
  if (draft.areaId) params.set("area", draft.areaId);
  const back = safeReturnPath(from);
  if (back) params.set("from", back);
  const query = params.toString();
  return query ? `${TASK_CREATE_HREF}?${query}` : TASK_CREATE_HREF;
}
