import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { addDismissal, dismissedFor, parseSlotDismissals, SLOT_DISMISSALS_KEY, useSlotDismissals } from "./slot-dismissals";

describe("slot dismissals", () => {
  it("keeps Later/Dismiss for the planner day only, Skip for good", () => {
    let state = parseSlotDismissals(null);
    state = addDismissal(state, "2026-10-24", "evening");
    state = addDismissal(state, "2026-10-24", "first-run");
    expect([...dismissedFor(state, "2026-10-24")].sort()).toEqual(["evening", "first-run"]);
    expect([...dismissedFor(state, "2026-10-25")]).toEqual(["first-run"]);
    // A new day starts a fresh list.
    expect(addDismissal(state, "2026-10-25", "morning").kinds).toEqual(["morning"]);
  });

  it("ignores corrupt or foreign values", () => {
    expect(parseSlotDismissals("{oops")).toEqual({ day: null, kinds: [], firstRunSkipped: false });
    expect(parseSlotDismissals(JSON.stringify({ day: 3, kinds: ["evening", "bogus"], firstRunSkipped: "yes" }))).toEqual({
      day: null,
      kinds: ["evening"],
      firstRunSkipped: false,
    });
  });

  it("persists through storage, so a reload keeps the choice", () => {
    const first = renderHook(() => useSlotDismissals("2026-10-24"));
    act(() => first.result.current[1]("morning"));
    expect(first.result.current[0].has("morning")).toBe(true);
    expect(window.localStorage.getItem(SLOT_DISMISSALS_KEY)).toContain("morning");
    first.unmount();
    const reloaded = renderHook(() => useSlotDismissals("2026-10-24"));
    expect(reloaded.result.current[0].has("morning")).toBe(true);
  });
});
