import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { preventDocumentNavigation } from "@/components/navigation/test-utils";
import { sampleNow, sampleProfile, sampleScheduleBlocks, sampleScheduleDate, sampleWorkspaces } from "@/fixtures/shell";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname } from "@/test/setup";
import { ShellFrame } from "./shell-frame";

preventDocumentNavigation();

function Frame({ children = <h1>Page</h1>, sample }: { children?: ReactNode; sample?: boolean }) {
  return (
    <ShellFrame
      workspaces={sampleWorkspaces}
      profile={sampleProfile}
      schedule={{ date: sampleScheduleDate, now: sampleNow, blocks: sampleScheduleBlocks }}
      sample={sample}
    >
      {children}
    </ShellFrame>
  );
}

function renderFrame(options?: Parameters<typeof renderWithProviders>[1], children?: ReactNode, sample?: boolean) {
  const result = renderWithProviders(<Frame sample={sample}>{children}</Frame>, options);
  const topBar = () => result.container.querySelector<HTMLElement>('[data-slot="top-bar"]')!;
  const mobileHeader = () => result.container.querySelector<HTMLElement>('[data-slot="mobile-header"]')!;
  const mobileNav = () => result.container.querySelector<HTMLElement>('[data-slot="mobile-nav"]')!;
  return { ...result, topBar, mobileHeader, mobileNav };
}

describe("ScopeBoundary", () => {
  it.each([
    ["/", "personal"],
    ["/personal", "personal"],
    ["/projects", "project"],
    ["/projects/board/42", "project"],
    ["/teams", "team"],
    ["/companies", "company"],
  ])("tints the shell for %s as %s", (pathname, scope) => {
    setMockPathname(pathname);
    const { container } = renderFrame();
    const boundary = container.querySelector('[data-slot="scope-boundary"]')!;
    expect(boundary).toHaveAttribute("data-scope", scope);
    expect(boundary.firstElementChild).toContainElement(screen.getByRole("main"));
  });
});

describe("desktop top bar", () => {
  it("renders every island with an accessible name", () => {
    setMockPathname("/personal");
    const { topBar } = renderFrame();
    const bar = within(topBar());
    expect(bar.getByRole("link", { name: "Planner home" })).toHaveAttribute("href", "/");
    const switcher = bar.getByRole("button", { name: /Switch context/ });
    expect(switcher).toHaveTextContent("Mehran");
    expect(switcher).toHaveAttribute("aria-expanded", "false");
    expect(bar.getByRole("region", { name: "Today's schedule" })).toBeInTheDocument();
    const actions = within(bar.getByRole("group", { name: "Quick actions" }));
    const search = actions.getByRole("button", { name: "Search and commands" });
    expect(search).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K");
    // Personal "+" is Universal Quick Add (P18 H), a sheet over the route.
    expect(actions.getByRole("button", { name: "Quick add" })).toHaveAttribute("aria-haspopup", "dialog");
    expect(actions.queryByRole("button", { name: "Quick create" })).not.toBeInTheDocument();
    expect(actions.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Personal navigation" })).toBeInTheDocument();
  });

  it("switches workspace: navigates to the context and remembers the choice", async () => {
    const user = userEvent.setup();
    setMockPathname("/personal");
    const { topBar, rerender } = renderFrame();
    await user.click(within(topBar()).getByRole("button", { name: /Switch context/ }));
    const panel = await screen.findByRole("dialog", { name: "Switch context" });
    await user.click(within(panel).getByRole("button", { name: /^Teams/ }));
    await user.click(within(panel).getByRole("button", { name: "Engineering" }));
    expect(routerPush).toHaveBeenCalledWith("/teams");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Switch context" })).not.toBeInTheDocument());

    setMockPathname("/teams");
    rerender(<Frame />);
    const trigger = within(topBar()).getByRole("button", { name: /Switch context/ });
    expect(trigger).toHaveTextContent("Teams");
    expect(trigger).toHaveTextContent("Engineering");
    // The mobile header follows the same choice.
    expect(screen.getAllByText("Engineering").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the notifications empty state without an unread badge", async () => {
    const user = userEvent.setup();
    const { topBar } = renderFrame();
    const bell = within(topBar()).getByRole("button", { name: "Notifications" });
    expect(bell.querySelector(".sr-only")).toBeNull();
    await user.click(bell);
    const popover = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(popover).getByRole("status")).toHaveTextContent("You’re all caught up");
  });

  it("Personal + opens Universal Quick Add through ?sheet=quick-add", async () => {
    const user = userEvent.setup();
    setMockPathname("/personal/tasks");
    const { topBar } = renderFrame();
    await user.click(within(topBar()).getByRole("button", { name: "Quick add" }));
    expect(routerPush).toHaveBeenCalledWith("/personal/tasks?sheet=quick-add", { scroll: false });
  });

  it("lists quick create entries, all disabled as coming soon (Projects)", async () => {
    const user = userEvent.setup();
    setMockPathname("/projects");
    const { topBar } = renderFrame();
    await user.click(within(topBar()).getByRole("button", { name: "Quick create" }));
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent?.replace("Coming soon", ""))).toEqual([
      "Task",
      "Event",
      "Expense",
      "Mood",
      "Habit",
      "Note",
    ]);
    for (const item of items) expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("has no Assistant on Personal (AI is out of scope)", () => {
    setMockPathname("/personal");
    renderFrame();
    expect(screen.queryByRole("button", { name: "Assistant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Assistant" })).not.toBeInTheDocument();
  });

  it("opens the assistant panel with the later-step notice (other contexts)", async () => {
    const user = userEvent.setup();
    setMockPathname("/projects");
    renderFrame();
    await user.click(screen.getByRole("button", { name: "Assistant" }));
    const panel = await screen.findByRole("dialog", { name: "Assistant" });
    expect(within(panel).getByRole("status")).toHaveTextContent("The assistant arrives in a later step");
    await user.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Assistant" })).toHaveFocus());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Assistant" })).not.toBeInTheDocument());
  });
});

