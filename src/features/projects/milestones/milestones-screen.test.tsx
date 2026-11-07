import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { MilestonesScreen } from "./milestones-screen";

function renderMilestones(search = "") {
  setMockPathname("/projects/website-redesign/milestones");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <MilestonesScreen />
    </ProjectGate>,
  );
}

describe("PJ-08 · Phases & milestones", () => {
  it("lists phases and milestones with server statuses and opens the at-risk one", async () => {
    renderMilestones();
    const list = await screen.findByRole("heading", { name: "Milestones" }).then((h) => h.closest("section")!);
    const chips = within(list)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(chips.some((text) => text?.includes("Payment go-live") && text.includes("At risk"))).toBe(true);
    expect(chips.some((text) => text?.includes("Beta") && text.includes("Next"))).toBe(true);
    expect(chips.some((text) => text?.includes("Launch") && text.includes("Planned"))).toBe(true);
    expect(screen.getByText("6 · 3 reached")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Payment go-live" })).toBeInTheDocument();
    expect(screen.getByText("Linked risk: Payment API access delayed (High)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Tasks (filtered)" })).toHaveAttribute(
      "href",
      "/projects/website-redesign/tasks?milestone=payment-go-live",
    );
    expect(screen.getByRole("button", { name: "Move Planning" })).toBeInTheDocument();
  });

  it("a new date on a milestone with dependents opens the schedule preview", async () => {
    const user = userEvent.setup();
    renderMilestones("m=beta");
    await user.click(await screen.findByRole("button", { name: "Edit milestone" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit milestone" });
    const day = within(dialog).getAllByRole("gridcell").find((cell) => cell.textContent === "20" || cell.textContent === "۲۰");
    await user.click(within(day!).queryByRole("button") ?? day!);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const preview = await screen.findByRole("dialog", { name: /^Preview: move “Beta”/ });
    expect(within(preview).getByText("Nothing is saved yet")).toBeInTheDocument();
    expect(within(preview).getByRole("radio", { name: "Move dependent tasks too" })).toBeChecked();
    await user.click(within(preview).getByRole("button", { name: /^Apply \d+ changes$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Preview/ })).not.toBeInTheDocument());
  });

  it("viewers get Copy link in the notch and no phase reordering", async () => {
    renderMilestones("state=read-only");
    await screen.findByRole("heading", { level: 2, name: "Payment go-live" });
    expect(screen.queryByRole("button", { name: "Edit milestone" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move Planning" })).not.toBeInTheDocument();
  });
});
