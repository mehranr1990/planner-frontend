import { describe, expect, it } from "vitest";
import { IRAN_WEEK } from "@/lib/dates/week";
import { optionalModuleIds } from "./modules";
import {
  createPlannerSettingsStore,
  DEFAULT_PLANNER_SETTINGS,
  isModuleVisible,
  mergePlannerSettings,
  parsePlannerSettings,
  planningDurationMinutes,
  visibleModuleIds,
  type PlannerSettings,
} from "./planner-settings";
import {
  parsePlannerSettingsCookie,
  PLANNER_SETTINGS_COOKIE,
  plannerSettingsCookieString,
  serializePlannerSettings,
} from "./planner-settings-cookie";

const custom: PlannerSettings = {
  ...DEFAULT_PLANNER_SETTINGS,
  modules: { ...DEFAULT_PLANNER_SETTINGS.modules, finance: false, journal: false },
  week: { weekStartsOn: 1, workDays: [1, 2, 3, 4, 5], halfDays: [], weekendDays: [0, 6] },
  workHours: { start: "08:30", end: "16:30" },
  planning: { rollover: "keep", defaultDurationMinutes: 45, defaultEnergy: "high" },
  weeklyReview: { weekday: 5, time: "17:00" },
  focus: { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, cyclesBeforeLongBreak: 3, autoStartNext: true, dailyGoalMinutes: 180 },
  privacy: { journalLock: true, financeLock: false },
};

describe("DEFAULT_PLANNER_SETTINGS", () => {
  it("hides nothing, asks at day end and reviews on Thursday 18:00", () => {
    expect(DEFAULT_PLANNER_SETTINGS).toEqual({
      version: 1,
      modules: { goals: true, habits: true, finance: true, journal: true, insights: true, braindump: true },
      week: IRAN_WEEK,
      workHours: { start: "09:00", end: "17:00" },
      planning: { rollover: "ask", defaultDurationMinutes: 30, defaultEnergy: "medium" },
      weeklyReview: { weekday: 4, time: "18:00" },
      focus: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4, autoStartNext: false, dailyGoalMinutes: 240 },
      privacy: { journalLock: false, financeLock: false },
      insights: { protectedFocus: null, estimateBuffers: {} },
    });
  });

  it("parses to itself", () => {
    expect(parsePlannerSettings(DEFAULT_PLANNER_SETTINGS)).toEqual(DEFAULT_PLANNER_SETTINGS);
  });
});

describe("parsePlannerSettings", () => {
  it.each([null, undefined, "x", 42, [], true])("falls back to defaults for %j", (data) => {
    expect(parsePlannerSettings(data)).toEqual(DEFAULT_PLANNER_SETTINGS);
  });

  it("keeps a complete valid value", () => {
    expect(parsePlannerSettings(custom)).toEqual(custom);
  });

  it("fills missing groups and fields from the defaults", () => {
    expect(parsePlannerSettings({ modules: { goals: false } })).toEqual({
      ...DEFAULT_PLANNER_SETTINGS,
      modules: { ...DEFAULT_PLANNER_SETTINGS.modules, goals: false },
    });
  });

  it("replaces each invalid field on its own, keeping its valid neighbours", () => {
    const parsed = parsePlannerSettings({
      ...custom,
      modules: { ...custom.modules, habits: "no" },
      workHours: { start: "25:00", end: "16:30" },
      planning: { rollover: "later", defaultDurationMinutes: 45.5, defaultEnergy: "high" },
      weeklyReview: { weekday: 9, time: "17:00" },
      focus: { ...custom.focus, focusMinutes: 30, cyclesBeforeLongBreak: 3 },
      privacy: "locked",
      week: { ...custom.week, workDays: [1, 8] },
    });
    expect(parsed.modules).toEqual({ ...custom.modules, habits: true });
    expect(parsed.workHours).toEqual({ start: "09:00", end: "16:30" });
    expect(parsed.planning).toEqual({ rollover: "ask", defaultDurationMinutes: 30, defaultEnergy: "high" });
    expect(parsed.weeklyReview).toEqual({ weekday: 4, time: "17:00" });
    expect(parsed.focus).toEqual({ ...custom.focus, focusMinutes: 25 });
    expect(parsed.privacy).toEqual(DEFAULT_PLANNER_SETTINGS.privacy);
    expect(parsed.week).toEqual({ ...custom.week, workDays: IRAN_WEEK.workDays });
  });

  it("pins the version and drops unknown keys", () => {
    const parsed = parsePlannerSettings({ ...custom, version: 7, extra: 1, modules: { ...custom.modules, overview: false } });
    expect(parsed.version).toBe(1);
    expect(parsed).not.toHaveProperty("extra");
    expect(parsed.modules).not.toHaveProperty("overview");
  });

  it("de-duplicates weekday lists", () => {
    expect(parsePlannerSettings({ week: { ...IRAN_WEEK, weekendDays: [5, 5] } }).week.weekendDays).toEqual([5]);
  });
});

describe("mergePlannerSettings", () => {
  it("merges one level deep and leaves the input untouched", () => {
    const next = mergePlannerSettings(DEFAULT_PLANNER_SETTINGS, { focus: { focusMinutes: 50 }, modules: { finance: false } });
    expect(next.focus).toEqual({ ...DEFAULT_PLANNER_SETTINGS.focus, focusMinutes: 50 });
    expect(next.modules).toEqual({ ...DEFAULT_PLANNER_SETTINGS.modules, finance: false });
    expect(DEFAULT_PLANNER_SETTINGS.modules.finance).toBe(true);
  });

  it("re-validates, so an invalid patch value cannot be stored", () => {
    const next = mergePlannerSettings(custom, { workHours: { start: "9am" as never } });
    expect(next.workHours).toEqual({ start: "09:00", end: "16:30" });
  });

  it("keeps a valid daily focus goal and falls back for an invalid one", () => {
    expect(mergePlannerSettings(custom, { focus: { dailyGoalMinutes: 300 } }).focus.dailyGoalMinutes).toBe(300);
    expect(mergePlannerSettings(custom, { focus: { dailyGoalMinutes: -5 } }).focus.dailyGoalMinutes).toBe(240);
    expect(parsePlannerSettings({ focus: { focusMinutes: 50 } }).focus.dailyGoalMinutes).toBe(240);
  });
});

