import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { CompanyGoalsScreen } from "./company-goals-screen";

afterEach(() => resetToasts());

describe("CO-05 · Company goals", () => {
  it("shows the cascade with linked work and KR sources; no composite score", async () => {
    renderCompanyScreen(<CompanyGoalsScreen />, { path: "/companies/euroly/goals" });
    const tree = await screen.findByRole("list", { name: "Goal cascade" });
    expect(within(tree).getByRole("button", { name: /Grow recurring revenue 30%/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(tree).getByRole("link", { name: /Planner App/ })).toHaveAttribute("href", "/projects/planner-app");
    const card = screen.getByRole("region", { name: "Grow recurring revenue 30%" });
    expect(card).toHaveTextContent("auto · child goals on pace (2/3)");
    expect(card).toHaveTextContent("manual · updated by Leila M.");
    expect(within(card).getByRole("button", { name: "Open linked work" })).toBeInTheDocument();
  });

  it("the goal owner updates manual key results from the notch", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<CompanyGoalsScreen />, { path: "/companies/euroly/goals" });
    const tree = await screen.findByRole("list", { name: "Goal cascade" });
    await user.click(within(tree).getByRole("button", { name: /Relaunch the brand site/ }));
    const card = screen.getByRole("region", { name: "Relaunch the brand site" });
    await user.click(within(card).getByRole("button", { name: "Update progress" }));
    const dialog = await screen.findByRole("dialog", { name: "Update progress" });
    const input = within(dialog).getByRole("textbox");
    await user.clear(input);
    await user.type(input, "48");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Relaunch the brand site" })).toHaveTextContent("48 / 48"));
  });
});
