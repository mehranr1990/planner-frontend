import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { SheetHost } from "./sheet-host";
import { sheetHref, sheetIds } from "./sheet-params";

function open(search: string, options?: Parameters<typeof renderWithProviders>[1]) {
  setMockPathname("/personal/tasks");
  setMockSearch(search);
  // The sheet reads the real query string when it closes.
  window.history.replaceState(null, "", `/personal/tasks?${search}`);
  return renderWithProviders(<SheetHost />, options);
}

describe("sheetHref", () => {
  it("adds or removes only the sheet parameter", () => {
    expect(sheetHref("/personal/tasks", "?view=board", "quick-add")).toBe("/personal/tasks?view=board&sheet=quick-add");
    expect(sheetHref("/personal/tasks", "?view=board&sheet=note", null)).toBe("/personal/tasks?view=board");
    expect(sheetHref("/personal", "?sheet=note", null)).toBe("/personal");
  });
});

describe("SheetHost (P18 container rule)", () => {
  it("renders nothing without a known ?sheet", () => {
    open("view=list");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    setMockSearch("sheet=unknown");
    renderWithProviders(<SheetHost />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["quick-add", "Universal Quick Add", "center"],
    ["expense", "Add expense", "center"],
    ["habit", "New habit", "end"],
    ["goal", "New goal", "end"],
    ["mood", "Mood check-in", "center"],
    ["reschedule", "Reschedule", "center"],
  ] as const)("?sheet=%s opens %s as a %s sheet", async (id, title, side) => {
    open(`sheet=${id}`);
    const dialog = await screen.findByRole("dialog", { name: title });
    expect(dialog).toHaveAttribute("data-sheet", id);
    expect(dialog).toHaveAttribute("data-side", side);
    expect(dialog.querySelector(`[data-sheet-placeholder="${id}"]`)).toBeInTheDocument();
  });

  it.each([
    ["note", "Quick note"],
    ["voice", "Voice capture"],
  ] as const)("?sheet=%s opens a non-modal floating panel", async (id, title) => {
    open(`sheet=${id}`);
    const panel = await screen.findByRole("dialog", { name: title });
    expect(panel).toHaveAttribute("data-sheet", id);
    expect(panel).not.toHaveAttribute("aria-modal", "true");
  });

  it("covers every sheet id", () => {
    expect([...sheetIds].sort()).toEqual(["expense", "goal", "habit", "mood", "note", "quick-add", "reschedule", "voice"]);
  });

  it("closing removes only the sheet parameter (Escape)", async () => {
    const user = userEvent.setup();
    open("view=board&sheet=quick-add");
    await screen.findByRole("dialog", { name: "Universal Quick Add" });
    await user.keyboard("{Escape}");
    expect(routerReplace).toHaveBeenCalledWith("/personal/tasks?view=board", { scroll: false });
  });

  it("gates the sheet of a hidden module with Module hidden · Turn on", async () => {
    open("sheet=expense", {
      plannerSettings: { ...DEFAULT_PLANNER_SETTINGS, modules: { ...DEFAULT_PLANNER_SETTINGS.modules, finance: false } },
    });
    const dialog = await screen.findByRole("dialog", { name: "Add expense" });
    expect(within(dialog).getByRole("button", { name: "Turn Finance on" })).toBeInTheDocument();
    expect(dialog.querySelector("[data-sheet-placeholder]")).toBeNull();
  });
});
