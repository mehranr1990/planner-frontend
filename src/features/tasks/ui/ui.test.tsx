import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Providers } from "@/app/providers";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { preferencesForLocale, type Preferences } from "@/features/preferences/preferences-store";
import { testPreferences } from "@/test/render";
import { groupTasks } from "../domain/group";
import { taskWhen } from "../domain/when";
import { personalFixtures } from "@/fixtures/personal";
import { sortTasks, filterTasks } from "@/data/task-query";
import { filterChips } from "../domain/filters";
import { useFilterChipText } from "./use-filter-chip-text";
import { PRIORITY_STYLE, priorityStyle } from "./priority-style";
import { createTasksBaseFormat, useTasksFormat } from "./use-tasks-format";

function format(preferences: Partial<Preferences> = {}) {
  return renderHook(() => useTasksFormat(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Providers preferences={{ ...testPreferences, ...preferences }} plannerSettings={DEFAULT_PLANNER_SETTINGS}>
        {children}
      </Providers>
    ),
  }).result.current;
}

const FA: Partial<Preferences> = { ...preferencesForLocale("fa"), currency: "toman" };
const TODAY = "2026-10-13";

describe("tasks format (English, Jalali calendar)", () => {
  const f = format({ calendar: "jalali" });

  it("prints durations as the board does", () => {
    expect(f.duration(185)).toBe("3h 05m");
    expect(f.duration(235)).toBe("3h 55m");
    expect(f.durationShort(125)).toBe("2h 05m");
    expect(f.duration(35)).toBe("35m");
  });

  it("prints Jalali date headers: Wed 22 Mehr, and the weekday names", () => {
    expect(f.dateHeader("2026-10-14")).toBe("Wed 22 Mehr");
    expect(f.dateHeader("2026-10-16")).toBe("Fri 24 Mehr");
    expect(f.weekdayShort("2026-10-15")).toBe("Thu");
    expect(f.weekday("2026-10-15")).toBe("Thursday");
  });

  it("names relative days and labels", () => {
    expect(f.relative("yesterday")).toBe("Yesterday");
    expect(f.relative("tomorrow")).toBe("Tomorrow");
    expect(f.priority("urgent")).toBe("Urgent");
    expect(f.priority(null)).toBe("No priority");
    expect(f.energy("medium")).toBe("Medium");
    expect(f.scope("project")).toBe("Projects");
  });

  it("says the When column in words", () => {
    expect(f.when({ kind: "time", time: "09:00" })).toEqual({ text: "09:00", overdue: false });
    expect(f.when({ kind: "relative", relative: "yesterday", tone: "overdue" })).toEqual({ text: "Yesterday", overdue: true });
    expect(f.when({ kind: "weekday", day: "2026-10-15" })).toEqual({ text: "Thu", overdue: false });
    expect(f.when({ kind: "date", day: "2026-11-20" }).text).toBe("29 Aban");
    expect(f.when({ kind: "none" })).toEqual({ text: "", overdue: false });
    const task = personalFixtures.tasks.find((item) => item.id === "t-pay-electricity-bill")!;
    expect(f.when(taskWhen(task, { day: TODAY }))).toEqual({ text: "Yesterday", overdue: true });
  });

  it("titles the groups: windows, Tomorrow · Wed 22 Mehr, weekend, areas, priorities", () => {
    const upcoming = sortTasks(filterTasks(personalFixtures.tasks, { view: "upcoming", day: TODAY }, { today: TODAY }), "smart", TODAY);
    const dates = groupTasks(upcoming, { mode: "date", day: TODAY, weekendMarkers: true });
    expect(dates.map((group) => f.groupTitle(group))).toEqual([
      { title: "Tomorrow", subtitle: "Wed 22 Mehr", weekend: false },
      { title: "Thu 23 Mehr", weekend: false },
      { title: "Fri 24 Mehr", weekend: true },
      { title: "Sat 25 Mehr", weekend: false },
    ]);
    const today = filterTasks(personalFixtures.tasks, { view: "today", day: TODAY }, { today: TODAY });
    expect(groupTasks(today, { mode: "time", day: TODAY }).map((group) => f.groupTitle(group).title)).toEqual([
      "Overdue",
      "Morning",
      "Afternoon",
      "Evening",
      "Unscheduled",
    ]);
    const all = groupTasks(personalFixtures.tasks, { mode: "area", day: TODAY });
    expect(all.map((group) => f.groupTitle(group).title)).toContain("Projects");
    expect(f.groupTitle(groupTasks(personalFixtures.tasks, { mode: "priority", day: TODAY }).at(-1)!).title).toBe("No priority");
    expect(f.groupTitle(groupTasks(personalFixtures.tasks, { mode: "none", day: TODAY })[0]!).title).toBe("All tasks");
  });
});

