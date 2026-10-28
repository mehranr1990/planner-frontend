import { z } from "zod";
import { IRAN_WEEK, type WeekConfig, type Weekday } from "@/lib/dates/week";
import { isOptionalModule, optionalModuleIds, type OptionalModuleId, type PersonalModuleId } from "./modules";

/*
 * Planner settings (P17): module visibility, week and work hours, planning
 * defaults, weekly review, focus timer and privacy-lock placeholders. Like
 * the display preferences, the server resolves them per request
 * (request-planner-settings.ts) and seeds a per-tree client store, so rail
 * SSR, hidden-module pages and hydration always agree.
 *
 * Kept deliberately lean: only what Wave 1 needs to validate the seams.
 * New fields need a default here; incompatible changes bump `version`.
 */

export const PLANNER_SETTINGS_VERSION = 1;

export type Rollover = "ask" | "move-to-tomorrow" | "keep";
export type Energy = "low" | "medium" | "high";
/** "HH:MM", 24-hour, in the app time zone. */
export type ClockTime = `${number}:${number}`;

export const focusMinuteOptions = [25, 45, 50, 90] as const;
export const shortBreakMinuteOptions = [5, 10] as const;
export const longBreakMinuteOptions = [15, 20, 30] as const;
export const cyclesBeforeLongBreakOptions = [2, 3, 4, 6] as const;

export interface PlannerSettings {
  version: typeof PLANNER_SETTINGS_VERSION;
  /** Optional modules only; core modules are always visible. */
  modules: Record<OptionalModuleId, boolean>;
  week: WeekConfig;
  workHours: { start: ClockTime; end: ClockTime };
  planning: {
    /** "Unfinished tasks at day end"; "ask" opens Daily shutdown. */
    rollover: Rollover;
    defaultDurationMinutes: number;
    defaultEnergy: Energy;
  };
  weeklyReview: { weekday: Weekday; time: ClockTime };
  focus: {
    focusMinutes: (typeof focusMinuteOptions)[number];
    shortBreakMinutes: (typeof shortBreakMinuteOptions)[number];
    longBreakMinutes: (typeof longBreakMinuteOptions)[number];
    cyclesBeforeLongBreak: (typeof cyclesBeforeLongBreakOptions)[number];
    autoStartNext: boolean;
    /** Daily focus goal (Overview Focus tile: "goal 4h"). */
    dailyGoalMinutes: number;
  };
  /** Placeholders: the toggles persist, no PIN or biometric logic yet. */
  privacy: { journalLock: boolean; financeLock: boolean };
  /**
   * Opt-in Insights actions (P15): nothing changes until the person accepts.
   * protectedFocus: a daily window My Day keeps for deep work ("Protect 09–12").
   * estimateBuffers: extra duration (%) suggested for new tasks per category ("+50%").
   */
  insights: { protectedFocus: { start: ClockTime; end: ClockTime } | null; estimateBuffers: Partial<Record<string, number>> };
}

/** No module hidden at start (P00 Onboarding); Iranian week; Thursday 18:00 review. */
export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  version: PLANNER_SETTINGS_VERSION,
  modules: Object.fromEntries(optionalModuleIds.map((id) => [id, true])) as Record<OptionalModuleId, boolean>,
  week: IRAN_WEEK,
  workHours: { start: "09:00", end: "17:00" },
  planning: { rollover: "ask", defaultDurationMinutes: 30, defaultEnergy: "medium" },
  weeklyReview: { weekday: 4, time: "18:00" },
  focus: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4, autoStartNext: false, dailyGoalMinutes: 240 },
  privacy: { journalLock: false, financeLock: false },
  insights: { protectedFocus: null, estimateBuffers: {} },
};

// Every field carries .catch(default), so one bad value never resets its
// neighbours; a missing or non-object group falls back as a whole.
const D = DEFAULT_PLANNER_SETTINGS;

// WeekConfig's day lists are readonly; the schema's output arrays are not.
const copyWeek = (week: WeekConfig) => ({
  weekStartsOn: week.weekStartsOn,
  workDays: [...week.workDays],
  halfDays: [...week.halfDays],
  weekendDays: [...week.weekendDays],
});

const weekday = z.literal([0, 1, 2, 3, 4, 5, 6]);
const weekdays = (fallback: readonly Weekday[]) =>
  z
    .array(weekday)
    .max(7)
    .transform((days) => [...new Set(days)])
    .catch([...fallback]);
const clockTime = (fallback: ClockTime) =>
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .transform((value) => value as ClockTime)
    .catch(fallback);

