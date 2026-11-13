import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { createMockSocial } from "@/data/mock/mock-social";
import { SocialDataProvider } from "@/data/social-provider";
import { preferencesForLocale } from "@/features/preferences/preferences-store";
import { renderWithProviders, type ProvidersRenderOptions } from "@/test/render";
import { setMockParams, setMockPathname, setMockSearch } from "@/test/setup";
import { ActivityScreen } from "./activity/activity-screen";
import { ConnectionsScreen } from "./connections/connections-screen";
import { ExpenseDetailScreen } from "./expenses/expense-detail-screen";
import { ActivityExpensesScreen } from "./expenses/expenses-screen";
import { GroupsScreen } from "./groups/groups-screen";
import { MyBalancesScreen } from "./balances/my-balances-screen";
import { SocialHomeScreen } from "./home/social-home-screen";
import { SocialGroupGate } from "./social-gate";

/*
 * Social UI in Mock Mode (focused): the mock server decides access, money
 * and privacy; these check that the screens show exactly that — approved
 * balances only, per-currency totals, discover without private groups,
 * access states, the non-revealing connect copy and Persian RTL money.
 */
function renderSocial(ui: ReactElement, { path = "/social", search = "", params = {}, ...options }: ProvidersRenderOptions & { path?: string; search?: string; params?: Record<string, string> } = {}) {
  setMockPathname(path);
  setMockSearch(search);
  setMockParams(params);
  const repository = createMockSocial();
  return { repository, ...renderWithProviders(<SocialDataProvider repository={repository}>{ui}</SocialDataProvider>, options) };
}

describe("SO-15 home", () => {
  it("shows the next activity card, needs-you items and per-currency balances", async () => {
    renderSocial(<SocialHomeScreen />);
    // The earliest activity I'm going to (weekly climbing, Mon 19 Oct) leads.
    expect(await screen.findByRole("heading", { name: "Climbing gym" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open activity" })).toBeInTheDocument();
    const needs = screen.getByRole("region", { name: "Needs you" });
    expect(within(needs).getByText("Darya N. wants to connect")).toBeInTheDocument();
    const balances = screen.getByRole("region", { name: "Balances" });
    // Never summed across currencies: one total per currency.
    expect(within(balances).getByText("Toman")).toBeInTheDocument();
    expect(within(balances).getByText("Turkish lira")).toBeInTheDocument();
    expect(within(balances).getByText("Euro")).toBeInTheDocument();
  });
});

describe("SO-02 / SO-03 privacy", () => {
  it("connect lookup never reveals whether an account exists", async () => {
    renderSocial(<ConnectionsScreen />, { path: "/social/connections" });
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(screen.getByText(/silent/i, { selector: "p" })).toBeInTheDocument();
  });

  it("discover lists discoverable groups only, as previews", async () => {
    renderSocial(<GroupsScreen />, { path: "/social/groups", search: "tab=discover" });
    expect(await screen.findByRole("heading", { name: "Tehran Runners" })).toBeInTheDocument();
    expect(screen.queryByText("Secret Supper")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mountain Friends" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Preview only — member names and content stay private.").length).toBeGreaterThan(0);
  });

  it("gate: private groups are not available, requested groups show the preview only", async () => {
    renderSocial(<SocialGroupGate><p>inside</p></SocialGroupGate>, { path: "/social/groups/supper" });
    expect(await screen.findByRole("heading", { name: "This group isn’t available" })).toBeInTheDocument();
    expect(screen.queryByText("inside")).not.toBeInTheDocument();
  });

  it("gate: a join request sees the public preview, never the inside", async () => {
    renderSocial(<SocialGroupGate><p>inside</p></SocialGroupGate>, { path: "/social/groups/darband" });
    expect(await screen.findByRole("heading", { name: "Join requested" })).toBeInTheDocument();
    expect(screen.queryByText("inside")).not.toBeInTheDocument();
  });
});

describe("SO-05 / SO-07 / SO-08 money and RSVP", () => {
  it("activity expenses: proposed is not counted; balance shows approved shares only", async () => {
    renderSocial(<ActivityExpensesScreen />, { path: "/social/activities/alborz/expenses", params: { id: "alborz" } });
    expect((await screen.findAllByText(/^\+9,610,000\s+T$/)).length).toBeGreaterThan(0);
    expect(screen.getByText("Proposed · not counted")).toBeInTheDocument();
    expect(screen.getByText(/approved items only \(19,450,000\s+T\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settle up" })).toBeInTheDocument();
  });

  it("expense detail: approver can approve a proposal; it then counts", async () => {
    const { repository } = renderSocial(<ExpenseDetailScreen />, { path: "/social/groups/mountain/expenses/x-fuel", params: { id: "mountain", eid: "x-fuel" } });
    await userEvent.click(await screen.findByRole("button", { name: "Approve expense" }));
    expect((await repository.expenses.get("x-fuel")).status).toBe("approved");
    expect((await repository.balances.forScope({ kind: "activity", id: "alborz" })).approvedTotal).toBe(21_250_000);
  });

  it("full activity offers the waitlist instead of a spot", async () => {
    renderSocial(<ActivityScreen />, { path: "/social/activities/futsal", params: { id: "futsal" } });
    expect(await screen.findByText("Full · waitlist")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Join waitlist" }));
    expect(await screen.findByRole("heading", { name: "You’re #1 on the waitlist" })).toBeInTheDocument();
  });
});

describe("SO-17 Persian RTL", () => {
  it("shows Toman with Persian digits and the sign after the number, never a cross-currency total", async () => {
    renderSocial(<MyBalancesScreen />, { path: "/social/balances", preferences: preferencesForLocale("fa") });
    const totals = await screen.findByRole("region", { name: "خالص به تفکیک ارز" });
    expect(within(totals).getByText(/^۱۰٬۰۶۰٬۰۰۰\s+\+\s+تومان$/)).toBeInTheDocument();
    expect(within(totals).getAllByText(/لیر/).length).toBeGreaterThan(0);
  });
});
