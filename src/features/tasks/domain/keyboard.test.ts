import { describe, expect, it } from "vitest";
import { isTypingTarget, nextFocusIndex, resolveShortcut, type KeyEventLike } from "./keyboard";

const idle = { typing: false };
const key = (event: Partial<KeyEventLike> & { key: string }) => resolveShortcut(event, idle);

describe("resolveShortcut", () => {
  it("maps the board's keys", () => {
    expect(key({ key: "n", code: "KeyN" })).toEqual({ type: "new" });
    expect(key({ key: "/", code: "Slash" })).toEqual({ type: "search" });
    expect(key({ key: "j", code: "KeyJ" })).toEqual({ type: "move", delta: 1 });
    expect(key({ key: "k", code: "KeyK" })).toEqual({ type: "move", delta: -1 });
    expect(key({ key: "x", code: "KeyX" })).toEqual({ type: "select" });
    expect(key({ key: "e", code: "KeyE" })).toEqual({ type: "edit" });
    expect(key({ key: "d", code: "KeyD" })).toEqual({ type: "date" });
    expect(key({ key: "s", code: "KeyS" })).toEqual({ type: "schedule" });
    expect(key({ key: "b", code: "KeyB" })).toEqual({ type: "toggle-layout" });
    expect(key({ key: " ", code: "Space" })).toEqual({ type: "open-detail" });
    expect(key({ key: "ArrowDown" })).toEqual({ type: "move", delta: 1 });
    expect(key({ key: "ArrowUp" })).toEqual({ type: "move", delta: -1 });
  });

  it("1 to 4 set urgent, high, medium, low", () => {
    expect(["1", "2", "3", "4"].map((digit) => key({ key: digit, code: `Digit${digit}` }))).toEqual([
      { type: "priority", priority: "urgent" },
      { type: "priority", priority: "high" },
      { type: "priority", priority: "medium" },
      { type: "priority", priority: "low" },
    ]);
    expect(key({ key: "5", code: "Digit5" })).toBeNull();
    // Persian digit keys still report the physical Digit code.
    expect(key({ key: "۲", code: "Digit2" })).toEqual({ type: "priority", priority: "high" });
  });

  it("reads the physical key so a Persian layout works", () => {
    expect(key({ key: "ی", code: "KeyN" })).toEqual({ type: "new" });
    expect(key({ key: "ا", code: "KeyJ" })).toEqual({ type: "move", delta: 1 });
  });

  it("⌘↵ completes, ⌘A selects the group, Esc clears only when something is selected", () => {
    expect(key({ key: "Enter", metaKey: true })).toEqual({ type: "complete" });
    expect(key({ key: "Enter", ctrlKey: true })).toEqual({ type: "complete" });
    expect(key({ key: "a", code: "KeyA", metaKey: true })).toEqual({ type: "select-all" });
    expect(key({ key: "a", code: "KeyA", ctrlKey: true })).toEqual({ type: "select-all" });
    expect(key({ key: "Escape" })).toBeNull();
    expect(resolveShortcut({ key: "Escape" }, { typing: false, hasSelection: true })).toEqual({ type: "clear" });
    expect(key({ key: "n", code: "KeyN", metaKey: true })).toBeNull();
  });

  it("stays out of the way while typing (⌘↵ still completes) and over overlays", () => {
    const typing = { typing: true };
    expect(resolveShortcut({ key: "n", code: "KeyN" }, typing)).toBeNull();
    expect(resolveShortcut({ key: " ", code: "Space" }, typing)).toBeNull();
    expect(resolveShortcut({ key: "Escape" }, { typing: true, hasSelection: true })).toBeNull();
    expect(resolveShortcut({ key: "Enter", metaKey: true }, typing)).toEqual({ type: "complete" });
    expect(resolveShortcut({ key: "n", code: "KeyN" }, { typing: false, overlayOpen: true })).toBeNull();
    expect(resolveShortcut({ key: "Enter", metaKey: true }, { typing: false, overlayOpen: true })).toBeNull();
  });

  it("ignores Alt and Shift chords and other keys", () => {
    expect(key({ key: "n", code: "KeyN", altKey: true })).toBeNull();
    expect(key({ key: "N", code: "KeyN", shiftKey: true })).toBeNull();
    expect(key({ key: "?", code: "Slash", shiftKey: true })).toBeNull();
    expect(key({ key: "q", code: "KeyQ" })).toBeNull();
    expect(key({ key: "Tab" })).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("is true for fields and editable text only", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("nextFocusIndex", () => {
  it("moves and clamps, entering from the right end", () => {
    expect(nextFocusIndex(0, 3, 1)).toBe(1);
    expect(nextFocusIndex(2, 3, 1)).toBe(2);
    expect(nextFocusIndex(0, 3, -1)).toBe(0);
    expect(nextFocusIndex(-1, 3, 1)).toBe(0);
    expect(nextFocusIndex(-1, 3, -1)).toBe(2);
    expect(nextFocusIndex(-1, 0, 1)).toBe(-1);
  });
});
