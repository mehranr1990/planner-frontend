import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { ProjectTaskDetailView } from "./project-task-detail-view";

function renderDetail(taskId: string, search = "") {
  setMockPathname(`/projects/website-redesign/tasks/${taskId}`);
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <ProjectTaskDetailView taskId={taskId} variant="page" />
    </ProjectGate>,
  );
}

describe("PJ-15 · Project task detail", () => {
  it("head is the signature card; Mark done is disabled with the workflow reason from To do", async () => {
    renderDetail("payment-errors-copy");
    expect(await screen.findByRole("heading", { level: 1, name: "Payment errors copy" })).toBeInTheDocument();
    const head = screen.getByRole("region", { name: "Payment errors copy" });
    expect(head).toHaveAttribute("data-notch-actions", "1");
    expect(head).toHaveTextContent("Milestone · Beta");
    const done = within(head).getByRole("button", { name: "Mark done" });
    expect(done).toHaveAttribute("aria-disabled", "true");
    expect(done).toHaveAccessibleDescription("Done isn’t allowed from To do in this workflow");
  });

  it("properties, folder tabs (Comments default) and the assignment block for the pending assignee", async () => {
    renderDetail("payment-errors-copy");
    const block = await screen.findByRole("region", { name: "Sara P. assigned this to you" });
    expect(block).toHaveTextContent("accepting adds it to your Personal tasks and calendar view");
    const props = screen.getByLabelText("Task properties");
    expect(props).toHaveTextContent("You· pending");
    expect(props).toHaveTextContent("Build · Checkout");
    expect(props).toHaveTextContent("Platform: Web · Story points: 2");
    expect(screen.getByRole("switch", { name: /Show in My Calendar/ })).toBeDisabled();
    const tabs = screen.getByRole("tablist", { name: "Task sections" });
    expect(within(tabs).getByRole("tab", { name: /Comments/ })).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("Copy for card declined / expired / 3DS fail. Tone: calm, one action each."),
    ).toBeInTheDocument();
  });

  it("Accept shows the undo toast and removes the block; the calendar switch turns on", async () => {
    const user = userEvent.setup();
    renderDetail("payment-errors-copy");
    const block = await screen.findByRole("region", { name: "Sara P. assigned this to you" });
    await user.click(within(block).getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Accepted · added to your tasks")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Sara P. assigned this to you" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("switch", { name: /Show in My Calendar/ })).toBeChecked();
  });

  it("Decline uses the PJ-15 copy (Missing information) and needs a reason", async () => {
    const user = userEvent.setup();
    renderDetail("payment-errors-copy");
    const block = await screen.findByRole("region", { name: "Sara P. assigned this to you" });
    await user.click(within(block).getByRole("button", { name: "Decline…" }));
    const dialog = await screen.findByRole("dialog", { name: "Decline assignment" });
    expect(within(dialog).getByRole("radio", { name: "Missing information" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Sara P. assigned this to you" })).not.toBeInTheDocument(),
    );
  });

  it("shows who assigned a pending task (Kian F.)", async () => {
    renderDetail("checkout-qa-pass");
    await screen.findByRole("heading", { level: 1, name: "Checkout QA pass" });
    expect(screen.getByRole("region", { name: "Kian F. assigned this to you" })).toBeInTheDocument();
  });

  it("managers see Pending · Kian F. with Remind / Reassign", async () => {
    const user = userEvent.setup();
    renderDetail("uat-signoff");
    expect(await screen.findByText("Pending · Kian F.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remind" }));
    expect(await screen.findByText("Reminder sent to Kian F.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reassign" }));
    expect(routerPush).toHaveBeenCalledWith(
      "/projects/website-redesign/tasks/uat-signoff?sheet=assignment-reassign&task=uat-signoff",
      { scroll: false },
    );
  });

  it("adding a dependency that loops shows the cycle error", async () => {
    const user = userEvent.setup();
    renderDetail("payment-api-keys");
    await screen.findByRole("heading", { level: 1, name: "Payment API keys" });
    await user.click(screen.getByRole("tab", { name: /Links/ }));
    // Checkout flow already waits for Payment API keys → making keys wait for checkout loops.
    await user.selectOptions(await screen.findByRole("combobox", { name: "Task" }), "Checkout flow");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("This would create a loop")).toBeInTheDocument();
  });

  it("viewer: notch becomes Copy link, no comment composer", async () => {
    renderDetail("payment-errors-copy", "state=read-only");
    await screen.findByRole("heading", { level: 1, name: "Payment errors copy" });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Comment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sara P. assigned this to you" })).not.toBeInTheDocument();
  });

  it("an unknown task shows the deleted state", async () => {
    renderDetail("gone");
    expect(await screen.findByRole("heading", { name: "This task was deleted" })).toBeInTheDocument();
  });
});

describe("accepted assignment → Personal projection (mock)", () => {
  it("adds a projection to Personal tasks with the project as source, and Undo removes it", async () => {
    const repos = createMockRepositories();
    const accepted = await repos.assignments.accept("payment-errors-copy", 1);
    const projected = (await repos.tasks.list({ view: "all" })).find(
      (task) => task.id === "project-payment-errors-copy",
    );
    expect(projected).toMatchObject({
      scope: "project",
      project: "Website Redesign",
      date: "2026-10-24",
      deadline: "2026-10-24",
    });
    await repos.taskDetails.setShowInCalendar("payment-errors-copy", false);
    expect((await repos.tasks.get("project-payment-errors-copy"))?.date).toBeNull();
    await repos.assignments.revertAccept("payment-errors-copy", accepted.revision);
    expect(await repos.tasks.get("project-payment-errors-copy")).toBeNull();
  });
});
