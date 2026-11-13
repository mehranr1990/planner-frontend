import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { CompanyWorkScreen } from "./company-work-screen";

afterEach(() => resetToasts());

describe("CO-04 · Projects & teams", () => {
  it("lists the portfolio with budgets for Org Admin, filters, and the pending attach card", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<CompanyWorkScreen />, { path: "/companies/euroly/work" });
    const table = await screen.findByRole("table", { name: "Company projects" });
    expect(within(table).getAllByRole("row")).toHaveLength(15);
    expect(within(table).getByRole("columnheader", { name: "Budget" })).toBeInTheDocument();
    const filters = screen.getByRole("radiogroup", { name: "Filter projects" });
    await user.click(within(filters).getByRole("radio", { name: "At risk 2" }));
    expect(within(screen.getByRole("table", { name: "Company projects" })).getAllByRole("row")).toHaveLength(3);
    const pending = screen.getByRole("article", { name: "Pending attach" });
    expect(pending).toHaveTextContent("the company sees only the name");
  });

  it("owner side: custody & privacy preview, separate consent, accept needs re-authentication", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<CompanyWorkScreen />, { path: "/companies/euroly/work" });
    const preview = await screen.findByRole("region", { name: "Attach preview · Research Guild" });
    expect(preview).toHaveTextContent("NOT revealed in bulk");
    expect(preview).toHaveTextContent("Personal data of members is never transferred");
    await user.click(within(preview).getByRole("checkbox", { name: "User Study 2026" }));
    await user.click(within(preview).getByRole("button", { name: "Accept & re-authenticate" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm it’s you" });
    await user.click(within(dialog).getByRole("button", { name: "Accept" }));
    expect(await within(dialog).findByText("Re-authentication failed")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Password"), "secret");
    await user.click(within(dialog).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Attach preview · Research Guild" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("radio", { name: "Teams 7" }));
    expect(await screen.findByRole("link", { name: "Research Guild" })).toHaveAttribute("href", "/teams/research");
  });

  it("member view: no budget column, no attach", async () => {
    renderCompanyScreen(<CompanyWorkScreen />, { path: "/companies/euroly/work", search: "state=as-member" });
    const table = await screen.findByRole("table", { name: "Company projects" });
    expect(within(table).queryByRole("columnheader", { name: "Budget" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attach existing" })).not.toBeInTheDocument();
  });
});
