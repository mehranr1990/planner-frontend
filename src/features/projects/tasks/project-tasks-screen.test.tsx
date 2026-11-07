import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { ProjectTasksScreen } from "./project-tasks-screen";

function renderTasks(search = "", options?: Parameters<typeof renderWithProviders>[1]) {
  setMockPathname("/projects/website-redesign/tasks");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <ProjectTasksScreen />
    </ProjectGate>,
    options,
  );
}

const row = (title: string) => screen.getByRole("link", { name: title }).closest("li")!;

describe("PJ-02 · Project tasks (List)", () => {
  it("shows view pills with server counts and groups by phase (done phases collapsed)", async () => {
    renderTasks();
    await screen.findByRole("link", { name: "Checkout flow" });
    const pills = screen.getByRole("radiogroup", { name: "Task views" });
    expect(
      within(pills)
        .getAllByRole("radio")
        .map((pill) => pill.textContent),
    ).toEqual(["All 41", "My tasks 5", "Unassigned 3", "Overdue 2", "Completed"]);
    expect(screen.getByRole("button", { name: "Show or hide Design" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Show or hide Build" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("9 open · 3 done")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Moodboard" })).not.toBeInTheDocument();
  });

  it("renders workflow status, acceptance badges, dependency marker and assignment lines", async () => {
    renderTasks();
    const checkout = row(await screen.findByText("Checkout flow").then(() => "Checkout flow"));
    expect(within(checkout).getByText("blocked by 1")).toBeInTheDocument();
    expect(within(checkout).getByRole("button", { name: "Change status of Checkout flow" })).toHaveTextContent(
      "Blocked",
    );
    expect(row("Payment errors copy")).toHaveTextContent("Waiting for you to accept");
    expect(within(row("Payment errors copy")).getByRole("img", { name: "Mehran R., pending" })).toBeInTheDocument();
    expect(row("Empty states")).toHaveTextContent(
      "Declined by Arash P. · “no capacity this sprint” · needs reassignment",
    );
    expect(within(row("Empty states")).getByRole("img", { name: "Arash P., declined" })).toBeInTheDocument();
    expect(row("Icon set")).toHaveTextContent("Unassigned");
    expect(row("API integration")).toHaveTextContent("Milestone · Beta");
  });

  it("changes status through the allowed transitions only", async () => {
    const user = userEvent.setup();
    renderTasks();
    await user.click(await screen.findByRole("button", { name: "Change status of API integration" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["In review", "Blocked", "To do"]);
    await user.click(within(menu).getByRole("menuitem", { name: "In review" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Change status of API integration" })).toHaveTextContent("In review"),
    );
  });

  it("view pills and filters go to the URL", async () => {
    const user = userEvent.setup();
    renderTasks();
    await user.click(await screen.findByRole("radio", { name: "My tasks 5" }));
    expect(routerReplace).toHaveBeenLastCalledWith("/projects/website-redesign/tasks?view=mine", { scroll: false });
  });

  it("filters by milestone from the URL with a removable chip", async () => {
    renderTasks("milestone=beta");
    await screen.findByRole("link", { name: "API integration" });
    expect(screen.getByText("Milestone: Beta")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Checkout flow" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "All 4" })).toBeInTheDocument();
  });

  it("quick add parses @person !priority due ~estimate into the current phase", async () => {
    const user = userEvent.setup();
    renderTasks();
    const input = await screen.findByRole("textbox", { name: "Add task" });
    expect(input).toHaveAttribute("placeholder", expect.stringContaining("Add task to Build"));
    await user.type(input, "Fix login @kian !high due 25 Oct ~3h");
    expect(screen.getByText("@Kian F.")).toBeInTheDocument();
    expect(screen.getByText("~3h")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    const added = await screen.findByRole("link", { name: "Fix login" });
    expect(added.closest("li")).toHaveTextContent("Waiting for Kian F. to accept");
  });

  it("bulk bar: capability-aware actions (a Manager cannot delete)", async () => {
    const user = userEvent.setup();
    renderTasks();
    await user.click(await screen.findByRole("button", { name: "Select API integration" }));
    await user.click(screen.getByRole("button", { name: "Select Icon set" }));
    const bar = screen.getByRole("toolbar", { name: "Bulk actions" });
    expect(bar).toHaveTextContent("2 selected");
    const del = within(bar).getByRole("button", { name: "Delete" });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(del).toHaveAccessibleDescription("You can change 0 of 2 selected");
    await user.click(within(bar).getByRole("button", { name: "Move to phase" }));
    await user.click(await screen.findByRole("menuitem", { name: "QA" }));
    await waitFor(() => expect(screen.queryByRole("toolbar", { name: "Bulk actions" })).not.toBeInTheDocument());
  });

  it("Viewer: read-only rows, no selection, no add", async () => {
    renderTasks("state=read-only");
    await screen.findByRole("link", { name: "Checkout flow" });
    expect(screen.queryByRole("button", { name: /^Select / })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Add task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change status/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
  });

  it("Guest: only granted tasks, no grouping by people", async () => {
    const user = userEvent.setup();
    renderTasks("state=guest");
    await screen.findByRole("link", { name: "API integration" });
    expect(screen.queryByRole("link", { name: "Checkout flow" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Group: Phase/ }));
    expect(screen.queryByRole("menuitemradio", { name: "Assignee" })).not.toBeInTheDocument();
  });

  it("demo conflict shows the SH-02 notice on the row", async () => {
    renderTasks("state=conflict");
    await screen.findByRole("link", { name: "Checkout flow" });
    const notice = within(row("Checkout flow")).getByRole("alert");
    expect(notice).toHaveTextContent("This changed while you were editing");
    expect(within(notice).getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("filtered and empty states", async () => {
    renderTasks("state=filtered");
    expect(await screen.findByText("No tasks match")).toBeInTheDocument();
  });

  it("renders Persian labels and digits", async () => {
    renderTasks("", { preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } });
    await screen.findByRole("link", { name: "Checkout flow" });
    expect(screen.getByRole("radio", { name: "کارهای من ۵" })).toBeInTheDocument();
    expect(within(row("Checkout flow")).getByText("مسدود توسط ۱")).toBeInTheDocument();
  });
});
