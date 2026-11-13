import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { ReportsScreen } from "./reports-screen";

afterEach(() => resetToasts());

describe("CO-13 · Reports & audit", () => {
  it("shows the fixed report set with sources and a table toggle; CSV exports are logged", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<ReportsScreen />, { path: "/companies/euroly/reports" });
    expect(await screen.findByRole("article", { name: "Budget variance" })).toBeInTheDocument();
    const view = screen.getByRole("region", { name: "Portfolio status · Q4" });
    expect(view).toHaveTextContent("source: Projects");
    await user.click(within(view).getByRole("switch", { name: "View as table" }));
    expect(within(view).getByRole("table")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export Expenses as CSV" }));
    await waitFor(async () => expect((await repository.audit("euroly"))[0]).toMatchObject({ kind: "export", subject: "expenses" }));
  });

  it("the audit log is filterable for Org Admin", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<ReportsScreen />, { path: "/companies/euroly/reports", search: "tab=audit" });
    const table = await screen.findByRole("table", { name: "Audit log" });
    expect(table).toHaveTextContent("opened sealed file (grant HR reviewer)");
    await user.click(screen.getByRole("radio", { name: "Policies 1" }));
    expect(within(screen.getByRole("table", { name: "Audit log" })).getAllByRole("row")).toHaveLength(2);
  });

  it("members see only portfolio and goals, no exports or audit", async () => {
    renderCompanyScreen(<ReportsScreen />, { path: "/companies/euroly/reports", search: "state=as-member" });
    expect(await screen.findByRole("article", { name: "Portfolio status" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Expenses" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Audit log" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /as CSV/ })).not.toBeInTheDocument();
  });
});
