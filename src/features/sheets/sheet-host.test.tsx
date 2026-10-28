import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { resetToasts } from "@/components/ui/toast";
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
  it("?sheet=reschedule opens a compact centred sheet with a task picker when there is no target", async () => {
    const user = userEvent.setup();
    open("sheet=reschedule");
    const dialog = await screen.findByRole("dialog", { name: "Reschedule" });
    expect(dialog).toHaveAttribute("data-side", "center");
    const picker = await within(dialog).findByRole("list", { name: "Choose a task to reschedule" });
    await user.click(within(picker).getByRole("button", { name: "Pay electricity bill" }));
    expect(await within(dialog).findByRole("menu", { name: "Reschedule options" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Change task" })).toBeInTheDocument();
  });

  it("?sheet=reschedule&task=… shows the options; closing drops the target too", async () => {
    const user = userEvent.setup();
    open("view=board&sheet=reschedule&task=t-pay-electricity-bill");
    const dialog = await screen.findByRole("dialog", { name: "Reschedule" });
    expect(await within(dialog).findByRole("menu", { name: "Reschedule options" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(routerReplace).toHaveBeenCalledWith("/personal/tasks?view=board", { scroll: false });
  });

  it("Quick note asks for text, then saves as a note and closes", async () => {
    const user = userEvent.setup();
    open("sheet=note");
    const panel = await screen.findByRole("dialog", { name: "Quick note" });
    await user.click(within(panel).getByRole("button", { name: "Save" }));
    expect(within(panel).getByRole("alert")).toHaveTextContent("Write something first.");
    expect(within(panel).getByRole("radio", { name: "Save as note" })).toHaveAttribute("aria-checked", "true");
    await user.type(within(panel).getByRole("textbox", { name: "Note" }), "Ask Ali for the lease PDF");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/personal/tasks", { scroll: false }));
    expect(await screen.findByText("Saved as a note")).toBeInTheDocument();
    resetToasts();
  });

  it("Voice capture falls back to an error with “Type a note instead” where speech is unsupported", async () => {
    const user = userEvent.setup();
    open("sheet=voice");
    const panel = await screen.findByRole("dialog", { name: "Voice capture" });
    expect(await within(panel).findByRole("alert")).toHaveTextContent("isn’t supported");
    await user.click(within(panel).getByRole("button", { name: "Type a note instead" }));
    expect(routerReplace).toHaveBeenCalledWith("/personal/tasks?sheet=note", { scroll: false });
  });

  it("Voice capture records, pauses, finishes and hands the transcript to Quick Add", async () => {
    const user = userEvent.setup();
    const instances: FakeRecognition[] = [];
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        instances.push(this);
      }
      start() {}
      stop() {
        queueMicrotask(() => this.onend?.());
      }
      abort() {}
      say(text: string) {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
      }
    }
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    try {
      open("sheet=voice");
      const panel = await screen.findByRole("dialog", { name: "Voice capture" });
      await within(panel).findByText("Recording");
      expect(instances[0]?.lang).toBe("en-US");
      act(() => instances[0]!.say("Call mom tomorrow"));
      await user.click(within(panel).getByRole("button", { name: "Pause" }));
      expect(await within(panel).findByText("Paused")).toBeInTheDocument();
      await user.click(within(panel).getByRole("button", { name: "Done" }));
      const transcript = await within(panel).findByRole("textbox", { name: "Transcript" });
      expect(transcript).toHaveValue("Call mom tomorrow");
      await user.click(within(panel).getByRole("button", { name: "Create task" }));
      expect(routerReplace).toHaveBeenCalledWith("/personal/tasks?sheet=quick-add&text=Call+mom+tomorrow", { scroll: false });
    } finally {
      vi.unstubAllGlobals();
    }
  });

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
  ] as const)("?sheet=%s opens %s as a %s sheet", async (id, title, side) => {
    open(`sheet=${id}`);
    const dialog = await screen.findByRole("dialog", { name: title });
    expect(dialog).toHaveAttribute("data-sheet", id);
    expect(dialog).toHaveAttribute("data-side", side);
    // Quick Add has its real body (P18 · H); the rest are placeholders until their step.
    expect(dialog.querySelector(id === "quick-add" ? "[data-quick-add]" : id === "expense" ? "[data-expense-sheet]" : id === "goal" ? "[data-goal-sheet]" : id === "habit" ? "[data-habit-sheet]" : "[data-mood-check-in]")).toBeInTheDocument();
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

  it("Quick Add parses live and Ctrl+Enter escalates to Task Create with the parsed values", async () => {
    const user = userEvent.setup();
    open("view=board&sheet=quick-add");
    const dialog = await screen.findByRole("dialog", { name: "Universal Quick Add" });
    const input = within(dialog).getByRole("textbox", { name: "Capture one line" });
    expect(input).toHaveFocus();
    await user.type(input, "Call mom tomorrow 18:00 ~15m");
    expect(within(dialog).getByText("18:00")).toBeInTheDocument();
    await user.keyboard("{Control>}{Enter}{/Control}");
    const href = routerReplace.mock.calls.at(-1)![0] as string;
    const params = new URL(href, "http://x").searchParams;
    expect(href.startsWith("/personal/tasks/create?")).toBe(true);
    expect(Object.fromEntries(params)).toMatchObject({ title: "Call mom", time: "18:00", duration: "15", from: "/personal/tasks?view=board" });
  });

  it("Add expense parses the Quick Add line, saves through the seam and offers Undo", async () => {
    resetToasts();
    const user = userEvent.setup();
    const repositories = createMockRepositories();
    setMockPathname("/personal/tasks");
    setMockSearch("sheet=expense&text=250k+lunch+%23food");
    window.history.replaceState(null, "", "/personal/tasks?sheet=expense&text=250k+lunch+%23food");
    renderWithProviders(
      <DataProvider repositories={repositories}>
        <SheetHost />
      </DataProvider>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Add expense" });
    const amount = within(dialog).getByRole("textbox", { name: /Amount/ });
    expect(amount).toHaveValue("250,000");
    expect(within(dialog).getByText(/2,500,000 IRR/)).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "Food" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByRole("textbox", { name: "Note" })).toHaveValue("lunch");
    await user.click(within(dialog).getByRole("button", { name: "Delete last digit" }));
    await user.click(within(dialog).getByRole("button", { name: "0" }));
    await user.click(within(dialog).getByRole("button", { name: "Save expense" }));
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/personal/tasks", { scroll: false }));
    const month = await repositories.finance.month("2026-10-13");
    expect(month.spentToman).toBe(31_450_000);
  });

  it("Mood check-in saves mood, energy and a word on today's Journal entry", async () => {
    resetToasts();
    const user = userEvent.setup();
    const repositories = createMockRepositories();
    setMockPathname("/personal/tasks");
    setMockSearch("sheet=mood");
    window.history.replaceState(null, "", "/personal/tasks?sheet=mood");
    renderWithProviders(
      <DataProvider repositories={repositories}>
        <SheetHost />
      </DataProvider>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Mood check-in" });
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Great" }));
    await user.click(within(dialog).getByRole("radio", { name: "High" }));
    await user.type(within(dialog).getByRole("textbox", { name: /Add a word/ }), "Sunny");
    await user.click(save);
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/personal/tasks", { scroll: false }));
    expect(await repositories.journal.entry("2026-10-13")).toMatchObject({ mood: 5, energy: "high", text: "Sunny" });
  });

  it("Add expense asks for an amount and a category before saving", async () => {
    const user = userEvent.setup();
    open("sheet=expense");
    const dialog = await screen.findByRole("dialog", { name: "Add expense" });
    await user.click(within(dialog).getByRole("button", { name: "Save expense" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter an amount.");
    await user.click(within(dialog).getByRole("button", { name: "5" }));
    await user.click(within(dialog).getByRole("button", { name: "Save expense" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Pick a category.");
  });

  it("Quick Add drops the Expense type while Finance is hidden", async () => {
    open("sheet=quick-add", {
      plannerSettings: { ...DEFAULT_PLANNER_SETTINGS, modules: { ...DEFAULT_PLANNER_SETTINGS.modules, finance: false } },
    });
    const dialog = await screen.findByRole("dialog", { name: "Universal Quick Add" });
    const types = within(dialog).getByRole("radiogroup", { name: "Type" });
    expect(within(types).getAllByRole("radio").map((item) => item.textContent)).toEqual(["Task", "Event", "Note", "Inbox"]);
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
