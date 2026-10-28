import { describe, expect, it } from "vitest";
import { draftFromParams, safeReturnPath, taskCreateHref } from "./create-draft";

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