describe("landmarks and sample data", () => {
  it("keeps the floating assistant inside a complementary landmark (other contexts)", () => {
    setMockPathname("/projects");
    renderFrame();
    const aside = screen.getByRole("complementary", { name: "Assistant" });
    expect(within(aside).getByRole("button", { name: "Assistant" })).toBeInTheDocument();
  });

  it("labels sample content in the schedule and the account menu", async () => {
    const user = userEvent.setup();
    const { topBar } = renderFrame(undefined, undefined, true);
    const schedule = within(topBar()).getByRole("region", { name: "Today's schedule" });
    expect(within(schedule).getByText("Sample data")).toBeInTheDocument();
    await user.click(within(topBar()).getByRole("button", { name: "Account menu" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Sample data")).toBeInTheDocument();
  });

  it("shows no sample label for real data", async () => {
    const user = userEvent.setup();
    const { topBar } = renderFrame();
    expect(within(topBar()).queryByText("Sample data")).not.toBeInTheDocument();
    await user.click(within(topBar()).getByRole("button", { name: "Account menu" }));
    expect(within(await screen.findByRole("menu")).queryByText("Sample data")).not.toBeInTheDocument();
  });
});

describe("profile menu", () => {
  async function openPreference(user: ReturnType<typeof userEvent.setup>, topBar: HTMLElement, name: RegExp) {
    if (screen.queryAllByRole("menu").length === 0) {
      await user.click(within(topBar).getByRole("button", { name: "Account menu" }));
    }
    const row = await screen.findByRole("menuitem", { name });
    row.focus();
    await user.keyboard(document.documentElement.dir === "rtl" ? "{ArrowLeft}" : "{ArrowRight}");
  }

  it("shows the sample profile and changes direction without changing language", async () => {
    const user = userEvent.setup();
    const { topBar } = renderFrame();
    await user.click(within(topBar()).getByRole("button", { name: "Account menu" }));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Mehran");
    expect(menu).toHaveTextContent("Euroly · Admin");

    await openPreference(user, topBar(), /^Direction/);
    const rtl = await screen.findByRole("menuitemradio", { name: "Right to left" });
    expect(rtl).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitemradio", { name: "Left to right" })).toHaveAttribute("aria-checked", "true");
    await user.click(rtl);

    await waitFor(() => expect(document.documentElement).toHaveAttribute("dir", "rtl"));
    expect(document.documentElement).toHaveAttribute("lang", "en");
    // The menu stays open and reflects the new value.
    expect(screen.getByRole("menuitemradio", { name: "Right to left" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitem", { name: /^Language/ })).toHaveTextContent("English");
  });

  it("is non-modal: the page is never aria-hidden, Escape closes and focus returns", async () => {
    const user = userEvent.setup();
    const { topBar, container } = renderFrame();
    const trigger = within(topBar()).getByRole("button", { name: "Account menu" });
    await user.click(trigger);
    await screen.findByRole("menu");
    // A modal menu would aria-hide the render root (the shell and its tabbable content).
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(document.querySelector("[data-aria-hidden]")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps quick create non-modal too (Projects)", async () => {
    const user = userEvent.setup();
    setMockPathname("/projects");
    const { topBar } = renderFrame();
    const trigger = within(topBar()).getByRole("button", { name: "Quick create" });
    await user.click(trigger);
    await screen.findByRole("menu");
    expect(document.querySelector("[data-aria-hidden]")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps a submenu open after a mouse pick, even if focus moves away right after", async () => {
    const user = userEvent.setup();
    const { topBar } = renderFrame();
    await openPreference(user, topBar(), /^Currency/);
    const rial = await screen.findByRole("menuitemradio", { name: "Rial" });
    await user.click(rial);
    expect(rial).toHaveAttribute("aria-checked", "true");
    // What a shifting layout does after the pick: focus lands on another row of the parent menu.
    act(() => screen.getByRole("menuitem", { name: /^Calendar/ }).focus());
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.getByRole("menuitemradio", { name: "Rial" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^Currency/ })).toHaveAttribute("aria-expanded", "true");

    // The keyboard still closes it straight away and returns to its row.
    screen.getByRole("menuitemradio", { name: "Rial" }).focus();
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(screen.queryByRole("menuitemradio", { name: "Rial" })).not.toBeInTheDocument());
    expect(screen.getByRole("menuitem", { name: /^Currency/ })).toHaveFocus();
  });

  it("changes language, digits and theme through radio items", async () => {
    const user = userEvent.setup();
    const { topBar } = renderFrame();

    await openPreference(user, topBar(), /^Digits/);
    await user.click(await screen.findByRole("menuitemradio", { name: "Persian ۱۲۳" }));
    expect(screen.getByRole("menuitemradio", { name: "Persian ۱۲۳" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement).toHaveAttribute("lang", "en");

    await openPreference(user, topBar(), /^Theme/);
    await user.click(await screen.findByRole("menuitemradio", { name: "Dark" }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

    await openPreference(user, topBar(), /^Language/);
    await user.click(await screen.findByRole("menuitemradio", { name: "فارسی" }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute("lang", "fa"));
    expect(await screen.findByRole("menuitemradio", { name: "فارسی" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("command palette", () => {
  it("opens with Ctrl+K, filters, and Enter navigates", async () => {
    const user = userEvent.setup();
    renderFrame();
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Search and commands" });
    const input = within(dialog).getByRole("combobox", { name: "Search pages" });
    await waitFor(() => expect(input).toHaveFocus());

    // Every context is listed; Personal pages are real, other contexts' planned pages are disabled.
    const listbox = within(dialog).getByRole("listbox");
    expect(within(listbox).getAllByRole("group")).toHaveLength(4);
    const personalGoals = within(listbox).getAllByRole("option", { name: /Goals/ })[0]!;
    expect(personalGoals).not.toHaveAttribute("aria-disabled");
    const board = within(listbox).getByRole("option", { name: /Board/ });
    expect(board).toHaveAttribute("aria-disabled", "true");
    expect(board).toHaveTextContent("Coming soon");

    await user.type(input, "teams");
    const options = within(dialog).getAllByRole("option");
    expect(options.every((option) => option.closest('[role="group"]')?.getAttribute("data-scope") === "team")).toBe(true);
    const active = document.getElementById(input.getAttribute("aria-activedescendant")!)!;
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveTextContent("Overview");

    await user.keyboard("{Enter}");
    expect(routerPush).toHaveBeenCalledWith("/teams");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search and commands" })).not.toBeInTheDocument());
  });

  it("moves the active option with the arrow keys and skips Enter on planned pages", async () => {
    const user = userEvent.setup();
    renderFrame();
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Search pages" });
    const activeText = () => document.getElementById(input.getAttribute("aria-activedescendant")!)!.textContent;
    // Personal leads with the Quick add action (⌘K → +), then its pages.
    expect(activeText()).toContain("Quick add");
    await user.keyboard("{ArrowDown}");
    expect(activeText()).toContain("Overview");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    // Wraps to the last page of the last context.
    expect(activeText()).toContain("Reports");
    // A planned page ignores Enter.
    await user.keyboard("{Enter}");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("shows the no-results state and announces the count once, after typing pauses", async () => {
    const user = userEvent.setup();
    renderFrame();
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox", { name: "Search pages" });
    const dialog = screen.getByRole("dialog", { name: "Search and commands" });
    // One live region, owned by the palette, silent until something is typed.
    const live = within(dialog).getByRole("status");
    expect(live).toHaveTextContent("");
    await user.type(input, "zzz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).getByText("No results for “zzz”")).toBeInTheDocument();
    // The no-results view is not a live region of its own.
    expect(within(dialog).getAllByRole("status")).toEqual([live]);
    await waitFor(() => expect(live).toHaveTextContent("No pages found"));

    await user.clear(input);
    await user.type(input, "teams");
    await waitFor(() => expect(live).toHaveTextContent(/^\d+ pages? found$/));
  });

  it("sends focus to the main content when nothing was focused before opening", async () => {
    const user = userEvent.setup();
    renderFrame();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("combobox", { name: "Search pages" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search and commands" })).not.toBeInTheDocument());
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("opens from the search button; Escape clears, then closes and returns focus", async () => {
    const user = userEvent.setup();
    const { topBar } = renderFrame();
    const search = within(topBar()).getByRole("button", { name: "Search and commands" });
    await user.click(search);
    const input = await screen.findByRole("combobox", { name: "Search pages" });
    expect(search).toHaveAttribute("aria-expanded", "true");
    await user.type(input, "pro");
    await user.keyboard("{Escape}");
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("dialog", { name: "Search and commands" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search and commands" })).not.toBeInTheDocument());
    expect(search).toHaveFocus();
  });

  it("leaves Ctrl+K alone while typing in another field", async () => {
    const user = userEvent.setup();
    renderFrame(undefined, <input aria-label="Notes" />);
    await user.click(screen.getByRole("textbox", { name: "Notes" }));
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog", { name: "Search and commands" })).not.toBeInTheDocument();
    // Other modifier combinations are never taken.
    await user.click(document.body);
    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    expect(screen.queryByRole("dialog", { name: "Search and commands" })).not.toBeInTheDocument();
  });
});

describe("mobile chrome", () => {
  it("renders the header: account, context and workspace, bell, chips", () => {
    setMockPathname("/projects");
    const { mobileHeader } = renderFrame();
    const header = within(mobileHeader());
    expect(header.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    const label = mobileHeader().querySelector("[data-slot=\"mobile-context\"]")!;
    expect(label.firstElementChild).toHaveTextContent("Projects");
    expect(label.lastElementChild).toHaveTextContent("Website Redesign");
    expect(header.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(header.getByRole("navigation", { name: "Contexts" })).toBeInTheDocument();
  });

  it("Personal More: the PM01 module grid, Finish day and Weekly review, no Assistant", async () => {
    const user = userEvent.setup();
    setMockPathname("/personal");
    const { mobileNav } = renderFrame();
    const more = within(mobileNav()).getByRole("button", { name: "More" });
    await user.click(more);
    const sheet = await screen.findByRole("dialog", { name: "Personal pages" });
    expect(more).toHaveAttribute("aria-expanded", "true");
    const grid = within(sheet).getByRole("list", { name: "Modules" });
    expect(within(grid).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/personal/goals",
      "/personal/habits",
      "/personal/finance",
      "/personal/journal",
      "/personal/insights",
      "/personal/inbox",
      "/personal/brain-dump",
      "/personal/settings",
    ]);
    expect(await within(grid).findByRole("link", { name: "Inbox, 6 to triage" })).toBeInTheDocument();
    const flows = within(sheet).getByRole("list", { name: "Day and week" });
    expect(within(flows).getByRole("link", { name: /Finish your day/ })).toHaveAttribute("href", "/personal/shutdown");
    // The sample week starts on Saturday 18 Mehr 1405 (10 Oct); the review day is Thursday.
    const review = within(flows).getByRole("link", { name: /Weekly review/ });
    expect(review).toHaveAttribute("href", "/personal/review/1405-07-18");
    expect(review).toHaveTextContent("Thursday");
    expect(within(sheet).queryByRole("button", { name: /Assistant/ })).not.toBeInTheDocument();
    await user.click(within(grid).getByRole("link", { name: "Goals" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Personal pages" })).not.toBeInTheDocument());
  });

  it("Personal More drops hidden modules", async () => {
    const user = userEvent.setup();
    setMockPathname("/personal");
    const { mobileNav } = renderFrame({
      plannerSettings: {
        ...DEFAULT_PLANNER_SETTINGS,
        modules: { ...DEFAULT_PLANNER_SETTINGS.modules, finance: false, braindump: false },
      },
    });
    await user.click(within(mobileNav()).getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "Personal pages" });
    const grid = within(sheet).getByRole("list", { name: "Modules" });
    expect(within(grid).queryByRole("link", { name: "Finance" })).not.toBeInTheDocument();
    expect(within(grid).queryByRole("link", { name: "Brain Dump" })).not.toBeInTheDocument();
    expect(within(grid).getAllByRole("link")).toHaveLength(6);
  });

  it("More opens the context's pages and closes on navigation (Projects)", async () => {
    const user = userEvent.setup();
    setMockPathname("/projects");
    const { mobileNav } = renderFrame();
    const more = within(mobileNav()).getByRole("button", { name: "More" });
    await user.click(more);
    const sheet = await screen.findByRole("dialog", { name: "Projects pages" });
    const list = within(sheet).getByRole("list", { name: "All Projects pages" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(within(sheet).getByRole("button", { name: /Assistant/ })).toBeInTheDocument();
    await user.click(within(list).getByRole("link", { name: "Overview" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Projects pages" })).not.toBeInTheDocument());
  });

  it("closes an open sheet when the pathname changes", async () => {
    const user = userEvent.setup();
    setMockPathname("/personal");
    const { mobileNav, rerender } = renderFrame();
    await user.click(within(mobileNav()).getByRole("button", { name: "More" }));
    await screen.findByRole("dialog", { name: "Personal pages" });
    setMockPathname("/projects");
    rerender(<Frame />);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Coming back does not reopen it.
    setMockPathname("/personal");
    rerender(<Frame />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the assistant sheet from More (other contexts)", async () => {
    const user = userEvent.setup();
    setMockPathname("/projects");
    const { mobileNav } = renderFrame();
    await user.click(within(mobileNav()).getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "Projects pages" });
    await user.click(within(sheet).getByRole("button", { name: /Assistant/ }));
    const assistant = await screen.findByRole("dialog", { name: "Assistant" });
    expect(within(assistant).getByRole("status")).toHaveTextContent("The assistant arrives in a later step");
  });

  it("Personal FAB: tap opens Quick Add, the context menu (long-press alternative) opens Voice", async () => {
    const user = userEvent.setup();
    setMockPathname("/personal");
    const { mobileNav } = renderFrame();
    const fab = within(mobileNav()).getByRole("button", { name: "Quick add" });
    expect(fab).toHaveAttribute("aria-haspopup", "dialog");
    expect(fab).toHaveAccessibleDescription(/voice capture/);
    await user.click(fab);
    expect(routerPush).toHaveBeenLastCalledWith("/personal?sheet=quick-add", { scroll: false });
    await user.pointer({ keys: "[MouseRight]", target: fab });
    expect(routerPush).toHaveBeenLastCalledWith("/personal?sheet=voice", { scroll: false });
  });

  it("the FAB opens Quick add with six disabled tiles (other contexts)", async () => {
    const user = userEvent.setup();
    setMockPathname("/projects");
    const { mobileNav } = renderFrame();
    const fab = within(mobileNav()).getByRole("button", { name: "Quick add" });
    expect(fab).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(fab);
    const sheet = await screen.findByRole("dialog", { name: "Quick add" });
    const tiles = within(sheet).getAllByRole("button", { name: /^(Task|Event|Expense|Mood|Habit|Note)$/ });
    expect(tiles).toHaveLength(6);
    for (const tile of tiles) {
      expect(tile).toHaveAttribute("aria-disabled", "true");
      expect(tile).toHaveAccessibleDescription("Coming soon");
    }
  });

  it("Personal header (PM01): account, Personal + name, bell; no chips, no digits toggle", () => {
    setMockPathname("/personal");
    const { mobileHeader } = renderFrame();
    const header = within(mobileHeader());
    expect(header.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(mobileHeader().querySelector('[data-slot="mobile-context"]')).toHaveTextContent("Personal");
    expect(header.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(header.queryByRole("navigation", { name: "Contexts" })).not.toBeInTheDocument();
    expect(header.queryByRole("button", { name: "Persian digits ۱۲۳" })).not.toBeInTheDocument();
  });

  it("toggles Persian digits from the header (other contexts)", async () => {
    const user = userEvent.setup();
    setMockPathname("/projects");
    const { mobileHeader } = renderFrame();
    const toggle = within(mobileHeader()).getByRole("button", { name: "Persian digits ۱۲۳" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    // The schedule follows the preference.
    expect(screen.getByRole("region", { name: "Today's schedule" })).toHaveTextContent("۱۴:۰۰ – ۱۶:۰۰");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("translates the mobile chrome in Persian", async () => {
    const user = userEvent.setup();
    setMockPathname("/teams");
    const { mobileHeader, mobileNav } = renderFrame({ preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    expect(mobileHeader().querySelector("[data-slot=\"mobile-context\"]")).toHaveTextContent("تیم‌هاDesign Team");
    await user.click(within(mobileNav()).getByRole("button", { name: "افزودن سریع" }));
    const sheet = await screen.findByRole("dialog", { name: "افزودن سریع" });
    expect(sheet).toHaveAttribute("dir", "rtl");
    expect(within(sheet).getByRole("button", { name: "یادداشت" })).toHaveAccessibleDescription("به‌زودی");
  });
});
