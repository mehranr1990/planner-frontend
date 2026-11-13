import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { routerPush } from "@/test/setup";
import { renderCompanyScreen } from "../test-utils";
import { ExpensesScreen } from "./expenses-screen";

afterEach(() => resetToasts());

describe("CO-08 · Expenses", () => {
  it("lists exact amounts with statuses and receipts; reviewers open the approval from the notch", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<ExpensesScreen />, { path: "/companies/euroly/expenses" });
    const table = await screen.findByRole("table", { name: "Expenses" });
    const travel = within(table).getByRole("button", { name: /Conference travel ×3/ }).closest("tr")!;
    expect(travel).toHaveTextContent("180,000,000");
    expect(travel).toHaveTextContent("Pending · step 2");
    expect(within(table).getByRole("button", { name: /Team lunch/ }).closest("tr")).toHaveTextContent("missing");
    await user.click(within(table).getByRole("button", { name: /Conference travel ×3/ }));
    const card = screen.getByRole("region", { name: "Conference travel ×3" });
    expect(card).toHaveTextContent("180,000,000 T");
    await user.click(within(card).getByRole("button", { name: "Open approval" }));
    expect(routerPush).toHaveBeenLastCalledWith("/companies/euroly/approvals/ap-travel");
  });

  it("the author edits a changes-requested expense and withdraws a pending one", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<ExpensesScreen />, { path: "/companies/euroly/expenses" });
    const table = await screen.findByRole("table", { name: "Expenses" });
    await user.click(within(table).getByRole("button", { name: /Team lunch/ }));
    const lunch = screen.getByRole("region", { name: "Team lunch" });
    expect(lunch).toHaveTextContent("please attach the receipt.");
    await user.click(within(lunch).getByRole("button", { name: "Edit expense" }));
    expect(routerPush).toHaveBeenLastCalledWith("/companies/euroly/expenses?sheet=expense-new&expense=ex-lunch", { scroll: false });
    await user.click(within(table).getByRole("button", { name: /Offsite catering/ }));
    await user.click(within(screen.getByRole("region", { name: "Offsite catering" })).getByRole("button", { name: "Withdraw" }));
    await waitFor(async () => expect((await repository.expenses("euroly")).find((item) => item.id === "ex-catering")?.status).toBe("withdrawn"));
  });

  it("a Member sees only their own expenses", async () => {
    renderCompanyScreen(<ExpensesScreen />, { path: "/companies/euroly/expenses", search: "state=as-member" });
    const table = await screen.findByRole("table", { name: "Expenses" });
    expect(within(table).queryByRole("button", { name: /Conference travel/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("button", { name: /Team lunch/ })).toBeInTheDocument();
  });
});

describe("CO-08 · Persian (COM02)", () => {
  it("shows exact Toman with Persian digits and the ٬ separator", async () => {
    renderCompanyScreen(<ExpensesScreen />, {
      path: "/companies/euroly/expenses",
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const table = await screen.findByRole("table", { name: "هزینه‌ها" });
    expect(table).toHaveTextContent("۱۸۰٬۰۰۰٬۰۰۰");
    expect(within(table).getAllByText("در انتظار · مرحله‌ی ۲").length).toBeGreaterThan(0);
  });
});
