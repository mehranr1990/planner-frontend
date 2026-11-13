import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderCompanyScreen } from "../test-utils";
import { CompanyOverviewScreen } from "./company-overview-screen";

describe("CO-01 · Company overview", () => {
  it("shows the portfolio signature card, sourced KPIs, budget and approvals for me (Org Admin)", async () => {
    renderCompanyScreen(<CompanyOverviewScreen />);
    expect(await screen.findByRole("heading", { name: "Euroly", level: 1 })).toBeInTheDocument();
    const portfolio = await screen.findByRole("region", { name: "Portfolio · Q4 1405" });
    expect(portfolio).toHaveTextContent("12/14projects on track");
    expect(portfolio).toHaveTextContent("status set by each project’s managers");
    expect(within(portfolio).getByRole("button", { name: "Open portfolio" })).toBeInTheDocument();
    expect(screen.getByText("oldest waiting 2 days")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Watch" })).toHaveTextContent("source: Resources › Capacity");
    const budget = screen.getByRole("region", { name: "Budget · Q4" });
    expect(budget).toHaveTextContent("are not counted until approved");
    const approvals = screen.getByRole("region", { name: "Approvals for you" });
    expect(await within(approvals).findByRole("link", { name: "Review Hire: senior front-end" })).toHaveAttribute(
      "href",
      "/companies/euroly/approvals/ap-hire",
    );
    expect(within(approvals).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Review approvals · 4" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Company sections" })).toBeInTheDocument();
    // No composite score anywhere.
    expect(screen.queryByText(/health/i)).not.toBeInTheDocument();
  });

  it("member view: no budget, no approvals, no export", async () => {
    renderCompanyScreen(<CompanyOverviewScreen />, { search: "state=as-member" });
    expect(await screen.findByRole("region", { name: "Portfolio · Q4 1405" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Budget · Q4" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Approvals for you" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
  });

  it("shows the gate states (not available, left)", async () => {
    renderCompanyScreen(<CompanyOverviewScreen />, { path: "/companies/nope" });
    expect(await screen.findByText("This company isn’t available")).toBeInTheDocument();
  });
});