const plannerSettingsSchema = z.object({
  version: z.literal(PLANNER_SETTINGS_VERSION).catch(PLANNER_SETTINGS_VERSION),
  modules: z
    .object(
      Object.fromEntries(optionalModuleIds.map((id) => [id, z.boolean().catch(D.modules[id])])) as Record<
        OptionalModuleId,
        z.ZodCatch<z.ZodBoolean>
      >,
    )
    .catch(D.modules),
  week: z
    .object({
      weekStartsOn: weekday.catch(D.week.weekStartsOn),
      workDays: weekdays(D.week.workDays),
      halfDays: weekdays(D.week.halfDays),
      weekendDays: weekdays(D.week.weekendDays),
    })
    .catch(() => copyWeek(D.week)),
  workHours: z
    .object({ start: clockTime(D.workHours.start), end: clockTime(D.workHours.end) })
    .catch(D.workHours),
  planning: z
    .object({
      rollover: z.enum(["ask", "move-to-tomorrow", "keep"]).catch(D.planning.rollover),
      defaultDurationMinutes: z.number().int().min(5).max(480).catch(D.planning.defaultDurationMinutes),
      defaultEnergy: z.enum(["low", "medium", "high"]).catch(D.planning.defaultEnergy),
    })
    .catch(D.planning),
  weeklyReview: z
    .object({ weekday: weekday.catch(D.weeklyReview.weekday), time: clockTime(D.weeklyReview.time) })
    .catch(D.weeklyReview),
  focus: z
    .object({
      focusMinutes: z.literal(focusMinuteOptions).catch(D.focus.focusMinutes),
      shortBreakMinutes: z.literal(shortBreakMinuteOptions).catch(D.focus.shortBreakMinutes),
      longBreakMinutes: z.literal(longBreakMinuteOptions).catch(D.focus.longBreakMinutes),
      cyclesBeforeLongBreak: z.literal(cyclesBeforeLongBreakOptions).catch(D.focus.cyclesBeforeLongBreak),
      autoStartNext: z.boolean().catch(D.focus.autoStartNext),
      dailyGoalMinutes: z.number().int().min(15).max(960).catch(D.focus.dailyGoalMinutes),
    })
    .catch(D.focus),
  privacy: z
    .object({
      journalLock: z.boolean().catch(D.privacy.journalLock),
      financeLock: z.boolean().catch(D.privacy.financeLock),
    })
    .catch(D.privacy),
  insights: z
    .object({
      protectedFocus: z
        .object({ start: clockTime(D.workHours.start), end: clockTime(D.workHours.end) })
        .nullable()
        .catch(D.insights.protectedFocus),
      estimateBuffers: z.record(z.string().max(32), z.number().int().min(0).max(200)).catch({}),
    })
    .catch(() => ({ protectedFocus: null, estimateBuffers: {} })),
});

/**
 * The single validator for untrusted settings (cookie today, account sync
 * later). Field by field: an invalid value falls back to its default, and
 * unknown keys are dropped.
 */
export function parsePlannerSettings(data: unknown): PlannerSettings {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return DEFAULT_PLANNER_SETTINGS;
  return plannerSettingsSchema.parse(data) satisfies PlannerSettings;
}

type SettingsGroup = Exclude<keyof PlannerSettings, "version">;

/** A partial update, merged one level deep: `{ focus: { focusMinutes: 50 } }` keeps the other focus fields. */
export type PlannerSettingsPatch = { [K in SettingsGroup]?: Partial<PlannerSettings[K]> };

/** Merges a patch per group and re-validates, so the result is always a valid settings value. */
export function mergePlannerSettings(current: PlannerSettings, patch: PlannerSettingsPatch): PlannerSettings {
  const next: Record<string, unknown> = { ...current };
  for (const [group, values] of Object.entries(patch)) {
    if (values === undefined || !(group in current) || group === "version") continue;
    next[group] = { ...(current[group as SettingsGroup] as object), ...values };
  }
  return parsePlannerSettings(next);
}

/** Core modules are always visible; optional ones follow the settings. */
export function isModuleVisible(settings: PlannerSettings, id: PersonalModuleId): boolean {
  return isOptionalModule(id) ? settings.modules[id] : true;
}

/** The optional modules currently on, in registry order. */
export function visibleModuleIds(settings: PlannerSettings): OptionalModuleId[] {
  return optionalModuleIds.filter((id) => settings.modules[id]);
}

/**
 * The length planning assumes for a task not on the timeline yet: the raw
 * estimate stretched by the accepted Insights buffer of its category
 * (estimateBuffers, e.g. design +50% → ×1.5), rounded up to 5 minutes.
 * A task belongs to a category when one of its tags (labels, area id or
 * name) is that category id. With no buffer it is the raw estimate; the
 * task's own durationMinutes is never rewritten.
 */
export function planningDurationMinutes(
  rawMinutes: number,
  tags: readonly (string | null | undefined)[],
  buffers: PlannerSettings["insights"]["estimateBuffers"],
): number {
  const percentOf = (tag: string | null | undefined) => {
    const key = tag?.trim().toLowerCase();
    return key && Object.hasOwn(buffers, key) ? (buffers[key] ?? 0) : 0;
  };
  const percent = Math.max(0, ...tags.map(percentOf));
  return percent > 0 ? Math.ceil((rawMinutes * (1 + percent / 100)) / 5) * 5 : rawMinutes;
}

export interface PlannerSettingsStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PlannerSettings;
  /** Applies a patch (merged per group) and returns the new snapshot. */
  update(patch: PlannerSettingsPatch): PlannerSettings;
  /** Replaces the snapshot wholesale (e.g. a change made in another tab). */
  replace(next: PlannerSettings): void;
}

/** A small external store for useSyncExternalStore, one per React tree. */
export function createPlannerSettingsStore(initial: PlannerSettings): PlannerSettingsStore {
  const listeners = new Set<() => void>();
  let snapshot = initial;

  const emit = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    update(patch) {
      snapshot = mergePlannerSettings(snapshot, patch);
      emit();
      return snapshot;
    },
    replace(next) {
      snapshot = next;
      emit();
    },
  };
}
