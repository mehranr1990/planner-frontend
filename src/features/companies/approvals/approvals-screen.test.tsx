import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { ApprovalsScreen } from "./approvals-screen";

afterEach(() => resetToasts());

describe("CO-09 · Approvals", () => {
  it("For me inbox, the approval card with the sequential chain and the read-only CaseFlow", async () => {
    renderCompanyScreen(<ApprovalsScreen />, { path: "/companies/euroly/approvals/ap-travel" });
    expect(await screen.findByRole("radio", { name: "For me 4" })).toBeChecked();
    const card = await screen.findByRole("region", { name: "Conference travel ×3" });
    expect(card).toHaveTextContent("Your step · 2 of 2 · Finance reviewer");
    expect(card).toHaveTextContent("180,000,000 T");
    expect(within(card).getByRole("list", { name: "Expense chain v3" })).toHaveTextContent("Omid R.");
    expect(within(card).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    const flow = screen.getByRole("region", { name: "Conference travel ×3 · approval flow" });
    expect(flow).toHaveTextContent("Budget commit");
    expect(within(flow).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("reject needs a reason; approving moves the item out of For me", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<ApprovalsScreen />, { path: "/companies/euroly/approvals/ap-licences" });
    const card = await screen.findByRole("region", { name: "Design tool licences" });
    expect(card).toHaveTextContent("Requester is the department manager → next eligible (Org Admin)");
    await user.click(within(card).getByRole("button", { name: "Reject…" }));
    expect(within(card).getByText("Write a reason or comment first.")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "For me 3" })).toBeInTheDocument());
  });

  it("my own request can't be approved by me; history lists decisions with chain version", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<ApprovalsScreen />, { path: "/companies/euroly/approvals/ap-catering" });
    const card = await screen.findByRole("region", { name: "Offsite catering" });
    expect(card).toHaveTextContent("You requested this");
    expect(within(card).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "History" }));
    const table = await screen.findByRole("table", { name: "Approval history" });
    expect(within(table).getByText("USB-C hubs ×6").closest("tr")).toHaveTextContent("Rejected — duplicate of IT stock");
    expect(table).toHaveTextContent("Expense v3");
  });
});