describe("tasks format (Persian)", () => {
  const f = format(FA);

  it("uses Persian digits, compact durations and full weekday names", () => {
    expect(f.durationShort(125)).toBe("۲س ۵د");
    expect(f.durationShort(30)).toBe("۳۰د");
    expect(f.durationShort(120)).toBe("۲س");
    expect(f.duration(125)).toBe("۲ ساعت و ۵ دقیقه");
    expect(f.dateHeader("2026-10-14")).toBe("چهارشنبه ۲۲ مهر");
    expect(f.weekdayShort("2026-10-15")).toBe("پنج‌شنبه");
    expect(f.clock("09:00")).toBe("۰۹:۰۰");
  });

  it("translates labels and group titles", () => {
    expect(f.relative("tomorrow")).toBe("فردا");
    expect(f.priority("high")).toBe("بالا");
    expect(f.priority(null)).toBe("بدون اولویت");
    const week = groupTasks(
      filterTasks(personalFixtures.tasks, { view: "today", day: TODAY }, { today: TODAY }),
      { mode: "time", day: TODAY },
    );
    expect(week.map((group) => f.groupTitle(group).title)).toEqual(["عقب‌افتاده", "صبح", "بعدازظهر", "عصر", "بدون زمان"]);
  });

  it("keeps Latin digits when the digit setting says so", () => {
    const latin = format({ ...FA, digits: "latn" });
    expect(latin.durationShort(125)).toBe("2س 5د");
    expect(latin.dateHeader("2026-10-14")).toBe("چهارشنبه 22 مهر");
  });
});

describe("createTasksBaseFormat", () => {
  it("follows the calendar setting for the date header", () => {
    const gregorian = createTasksBaseFormat({ locale: "en", digits: "latn", calendar: "gregorian" });
    expect(gregorian.dateHeader("2026-10-14")).toBe("Wed 14 Oct");
  });
});

describe("priority style", () => {
  it("has a dot, label and chip for every priority and for none, all from tokens", () => {
    for (const key of ["urgent", "high", "medium", "low", "none"] as const) {
      const style = PRIORITY_STYLE[key];
      expect(style.dot).toMatch(/^bg-/);
      expect(style.label).toMatch(/^text-/);
      expect(style.chip).toMatch(/bg-.* text-/);
      expect(`${style.dot} ${style.label} ${style.chip}`).not.toMatch(/#|black|opacity|\/\d/);
    }
    expect(priorityStyle(null)).toBe(PRIORITY_STYLE.none);
    expect(priorityStyle("urgent").label).toBe("text-danger-text");
  });
});

describe("filter chip text", () => {
  const chips = (preferences: Partial<Preferences> = {}) =>
    renderHook(() => useFilterChipText(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Providers preferences={{ ...testPreferences, ...preferences }} plannerSettings={DEFAULT_PLANNER_SETTINGS}>
          {children}
        </Providers>
      ),
    });

  it("reads like the board: Area: Personal, Health · Energy: Low–Medium", async () => {
    const { result } = chips();
    await waitFor(() => expect(result.current.value("area", "health")).toBe("Health"));
    const [area, energy] = filterChips({ areaIds: ["personal", "health"], energies: ["low", "medium"] });
    expect(result.current.chip(area!)).toBe("Area: Health, Personal");
    expect(result.current.chip(energy!)).toBe("Energy: Low–Medium");
  });

  it("names flags without a prefix, and the other kinds", async () => {
    const { result } = chips();
    const [hasDate, recurring] = filterChips({ hasDate: true, recurring: true });
    expect(result.current.chip(hasDate!)).toBe("Has date");
    expect(result.current.chip(recurring!)).toBe("Recurring");
    expect(result.current.chip(filterChips({ hasDate: false })[0]!)).toBe("No date");
    expect(result.current.chip(filterChips({ priorities: ["urgent", "high"], scopes: ["project"] })[0]!)).toBe("Context: Projects");
    expect(result.current.kind("labels")).toBe("Labels");
  });

  it("speaks Persian with the Persian comma and range word", () => {
    const { result } = chips(FA);
    expect(result.current.chip(filterChips({ energies: ["low", "medium"] })[0]!)).toBe("انرژی: کم تا متوسط");
    expect(result.current.chip(filterChips({ priorities: ["urgent", "high"] })[0]!)).toBe("اولویت: فوری، بالا");
  });
});
