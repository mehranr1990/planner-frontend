import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { mockViewport, persian } from "@/features/my-day/states/test-utils";
import type { Preferences } from "@/features/preferences/preferences-store";
import { renderWithProviders } from "@/test/render";
import { swipeOutcome } from "./mobile/use-row-touch";
import { TasksScreen, type TasksScreenProps } from "./tasks-screen";

/*
 * The assembled P03 list on the sample fixtures (today Tue 21 Mehr): groups
 * and rows, inline edit, selection with the bulk bar, filter chips, states,
 * Persian. Domain rules have their own tests in domain/.
 */

afterEach(() => resetToasts());
beforeEach(() => mockViewport("desktop"));

function renderScreen(demo: TasksScreenProps["demo"] = {}, preferences: Partial<Preferences> = {}) {
  return renderWithProviders(
    <DataProvider repositories={createMockRepositories()}>
      <TasksScreen demo={demo} />
    </DataProvider>,
    { preferences },
  );
}

const list = () => screen.findByRole("region", { name: "Task list" });
const row = (title: string) => screen.getByText(title).closest<HTMLElement>("[data-task-row]")!;

describe("TasksScreen", () => {
  it("renders Today grouped by time of day, with columns, links to detail and the progress pill", async () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    const region = await list();
    await waitFor(() => expect(within(region).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Overdue",
      "Morning",
      "Afternoon",
      "Evening",
      "Unscheduled",
    ]));
    const overdue = row("Pay electricity bill");
    expect(within(overdue).getByText("Yesterday").parentElement).toHaveClass("text-danger-text");
    expect(within(overdue).getByText("High")).toBeInTheDocument();
    expect(within(overdue).getByRole("link", { name: "Open Pay electricity bill" })).toHaveAttribute(
      "href",
      expect.stringContaining("/personal/tasks/"),
    );
    expect(await screen.findByText(/2 of 9 done today/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reschedule all" })).toBeInTheDocument();
  });

  it("edits a title inline: click the title, type, Enter saves", async () => {
    const user = userEvent.setup();
    renderScreen();
    await list();
    await user.click(await screen.findByRole("button", { name: "Read 30 pages" }));
    const input = screen.getByRole("textbox", { name: "Task title" });
    await user.clear(input);
    await user.type(input, "Read 40 pages{Enter}");
    expect(await screen.findByRole("button", { name: "Read 40 pages" })).toBeInTheDocument();
  });

  it("⌘-click selects; the bulk bar completes the selection with an Undo toast", async () => {
    const user = userEvent.setup();
    renderScreen();
    await list();
    const title = await screen.findByRole("button", { name: "Plan weekend trip" });
    await user.keyboard("{Control>}");
    await user.click(title);
    await user.keyboard("{/Control}");
    const bar = await screen.findByRole("toolbar", { name: "Bulk actions" });
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Complete" }));
    expect(await screen.findByText("“Plan weekend trip” completed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("shows active filters as removable chips; Clear all removes them", async () => {
    const user = userEvent.setup();
    renderScreen({ initial: { filters: { energies: ["low", "medium"] } } });
    await list();
    expect(await screen.findByText("Energy: Low–Medium")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByText("Energy: Low–Medium")).not.toBeInTheDocument();
  });

  it("filter with no result: No tasks match, with Clear filters", async () => {
    const user = userEvent.setup();
    renderScreen({ initial: { q: "zzzz-nothing" } });
    expect(await screen.findByText("No tasks match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await list()).toBeInTheDocument();
  });

  it("Completed view drops the priority column and explains the archive rule", async () => {
    renderScreen({ initial: { tab: "completed" } });
    await list();
    expect(await screen.findByText(/Kept 90 days, then archived/)).toBeInTheDocument();
    expect(screen.queryByText("Priority", { selector: "span" })).not.toBeInTheDocument();
  });

  it("Board layout shows the horizon columns and the Done rail", async () => {
    renderScreen({ initial: { layout: "board" } });
    const region = await screen.findByRole("region", { name: "Task board" });
    for (const name of ["Today", "Tomorrow", "This week", "Later"]) {
      expect(within(region).getByRole("heading", { level: 3, name: new RegExp(`^${name},`) })).toBeInTheDocument();
    }
    expect(within(region).getByRole("button", { name: /Done today/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("radiogroup", { name: "Group by" })).toBeInTheDocument();
  });

  it("Persian: RTL copy, Persian digits and Jalali headers", async () => {
    renderScreen({}, persian);
    expect(screen.getByRole("heading", { level: 1, name: "کارها" })).toBeInTheDocument();
    const region = await screen.findByRole("region", { name: "فهرست کارها" });
    expect(await within(region).findByRole("heading", { level: 2, name: "عقب‌افتاده" })).toBeInTheDocument();
    expect(await screen.findByText(/۲ از ۹ انجام شد · ۵س ۳۰د مانده/)).toBeInTheDocument();
  });
});

describe("swipeOutcome", () => {
  it("toward inline-end completes, toward inline-start reschedules; mirrored in RTL", () => {
    expect(swipeOutcome(100, false)).toBe("complete");
    expect(swipeOutcome(-100, false)).toBe("reschedule");
    expect(swipeOutcome(-100, true)).toBe("complete");
    expect(swipeOutcome(100, true)).toBe("reschedule");
    expect(swipeOutcome(40, false)).toBeNull();
  });
});
