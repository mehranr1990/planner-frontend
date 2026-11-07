import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { ProjectFlowScreen } from "./project-flow-screen";

function renderFlow(search = "") {
  setMockPathname("/projects/website-redesign/flow");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <ProjectFlowScreen />
    </ProjectGate>,
  );
}

describe("PJ-06 · Workflow view", () => {
  it("renders the graph hidden from assistive tech and the same data as a table", async () => {
    renderFlow();
    const table = await screen.findByRole("table");
    expect(screen.getByTestId("workflow-graph")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { name: "Workflow v3 · Website default" })).toBeInTheDocument();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "To do 13In progress · BlockedAssignee, Manager+",
      expect.stringMatching(/^In progress \dIn review · Blocked · To doAssignee, Manager\+$/),
      expect.stringMatching(/^In review \dDone · In progressManager\+$/),
      "Done 24In reviewManager+",
      expect.stringMatching(/^Blocked \dIn progress · To doManager\+$/),
    ]);
    expect(within(table).getByRole("link", { name: "Blocked" })).toHaveAttribute(
      "href",
      "/projects/website-redesign/tasks?status=blocked",
    );
  });

  it("offers Edit in Settings to Admin+ only", async () => {
    renderFlow("state=read-only");
    await screen.findByRole("table");
    expect(screen.queryByRole("link", { name: "Edit in Settings" })).not.toBeInTheDocument();
  });
});
