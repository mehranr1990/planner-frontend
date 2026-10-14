import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ComponentsView } from "./components-view";

const SECTIONS = [
  "Text fields",
  "Select & multi-select",
  "Controls",
  "Date picker",
  "Radio group",
  "Toasts & alerts",
  "Button states",
  "Loading · empty · error",
  "Dialogs & sheets",
  "Form validation",
  "Menus & popovers",
  "More states",
  "Badges, avatars & dividers",
  "Signature cards",
  "Ring card",
  "Folder tabs",
  "Progress",
  "Tab families",
  "Product card",
  "Utility card",
  "Metric tiles",
];

// A full page of components: role queries over it are slow on a loaded machine.
describe("ComponentsView", { timeout: 30_000 }, () => {
  it("renders one page title and every component section", () => {
    renderWithProviders(<ComponentsView />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Components" })).toBeInTheDocument();
    for (const name of SECTIONS) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("marks the current page in the styleguide navigation", () => {
    renderWithProviders(<ComponentsView />);
    const nav = screen.getByRole("navigation", { name: "Styleguide pages" });
    expect(within(nav).getByRole("link", { name: "Components" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Foundations" })).toHaveAttribute("href", "/styleguide");
    expect(within(nav).getByRole("link", { name: "Foundations" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Navigation" })).toHaveAttribute("href", "/styleguide/navigation");
  });

  it("keeps the preview settings available", () => {
    renderWithProviders(<ComponentsView />);
    const controls = screen.getByRole("group", { name: "Preview settings" });
    expect(within(controls).getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(within(controls).getByRole("radiogroup", { name: "Currency" })).toBeInTheDocument();
  });

  it("opens a dialog from the overlays section and closes it with Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentsView />);
    const overlays = screen.getByRole("region", { name: "Dialogs & sheets" });
    const trigger = within(overlays).getByRole("button", { name: "Rename block" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Rename block" });
    expect(within(dialog).getByRole("textbox", { name: "Block name" })).toHaveValue("Deep work");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename block" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("demos the quick add sheet with the shell's quick create entries", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentsView />);
    const overlays = screen.getByRole("region", { name: "Dialogs & sheets" });
    await user.click(within(overlays).getByRole("button", { name: "Quick add" }));

    const sheet = await screen.findByRole("dialog", { name: "Quick add" });
    for (const name of ["Task", "Event", "Expense", "Mood", "Habit", "Note"]) {
      expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("documents the signature cards: one volt card, never an empty notch, one or two actions", () => {
    const { container } = renderWithProviders(<ComponentsView />);
    const cards = screen.getByRole("region", { name: "Signature cards" });
    // Volt marks live state only: one volt area on the whole page.
    expect(container.querySelectorAll("[data-slot=signature-surface].bg-volt")).toHaveLength(1);

    const now = within(cards).getByRole("article", { name: "Now: UI design" });
    expect(within(now).getAllByRole("button")).toHaveLength(1);
    expect(within(now).getByRole("button", { name: "Start focus" })).toBeInTheDocument();
    expect(now).toHaveTextContent("2:00 pm – 4:00 pm · 35m left");

    const insight = within(cards).getByRole("article", { name: "Insight" });
    // The Insight card holds its two real P01 actions in the double notch.
    expect(insight).toHaveAttribute("data-notch-actions", "2");
    expect(within(insight).getByRole("button", { name: "Stop showing this insight" })).toBeInTheDocument();
    expect(within(insight).getByRole("button", { name: "See pattern" })).toBeInTheDocument();
    expect(container.querySelector("[data-empty-notch]")).toBeNull();

    const goal = within(cards).getByRole("article", { name: "Selected goal: Launch Planner v1" });
    expect(within(goal).getByRole("button", { name: "Open goal" })).toBeInTheDocument();
    expect(goal).toHaveTextContent("64% · Beta on 11 Nov");

    // The board demos use the auto preset; the preset row shows each fixed preset.
    expect(now).toHaveAttribute("data-preset", "auto");
    for (const preset of ["desktop", "mobile", "focus"]) {
      expect(cards.querySelector(`[data-preset="${preset}"]`)).not.toBeNull();
    }
    expect(within(cards).getByText("64 × 64 notch · 28 fillet · 54 button")).toBeInTheDocument();
    // The compact preset stays retired; the double notch appears only where two real actions exist.
    expect(container.querySelector("[data-preset=compact]")).toBeNull();
    expect(cards.querySelectorAll("[data-preset=double]")).toHaveLength(1);
    expect(insight).toHaveAttribute("data-preset", "double");
  });

  it("shows product, utility and metric geometry without notches", () => {
    renderWithProviders(<ComponentsView />);
    const product = screen.getByRole("region", { name: "Product card" });
    expect(within(product).getByRole("article", { name: "Run 100 km this month" })).toHaveAttribute(
      "data-slot",
      "product-card",
    );
    expect(within(product).getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "41");

    const utility = screen.getByRole("region", { name: "Utility card" });
    expect(within(utility).getByText("Filter · Area")).toHaveAttribute("data-slot", "utility-field");

    const metrics = screen.getByRole("region", { name: "Metric tiles" });
    const family = within(metrics).getByRole("list", { name: "This week" });
    expect(within(family).getAllByRole("listitem")).toHaveLength(4);
    expect(family).toHaveTextContent("21h");
    expect(family).toHaveTextContent("+3h vs last week");
    for (const region of [product, utility, metrics]) {
      expect(region.querySelector("[data-slot=signature-surface]")).toBeNull();
    }
  });

  it("demos the four tab families with their selection rule", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentsView />);
    const tabs = screen.getByRole("region", { name: "Tab families" });
    for (const name of ["Planning range", "Layout", "Calendar", "Task filter", "Focus mode"]) {
      expect(within(tabs).getByRole("radiogroup", { name })).toBeInTheDocument();
    }
    expect(within(tabs).getByRole("radio", { name: "Overdue 1" })).toBeInTheDocument();
    const shortBreak = within(tabs).getByRole("radio", { name: "Short break" });
    await user.click(shortBreak);
    expect(shortBreak).toHaveAttribute("aria-checked", "true");
    expect(within(tabs).getByText("Do not use folder tabs for")).toBeInTheDocument();
    expect(within(tabs).getByText("Wizard steps → Stepper")).toBeInTheDocument();
  });

  it("switches folder tabs and the ring card's bottom tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentsView />);
    const folder = screen.getByRole("region", { name: "Folder tabs" });
    const tablist = within(folder).getByRole("tablist", { name: "Goal sections" });
    expect(within(tablist).getByRole("tab", { name: "Overview 72%" })).toHaveAttribute("aria-selected", "true");
    const summary = within(folder).getByRole("list", { name: "Goal summary" });
    expect(summary.querySelector("[data-tone=danger]")).toHaveTextContent("Blocked2");
    await user.click(within(tablist).getByRole("tab", { name: "Tasks 18" }));
    expect(within(folder).getByText("The goal’s 18 open tasks would be listed here.")).toBeInTheDocument();

    const ring = screen.getByRole("region", { name: "Ring card" });
    expect(within(ring).getByRole("heading", { name: "Read 30 pages" })).toBeInTheDocument();
    expect(within(ring).getByText("Completion · Mehr")).toBeInTheDocument();
    expect(within(ring).getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(within(ring).getByRole("button", { name: "Previous" }));
    expect(within(ring).getByText("Completion · Shahrivar")).toBeInTheDocument();
    await user.click(within(ring).getByRole("tab", { name: "Details" }));
    const details = within(ring).getByRole("tabpanel", { name: "Details" });
    expect(details).toHaveTextContent("FrequencyDaily");
    expect(details).toHaveTextContent("Best streak21 days");
  });

  it("opens each P18 container from a real button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentsView />);
    const overlays = screen.getByRole("region", { name: "Dialogs & sheets" });
    const cases = [
      { trigger: "New habit", attributes: { "data-side": "end", "data-size": "drawer" } },
      { trigger: "Task detail", attributes: { "data-side": "end", "data-size": "detail" } },
      { trigger: "Add expense", attributes: { "data-side": "center", "data-mobile-side": "bottom" } },
    ];
    for (const { trigger, attributes } of cases) {
      const button = within(overlays).getByRole("button", { name: trigger });
      await user.click(button);
      const panel = await screen.findByRole("dialog", { name: trigger });
      for (const [name, value] of Object.entries(attributes)) expect(panel).toHaveAttribute(name, value);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: trigger })).not.toBeInTheDocument());
      expect(button).toHaveFocus();
    }

    await user.click(within(overlays).getByRole("button", { name: "Quick note" }));
    const note = await screen.findByRole("dialog", { name: "Quick note" });
    expect(note).toHaveAttribute("data-floating-panel");
    expect(within(note).getByRole("textbox", { name: "Note" })).toBeInTheDocument();
  });

  it("retints the previews with the preview context switch", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ComponentsView />);
    const root = container.querySelector("[data-scope]");
    // Personal phase: the previews start in the Personal scope.
    expect(root).toHaveAttribute("data-scope", "personal");
    await user.click(screen.getByRole("radio", { name: "Teams" }));
    expect(root).toHaveAttribute("data-scope", "team");
  });

  it("shows field validation and clears it once the value is a number", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentsView />);
    const fields = screen.getByRole("region", { name: "Text fields" });
    const amount = within(fields).getByRole("textbox", { name: /Amount/ });
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(amount).toHaveAccessibleDescription(/Numbers only/);

    await user.clear(amount);
    await user.type(amount, "12500");
    expect(amount).not.toHaveAttribute("aria-invalid");
  });

  it("summarises form errors after an empty submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentsView />);
    const form = screen.getByRole("form", { name: "Sample expense form" });
    await user.click(within(form).getByRole("button", { name: "Save expense" }));

    const summary = await within(form).findByRole("region", { name: "Please fix the following" });
    expect(within(summary).getByRole("link", { name: "Enter a title of at least 3 characters." })).toHaveAttribute(
      "href",
      "#sg-form-title",
    );
    expect(within(summary).getByRole("link", { name: "Choose a priority." })).toBeInTheDocument();
  });

  it("keeps focus on the error summary after a failed submit", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComponentsView />);
    const form = screen.getByRole("form", { name: "Sample expense form" });
    const title = within(form).getByRole("textbox", { name: /Title/ });
    const titleFocused = vi.fn();
    title.addEventListener("focus", titleFocused);
    await user.click(within(form).getByRole("button", { name: "Save expense" }));

    const summary = await within(form).findByRole("region", { name: "Please fix the following" });
    await waitFor(() => expect(summary).toHaveFocus());
    // React Hook Form focuses the first invalid field on submit and again on a
    // timer (shouldFocusError); in a browser that lands after the summary.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(summary).toHaveFocus();
    expect(titleFocused).not.toHaveBeenCalled();
  });

  it("renders in Persian with the same structure", () => {
    renderWithProviders(<ComponentsView />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa", currency: "toman", calendar: "jalali" },
    });
    expect(screen.getByRole("heading", { level: 1, name: "کامپوننت‌ها" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "حالت‌های دکمه" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "کارت‌های شاخص" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "خانواده‌های زبانه" })).toBeInTheDocument();
    // Sample data follows the preferences: Persian digits and the Jalali calendar.
    const ring = screen.getByRole("region", { name: "کارت حلقه‌ای" });
    expect(within(ring).getByRole("heading", { name: "خواندن ۳۰ صفحه" })).toBeInTheDocument();
    expect(within(ring).getByText("میزان انجام · مهر")).toBeInTheDocument();
    const goal = screen.getByRole("article", { name: "هدف انتخاب‌شده: انتشار Planner v1" });
    expect(goal).toHaveTextContent("۲۰ آبان");
  });
});
