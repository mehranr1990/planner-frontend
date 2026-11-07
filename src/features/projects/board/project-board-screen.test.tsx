import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { ProjectBoardScreen } from "./project-board-screen";

function renderBoard(search = "") {
  setMockPathname("/projects/website-redesign/board");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <ProjectBoardScreen />
    </ProjectGate>,
  );
}

const column = (name: string) =>
  screen.getAllByRole("heading", { level: 3 }).find((heading) => heading.textContent?.startsWith(name))!
    .closest("section")!;

describe("PJ-03 · Project board", () => {
  it("shows the published workflow as columns with WIP badges and the version", async () => {
    renderBoard();
    await screen.findByRole("link", { name: "Checkout flow" });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.firstChild?.textContent);
    expect(headings).toEqual(["To do", "In progress", "In review", "Blocked", "Done"]);
    expect(within(column("In progress")).getByText(/^WIP \d \/ 5$/)).toBeInTheDocument();
    expect(within(column("In review")).getByText(/^WIP \d \/ 3$/)).toBeInTheDocument();
    expect(screen.getByText(/^Workflow v3 · published/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "true");
  });

  it("collapses Done cards older than 7 days behind “+ n more”", async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByRole("link", { name: "Checkout flow" });
    const more = screen.getByRole("button", { name: /^\+ \d+ more · collapsed after 7 days$/ });
    expect(screen.queryByRole("link", { name: "Kickoff workshop" })).not.toBeInTheDocument();
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Kickoff workshop" })).toBeInTheDocument();
  });

  it("gives movable cards a keyboard handle", async () => {
    renderBoard();
    await screen.findByRole("link", { name: "Checkout flow" });
    expect(screen.getByRole("button", { name: "Move API integration" })).toBeInTheDocument();
  });

  it("is read-only for viewers and groups lanes by phase", async () => {
    renderBoard("state=read-only&lanes=phase");
    await screen.findByRole("link", { name: "Checkout flow" });
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Build" })).toBeInTheDocument();
  });
});
