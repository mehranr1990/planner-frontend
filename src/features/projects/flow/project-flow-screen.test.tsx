import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
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

  it("opens the CaseFlow on the nearest at-risk milestone (D20)", async () => {
    renderFlow();
    const flow = (await screen.findByRole("heading", { name: "Payment go-live · flow" })).closest("section")!;
    expect(screen.getByRole("radio", { name: "Payment go-live" })).toHaveAttribute("aria-checked", "true");
    expect(within(flow).getByText(/\(4 tasks · 1 done\)/)).toBeInTheDocument();
    // Blocked is a row state in the first active column; the waiting row says what it needs.
    expect(within(flow).getByRole("link", { name: /Checkout flow.*Blocked/ })).toHaveAttribute(
      "href",
      "/projects/website-redesign/tasks/checkout-flow",
    );
    expect(within(flow).getByText("Needs Checkout flow · accept pending")).toBeInTheDocument();
    expect(within(flow).getByText("Nothing in In review")).toBeInTheDocument();
    // Done tile (highlighted, most recent) + milestone tile.
    expect(within(flow).getByRole("link", { name: /3DS verification/ })).toBeInTheDocument();
    expect(within(flow).getByRole("link", { name: /Payment go-live.*milestone/ })).toHaveAttribute(
      "href",
      "/projects/website-redesign/milestones",
    );
  });

  it("filters by person from the notch and switches filters through the URL", async () => {
    const user = userEvent.setup();
    renderFlow("flow=all");
    const avatar = await screen.findByRole("button", { name: /^Show only Kian.*tasks$/ });
    expect(screen.getByRole("heading", { name: "All open tasks · flow" })).toBeInTheDocument();
    expect(avatar).toHaveAttribute("aria-pressed", "false");
    await user.click(avatar);
    expect(routerReplace).toHaveBeenLastCalledWith("/projects/website-redesign/flow?flow=all&person=kian", { scroll: false });
    await user.click(screen.getByRole("radio", { name: "My tasks" }));
    expect(routerReplace).toHaveBeenLastCalledWith("/projects/website-redesign/flow?flow=mine", { scroll: false });
  });

  it("offers Edit in Settings to Admin+ only", async () => {
    renderFlow("state=read-only");
    await screen.findByRole("table");
    expect(screen.queryByRole("link", { name: "Edit in Settings" })).not.toBeInTheDocument();
  });
});
