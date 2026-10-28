import { describe, expect, it } from "vitest";
import type { DayBlock } from "@/features/my-day/domain/day-blocks";
import { calendarFromParam, searchWithCalendarState, viewFromParam } from "./calendar-params";
import { layerCounts, parseHiddenLayers, toggleLayer, visibleBlocks } from "./layers";
import { agendaDays, monthCells, moveInGrid } from "./month-cells";
import { monthGridOf, rangeDays, shiftAnchor, visibleWeekDays, weekColumnsFor, weekDays, weekWorkMinutes } from "./navigation";

const TUESDAY = "2026-10-13"; // Tue 21 Mehr 1405

function block(id: string, startMinutes: number, scope: DayBlock["scope"] = "personal"): DayBlock {
  return {
    id,
    title: id,
    scope,
    kind: "event",
    done: false,
    energy: null,
    priority: null,
    startMinutes,
    endMinutes: startMinutes + 60,
    durationMinutes: 60,
  };
}

describe("calendar params", () => {
  it("reads the view and calendar with safe defaults", () => {
    expect(viewFromParam("month")).toBe("month");
    expect(viewFromParam("year")).toBe("week");
    expect(viewFromParam(null)).toBe("week");
    expect(calendarFromParam("gregorian", "jalali")).toBe("gregorian");
    expect(calendarFromParam("shamsi", "gregorian")).toBe("jalali");
    expect(calendarFromParam("x", "jalali")).toBe("jalali");
  });

  it("writes only what differs from the defaults and keeps other params", () => {
    const defaults = { today: TUESDAY, calendar: "jalali" as const };
    expect(searchWithCalendarState("sheet=quick-add", { day: TUESDAY, view: "week", calendar: "jalali" }, defaults)).toBe(
      "sheet=quick-add",
    );
    const search = new URLSearchParams(
      searchWithCalendarState("", { day: "2026-10-14", view: "agenda", calendar: "gregorian" }, defaults),
    );
    expect(search.get("date")).toBe("1405-07-22");
    expect(search.get("view")).toBe("agenda");
    expect(search.get("cal")).toBe("gregorian");
  });
});

describe("calendar navigation", () => {
  it("builds a Saturday-first week", () => {
    expect(weekDays(TUESDAY)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
  });

  it("loads the Jalali month grid of Mehr 1405 (1 Mehr is a Wednesday)", () => {
    const days = rangeDays("month", TUESDAY, "jalali");
    expect(days[0]).toBe("2026-09-19");
    expect(days).toHaveLength(35);
    expect(monthGridOf(TUESDAY, "jalali")[0]![4]).toMatchObject({ dayOfMonth: 1, inMonth: true });
    expect(rangeDays("agenda", TUESDAY, "jalali")).toHaveLength(14);
  });

  it("moves by the view's unit", () => {
    expect(shiftAnchor("day", TUESDAY, -1, "jalali")).toBe("2026-10-12");
    expect(shiftAnchor("week", TUESDAY, 1, "jalali")).toBe("2026-10-20");
    expect(shiftAnchor("agenda", TUESDAY, 1, "jalali")).toBe("2026-10-27");
    expect(shiftAnchor("month", TUESDAY, 1, "jalali")).toBe("2026-11-12"); // 21 Aban
    expect(shiftAnchor("month", TUESDAY, 1, "gregorian")).toBe("2026-11-13");
  });

  it("drops to three columns when a week column would be under 96px", () => {
    expect(weekColumnsFor(800, true)).toBe(7);
    expect(weekColumnsFor(600, true)).toBe(3);
    expect(weekColumnsFor(600, false)).toBe(1);
    const week = weekDays(TUESDAY);
    expect(visibleWeekDays(week, TUESDAY, 3)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
    expect(visibleWeekDays(week, "2026-10-16", 3)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it("counts a free week as its full work days (Sat–Wed)", () => {
    expect(weekWorkMinutes(weekDays(TUESDAY), 8 * 60)).toBe(40 * 60);
  });
});

describe("month cells and agenda", () => {
  it("shows at most two chips plus a +N, in start order", () => {
    const blocks = new Map([[TUESDAY, [block("c", 900), block("a", 540), block("b", 600), block("d", 1000)]]]);
    const cells = monthCells(monthGridOf(TUESDAY, "jalali"), blocks, TUESDAY).flat();
    const tuesday = cells.find((cell) => cell.day === TUESDAY)!;
    expect(tuesday.isToday).toBe(true);
    expect(tuesday.chips.map((chip) => chip.id)).toEqual(["a", "b"]);
    expect(tuesday.overflow).toBe(2);
    expect(cells[0]).toMatchObject({ inMonth: false, total: 0 });
  });

  it("lists only days with blocks", () => {
    const result = agendaDays(["2026-10-13", "2026-10-14"], new Map([["2026-10-14", [block("x", 600)]]]));
    expect(result).toEqual([{ day: "2026-10-14", blocks: [block("x", 600)] }]);
  });

  it("moves the grid focus with direction-aware arrows", () => {
    expect(moveInGrid(3, "ArrowRight", 35, false)).toBe(4);
    expect(moveInGrid(3, "ArrowRight", 35, true)).toBe(2);
    expect(moveInGrid(3, "ArrowDown", 35, false)).toBe(10);
    expect(moveInGrid(9, "Home", 35, false)).toBe(7);
    expect(moveInGrid(9, "End", 35, false)).toBe(13);
    expect(moveInGrid(33, "ArrowDown", 35, false)).toBe(34);
    expect(moveInGrid(3, "Enter", 35, false)).toBeNull();
  });
});

describe("layers", () => {
  it("never hides Personal and filters the rest", () => {
    expect(toggleLayer(new Set(), "personal").size).toBe(0);
    const hidden = toggleLayer(new Set(), "team");
    expect([...hidden]).toEqual(["team"]);
    expect(toggleLayer(hidden, "team").size).toBe(0);
    const blocks = [block("p", 0), block("t", 60, "team")];
    expect(visibleBlocks(blocks, hidden).map((item) => item.id)).toEqual(["p"]);
    expect(layerCounts(blocks)).toEqual({ personal: 1, project: 0, team: 1, company: 0 });
  });

  it("parses stored layers defensively", () => {
    expect([...parseHiddenLayers('["team","personal","nope"]')]).toEqual(["team"]);
    expect(parseHiddenLayers("{oops").size).toBe(0);
    expect(parseHiddenLayers(null).size).toBe(0);
  });
});
