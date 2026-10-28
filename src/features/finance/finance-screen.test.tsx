import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { preferencesForLocale } from "@/features/preferences/preferences-store";
import { renderWithProviders } from "@/test/render";
import { routerPush, routerReplace, setMockSearch } from "@/test/setup";
import { FinanceScreen } from "./finance-screen";

function renderFinance(search = "", options: Parameters<typeof renderWithProviders>[1] & { empty?: boolean } = {}) {
  const { empty, ...rest } = options;
  setMockSearch(search);
  const repositories = createMockRepositories(empty ? { fixtures: { finance: null } } : {});
  const view = renderWithProviders(
    <DataProvider repositories={repositories}>
      <FinanceScreen />
    </DataProvider>,
    rest,
  );
  return { ...view, repositories };
}

describe("FinanceScreen (P13)", () => {
  it("Overview: balance signature (notch = Add expense), KPI family, budget vs actual with the over-budget marker, bills and recent", async () => {
    const user = userEvent.setup();
    const { container } = renderFinance();
    expect(await screen.findByRole("heading", { name: "Balance · all accounts" })).toBeInTheDocument();
    expect(screen.getByText("186,400,000")).toBeInTheDocument();
    expect(screen.getByText(/2\.4M under expected pace/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Transactions/ })).toHaveTextContent("46");
    const lifestyle = container.querySelector('[data-budget="lifestyle"]')!;
    expect(lifestyle).toHaveAttribute("data-over", "true");
    expect(lifestyle).toHaveTextContent("over budget");
    expect(container.querySelector('[data-budget="food"]')).not.toHaveAttribute("data-over");
    expect(screen.getByText("Car insurance")).toBeInTheDocument();
    expect(screen.getByText("Hyperstar groceries")).toBeInTheDocument();
    // One signature card; its notch opens Add expense.
    expect(container.querySelectorAll('[data-slot="signature-card"]').length).toBeLessThanOrEqual(1);
    await user.click(screen.getAllByRole("button", { name: "Add expense" })[1]!);
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("sheet=expense"), { scroll: false });
  });

  it("switches tab and month through the URL; next month stops at the current one", async () => {
    const user = userEvent.setup();
    renderFinance();
    await screen.findByRole("heading", { name: "Balance · all accounts" });
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: /Trends/ }));
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/finance?tab=trends", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(routerReplace).toHaveBeenLastCalledWith("/personal/finance?month=1405-06", { scroll: false });
  });

  it("Trends draws the River with one observation; Breakdown draws the Flow with Remaining", async () => {
    const { container, unmount } = renderFinance("tab=trends");
    expect(await screen.findByRole("heading", { name: "How did spending move through Mehr?" })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('[data-slot="budget-river"]')).toBeInTheDocument());
    expect(container.querySelector("[data-finance-observation]")).toHaveTextContent(/Spending peaked on 1 Mehr \(Housing\); Lifestyle is the only category above its budget\./);
    expect(container.querySelector('[data-slot="budget-flow"]')).toBeNull();
    unmount();
    const breakdown = renderFinance("tab=breakdown");
    expect(await screen.findByRole("heading", { name: "Where is the money going?" })).toBeInTheDocument();
    expect(breakdown.container.querySelector('[data-slot="budget-river"]')).toBeNull();
    expect(screen.getByRole("button", { name: /Housing/ })).toHaveTextContent("38%");
    expect(breakdown.container.querySelector("[data-flow-rest]")).toHaveTextContent("35% of income");
  });

  it("Transactions: search, Today total, delete with Undo", async () => {
    const user = userEvent.setup();
    const { repositories } = renderFinance("tab=transactions");
    expect(await screen.findByRole("region", { name: "Today · −1,426,000" })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search transactions" }), "snapp");
    const today = screen.getByRole("region", { name: "Today · −186,000" });
    await user.click(within(today).getByRole("button", { name: "Delete Snapp ride" }));
    await waitFor(async () => expect((await repositories.finance.month("2026-10-13")).transactionCount).toBe(45));
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await repositories.finance.month("2026-10-13")).transactionCount).toBe(46));
  });

  it("shows Rial (×10, display only), the empty state and the locked placeholder", async () => {
    const rial = renderFinance("", { preferences: { currency: "rial" } });
    expect(await screen.findByText("1,864,000,000")).toBeInTheDocument();
    rial.unmount();
    const empty = renderFinance("", { empty: true });
    expect(await screen.findByRole("heading", { name: "No transactions yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set budget" })).toBeInTheDocument();
    empty.unmount();
    const user = userEvent.setup();
    renderFinance("", { plannerSettings: { ...DEFAULT_PLANNER_SETTINGS, privacy: { ...DEFAULT_PLANNER_SETTINGS.privacy, financeLock: true } } });
    expect(screen.getByRole("heading", { name: "Finance is locked" })).toBeInTheDocument();
    expect(screen.queryByText("186,400,000")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("186,400,000")).toBeInTheDocument();
  });

  it("renders in Persian with Persian digits and Toman", async () => {
    renderFinance("", { preferences: { ...preferencesForLocale("fa"), currency: "toman" } });
    expect(await screen.findByText("۱۸۶٬۴۰۰٬۰۰۰")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "مالی" })).toBeInTheDocument();
  });
});
