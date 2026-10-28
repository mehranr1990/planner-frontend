import { describe, expect, it } from "vitest";
import {
  allSelected,
  clearSelection,
  EMPTY_SELECTION,
  isSelected,
  pruneSelection,
  select,
  selectAll,
  selectionSize,
  selectRange,
  toggle,
} from "./selection";

const visible = ["a", "b", "c", "d", "e"];

describe("selection", () => {
  it("toggles ids on and off and tracks the anchor", () => {
    const one = toggle(EMPTY_SELECTION, "b");
    expect(one).toEqual({ ids: ["b"], anchor: "b" });
    const two = toggle(one, "d");
    expect(two).toEqual({ ids: ["b", "d"], anchor: "d" });
    expect(isSelected(two, "b")).toBe(true);
    expect(toggle(two, "d")).toEqual({ ids: ["b"], anchor: "b" });
    expect(toggle(one, "b")).toEqual(EMPTY_SELECTION);
    expect(selectionSize(two)).toBe(2);
  });

  it("⇧ selects the range between the anchor and the row, either direction, keeping the anchor", () => {
    const start = toggle(EMPTY_SELECTION, "b");
    expect(selectRange(start, "d", visible).ids).toEqual(["b", "c", "d"]);
    expect(selectRange(toggle(EMPTY_SELECTION, "d"), "b", visible).ids).toEqual(["d", "b", "c"]);
    const stretched = selectRange(selectRange(start, "c", visible), "e", visible);
    expect(stretched.ids).toEqual(["b", "c", "d", "e"]);
    expect(stretched.anchor).toBe("b");
  });

  it("⇧ with no anchor, or an anchor that is not visible, selects the row alone; unknown rows do nothing", () => {
    expect(selectRange(EMPTY_SELECTION, "c", visible)).toEqual({ ids: ["c"], anchor: "c" });
    expect(selectRange({ ids: ["x"], anchor: "x" }, "c", visible).ids).toEqual(["x", "c"]);
    expect(selectRange(EMPTY_SELECTION, "zzz", visible)).toBe(EMPTY_SELECTION);
  });

  it("the pointer rule: ⇧ ranges, everything else toggles", () => {
    const first = select(EMPTY_SELECTION, "a", visible, {});
    expect(select(first, "c", visible, { shiftKey: true }).ids).toEqual(["a", "b", "c"]);
    expect(select(first, "c", visible, { metaKey: true }).ids).toEqual(["a", "c"]);
    expect(select(first, "c", visible, { ctrlKey: true }).ids).toEqual(["a", "c"]);
  });

  it("⌘A adds a whole group", () => {
    const some = toggle(EMPTY_SELECTION, "b");
    const all = selectAll(some, ["a", "b", "c"]);
    expect(all.ids).toEqual(["b", "a", "c"]);
    expect(allSelected(all, ["a", "b", "c"])).toBe(true);
    expect(allSelected(all, [])).toBe(false);
    expect(selectAll(all, ["a", "c"])).toBe(all);
  });

  it("clears, and prunes ids that left the data", () => {
    const state = selectAll(EMPTY_SELECTION, ["a", "b", "c"]);
    expect(clearSelection(state)).toBe(EMPTY_SELECTION);
    expect(clearSelection(EMPTY_SELECTION)).toBe(EMPTY_SELECTION);
    expect(pruneSelection(state, new Set(["a", "b", "c", "d"]))).toBe(state);
    expect(pruneSelection(state, ["a", "c"]).ids).toEqual(["a", "c"]);
    expect(pruneSelection(state, ["a", "c"]).anchor).toBe("c");
    expect(pruneSelection(state, [])).toBe(EMPTY_SELECTION);
  });
});
