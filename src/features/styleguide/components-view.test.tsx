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
  "Notched cards",
  "Ring card",
  "Folder tabs",
  "Progress",
  "Tabs & view switchers",
  "Product card",
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

  it("retints the previews with the preview context switch", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ComponentsView />);
    const root = container.querySelector("[data-scope]");
    expect(root).toHaveAttribute("data-scope", "project");
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
  });
});