describe("module visibility", () => {
  const allHidden = parsePlannerSettings({ modules: Object.fromEntries(optionalModuleIds.map((id) => [id, false])) });

  it("never hides a core module", () => {
    for (const id of ["overview", "myday", "tasks", "calendar", "inbox", "settings"] as const) {
      expect(isModuleVisible(allHidden, id), id).toBe(true);
    }
  });

  it("follows the settings for optional modules", () => {
    expect(isModuleVisible(custom, "finance")).toBe(false);
    expect(isModuleVisible(custom, "goals")).toBe(true);
    expect(isModuleVisible(allHidden, "braindump")).toBe(false);
  });

  it("lists the visible optional modules in registry order", () => {
    expect(visibleModuleIds(DEFAULT_PLANNER_SETTINGS)).toEqual([...optionalModuleIds]);
    expect(visibleModuleIds(custom)).toEqual(["goals", "habits", "insights", "braindump"]);
    expect(visibleModuleIds(allHidden)).toEqual([]);
  });
});

describe("planner settings cookie", () => {
  it("round-trips through the encoded value", () => {
    expect(parsePlannerSettingsCookie(serializePlannerSettings(custom))).toEqual(custom);
  });

  it("accepts an already-decoded value (Next's RequestCookies decode)", () => {
    expect(parsePlannerSettingsCookie(JSON.stringify(custom))).toEqual(custom);
  });

  it.each([undefined, null, "", "%E0%A4%A", "{not json", "null", "[]"])("falls back to defaults for %j", (raw) => {
    expect(parsePlannerSettingsCookie(raw)).toEqual(DEFAULT_PLANNER_SETTINGS);
  });

  it("builds a first-party, year-long, lax cookie well under the size limit", () => {
    const cookie = plannerSettingsCookieString(custom);
    expect(cookie.startsWith(`${PLANNER_SETTINGS_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie.length).toBeLessThan(2048);
  });
});

describe("createPlannerSettingsStore", () => {
  it("starts from the seeded value, merges patches and notifies subscribers", () => {
    const store = createPlannerSettingsStore(custom);
    expect(store.getSnapshot()).toBe(custom);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    const next = store.update({ planning: { rollover: "move-to-tomorrow" } });
    expect(next.planning).toEqual({ ...custom.planning, rollover: "move-to-tomorrow" });
    expect(store.getSnapshot()).toBe(next);
    store.replace(DEFAULT_PLANNER_SETTINGS);
    expect(store.getSnapshot()).toBe(DEFAULT_PLANNER_SETTINGS);
    expect(calls).toBe(2);
    unsubscribe();
    store.update({ privacy: { financeLock: true } });
    expect(calls).toBe(2);
  });

  it("keeps the opt-in Insights actions off by default and validates them field by field", () => {
    expect(DEFAULT_PLANNER_SETTINGS.insights).toEqual({ protectedFocus: null, estimateBuffers: {} });
    const on = mergePlannerSettings(DEFAULT_PLANNER_SETTINGS, {
      insights: { protectedFocus: { start: "09:00", end: "12:00" }, estimateBuffers: { design: 50 } },
    });
    expect(on.insights).toEqual({ protectedFocus: { start: "09:00", end: "12:00" }, estimateBuffers: { design: 50 } });
    expect(on.planning).toEqual(DEFAULT_PLANNER_SETTINGS.planning);
    const bad = parsePlannerSettings({ ...on, insights: { protectedFocus: "always", estimateBuffers: { design: -5 } } });
    expect(bad.insights).toEqual({ protectedFocus: null, estimateBuffers: {} });
    expect(parsePlannerSettings({ ...on, insights: 3 }).insights).toEqual(DEFAULT_PLANNER_SETTINGS.insights);
  });
});

describe("Insights opt-ins", () => {
  it("saves and removes the protected window and the estimate buffer", () => {
    const on = mergePlannerSettings(DEFAULT_PLANNER_SETTINGS, {
      insights: { protectedFocus: { start: "09:00", end: "12:00" }, estimateBuffers: { design: 50 } },
    });
    expect(on.insights).toEqual({ protectedFocus: { start: "09:00", end: "12:00" }, estimateBuffers: { design: 50 } });
    const off = mergePlannerSettings(on, { insights: { protectedFocus: null, estimateBuffers: {} } });
    expect(off.insights).toEqual(DEFAULT_PLANNER_SETTINGS.insights);
    // Old cookies without the group still parse to the neutral defaults.
    const old: Partial<PlannerSettings> = { ...on };
    delete old.insights;
    expect(parsePlannerSettings(old).insights).toEqual({ protectedFocus: null, estimateBuffers: {} });
  });

  it("planning duration: raw × buffer for a matching tag, raw otherwise", () => {
    const buffers = { design: 50 };
    expect(planningDurationMinutes(60, ["Design"], buffers)).toBe(90);
    expect(planningDurationMinutes(25, ["design"], buffers)).toBe(40);
    expect(planningDurationMinutes(60, ["admin", null, undefined], buffers)).toBe(60);
    expect(planningDurationMinutes(60, ["constructor"], buffers)).toBe(60);
    expect(planningDurationMinutes(60, ["design"], {})).toBe(60);
  });
});
