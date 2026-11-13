import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { BudgetsScreen } from "./budgets-screen";

afterEach(() => resetToasts());

describe("CO-10 · Budgets", () => {
  it("shows approved / committed / variance with pending separately, the company total and exact tooltips", async () => {
    renderCompanyScreen(<BudgetsScreen />, { path: "/companies/euroly/budgets" });
    const table = await screen.findByRole("table", { name: "Budget lines" });
    const engineering = within(table).getByRole("rowheader", { name: "Engineering" }).closest("tr")!;
    expect(within(engineering).getByTitle("20,000,000,000 T")).toHaveTextContent("20B");
    expect(within(table).getByRole("rowheader", { name: "Euroly" })).toBeInTheDocument();
    expect(table.closest("section")).toHaveTextContent("not part of variance");
  });

  it("requests a budget change from the notch through the Budget change chain", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<BudgetsScreen />, { path: "/companies/euroly/budgets" });
    const table = await screen.findByRole("table", { name: "Budget lines" });
    await user.click(within(table).getByRole("button", { name: "Design" }));
    const card = screen.getByRole("region", { name: /left of/ });
    await user.click(within(card).getByRole("button", { name: "Request budget change" }));
    const dialog = await screen.findByRole("dialog", { name: "Request budget change" });
    const amount = within(dialog).getByRole("textbox", { name: "New budget (T)" });
    await user.clear(amount);
    await user.type(amount, "9000000000");
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Launch hires");
    await user.click(within(dialog).getByRole("button", { name: "Send for approval" }));
    await waitFor(async () => expect((await repository.approvals("euroly")).some((item) => item.subject === "budget" && item.amount === 9_000_000_000)).toBe(true));
  });

  it("a Member has no budget access", async () => {
    renderCompanyScreen(<BudgetsScreen />, { path: "/companies/euroly/budgets", search: "state=as-member" });
    expect(await screen.findByText("No budgets you can see")).toBeInTheDocument();
  });
});
