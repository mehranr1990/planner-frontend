import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { CaseFlow, type CaseFlowRow } from "./case-flow";

const row = (id: string, extra: Partial<CaseFlowRow> = {}): CaseFlowRow => ({
  id,
  title: `Task ${id}`,
  state: "active",
  lead: { kind: "person", name: "Amy L.", initials: "AL" },
  href: `/t/${id}`,
  ...extra,
});

describe("CaseFlow (shared)", () => {
  it("renders people badges, stage columns (max 5 + more), states and outcome tiles", async () => {
    const user = userEvent.setup();
    const onPersonAction = vi.fn();
    renderWithProviders(
      <CaseFlow
        title="Flow"
        scope="team"
        people={[
          { id: "a", name: "Amy L.", initials: "AL", badge: { kind: "count", n: 2 } },
          { id: "b", name: "Bob M.", initials: "BM", badge: { kind: "none" } },
          { id: "c", name: "Cat N.", initials: "CN", badge: { kind: "done" } },
        ]}
        columns={[
          { id: "todo", label: "To do", rows: ["1", "2", "3", "4", "5", "6", "7"].map((id) => row(id)), moreHref: "/list" },
          { id: "doing", label: "Doing", rows: [row("8", { state: "blocked", lead: { kind: "unassigned" } }), row("9", { state: "done" })] },
        ]}
        links={[{ from: "1", to: "8", satisfied: false }]}
        outcomes={[{ id: "o1", title: "Shipped", highlighted: true }]}
        outcomeLabel="Done this week"
        onPersonAction={onPersonAction}
      />,
    );
    const flow = screen.getByRole("region", { name: "Flow" });
    expect(within(flow).getByRole("img", { name: "Amy L.: 2 open" })).toBeInTheDocument();
    expect(within(flow).getByRole("img", { name: "Cat N.: all done" })).toBeInTheDocument();
    await user.click(within(flow).getByRole("button", { name: "Bob M.: no step in this flow" }));
    expect(onPersonAction).toHaveBeenCalledWith("b");
    expect(within(flow).getByRole("link", { name: "+2 more" })).toHaveAttribute("href", "/list");
    expect(within(flow).queryByRole("link", { name: /Task 6/ })).not.toBeInTheDocument();
    expect(within(flow).getByText("Blocked")).toBeInTheDocument();
    expect(within(flow).getByText("Needs Task 1")).toBeInTheDocument();
    expect(within(flow).getByText("→ Needed by Task 8")).toBeInTheDocument();
    expect(within(flow).getByText("Shipped")).toBeInTheDocument();
  });
});
