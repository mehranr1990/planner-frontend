import { describe, expect, it } from "vitest";
import { sheetIds } from "@/features/sheets/sheet-params";
import {
  coreModuleIds,
  isCoreModule,
  isOptionalModule,
  moduleForPathname,
  moduleForSheet,
  optionalModuleIds,
  PERSONAL_MODULES,
  personalModuleHref,
  SHEET_MODULE,
} from "./modules";

describe("PERSONAL_MODULES", () => {
  it("lists every core and optional module exactly once", () => {
    const ids = PERSONAL_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...coreModuleIds, ...optionalModuleIds].sort());
  });

  it("marks Overview, My Day, Tasks, Calendar, Inbox and Settings as core (P00)", () => {
    const core = PERSONAL_MODULES.filter((module) => module.kind === "core").map((module) => module.id);
    expect(core.sort()).toEqual(["calendar", "inbox", "myday", "overview", "settings", "tasks"]);
  });

  it("keeps kind in step with the id lists", () => {
    for (const entry of PERSONAL_MODULES) {
      expect(isOptionalModule(entry.id), entry.id).toBe(entry.kind === "optional");
      expect(isCoreModule(entry.id), entry.id).toBe(entry.kind === "core");
    }
    expect(isOptionalModule("board")).toBe(false);
    expect(isOptionalModule(undefined)).toBe(false);
  });

  it("builds the P00 routes", () => {
    expect(personalModuleHref("overview")).toBe("/personal");
    expect(personalModuleHref("myday")).toBe("/personal/my-day");
    expect(personalModuleHref("braindump")).toBe("/personal/brain-dump");
    expect(personalModuleHref("settings")).toBe("/personal/settings");
  });
});

describe("moduleForPathname", () => {
  it.each([
    ["/personal", "overview"],
    ["/personal/", "overview"],
    ["/personal?sheet=quick-add", "overview"],
    ["/personal/my-day?date=1405-07-21", "myday"],
    ["/personal/tasks", "tasks"],
    ["/personal/tasks/9", "tasks"],
    ["/personal/tasks/create", "tasks"],
    ["/personal/goals/42", "goals"],
    ["/personal/brain-dump", "braindump"],
    ["/personal/insights#habits", "insights"],
    ["/personal/settings", "settings"],
  ])("%s -> %s", (pathname, id) => {
    expect(moduleForPathname(pathname)).toBe(id);
  });

  it.each([
    "/personal/focus",
    "/personal/shutdown",
    "/personal/review",
    "/personal/unknown",
    "/personalx",
    "/projects/board",
    "/",
    null,
    undefined,
  ])("%s -> null", (pathname) => {
    expect(moduleForPathname(pathname)).toBeNull();
  });
});

describe("sheet gating", () => {
  it("maps module sheets to their optional module", () => {
    expect(SHEET_MODULE).toEqual({ expense: "finance", habit: "habits", goal: "goals" });
    expect(moduleForSheet("expense")).toBe("finance");
    expect(moduleForSheet("quick-add")).toBeNull();
  });

  it("only names real sheet ids and optional modules", () => {
    for (const [sheet, owner] of Object.entries(SHEET_MODULE)) {
      expect(sheetIds).toContain(sheet);
      expect(isOptionalModule(owner)).toBe(true);
    }
  });
});
