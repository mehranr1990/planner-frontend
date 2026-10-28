import { describe, expect, it } from "vitest";
import { draftFromParams, safeReturnPath, splitLabels, suggestedStarts, taskCreateHref } from "./create-draft";

const DEFAULTS = { durationMinutes: 30, energy: "medium" } as const;

describe("task create draft", () => {
  it("round-trips a Quick Add draft through the URL", () => {
    const href = taskCreateHref(
      { title: "Call mom", date: "2026-10-14", time: "18:00", durationMinutes: 15, priority: "high", areaId: "a1" },
      "/personal/my-day",
    );
    const params = new URL(href, "http://x").searchParams;
    expect(draftFromParams(params, DEFAULTS)).toEqual({
      title: "Call mom",
      scope: "personal",
      date: "2026-10-14",
      time: "18:00",
      durationMinutes: 15,
      priority: "high",
      energy: "medium",
      areaId: "a1",
    });
    expect(params.get("from")).toBe("/personal/my-day");
  });

  it("drops invalid values and falls back to the planner defaults", () => {
    const params = new URLSearchParams("date=nope&time=18:00&duration=-5&priority=max&scope=x");
    expect(draftFromParams(params, DEFAULTS)).toMatchObject({ date: null, time: null, durationMinutes: 30, priority: null, scope: "personal" });
  });

  it("only returns to Personal paths", () => {
    expect(safeReturnPath("/personal/tasks?view=board")).toBe("/personal/tasks?view=board");
    expect(safeReturnPath("https://evil.example")).toBeNull();
    expect(safeReturnPath("//evil.example")).toBeNull();
  });
});

describe("Schedule panel suggestions", () => {
  const work = { startMinutes: 540, endMinutes: 1020 };

  it("splits labels on Latin and Persian commas", () => {
    expect(splitLabels(" design, ui ،  ,x")).toEqual(["design", "ui", "x"]);
  });

  it("fits the 1.5× planning estimate, not the raw one", () => {
    const busy = [{ startMinutes: 600, endMinutes: 660 }, { startMinutes: 720, endMinutes: 780 }];
    // Raw 60m fits 09:00 and 11:00; planned as 90m, the 11:00 gap (60m) is too short.
    expect(suggestedStarts(busy, 540, 60, work)).toEqual([540, 660]);
    expect(suggestedStarts(busy, 540, 90, work)).toEqual([780, 870]);
  });

  it("keeps clear of the protected window when it can", () => {
    expect(suggestedStarts([], 540, 60, work, { startMinutes: 540, endMinutes: 720 })).toEqual([720, 780]);
  });
});
