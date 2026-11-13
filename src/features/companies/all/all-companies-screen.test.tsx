import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { CompanyDataProvider } from "@/data/company-provider";
import { createMockCompanies } from "@/data/mock/mock-companies";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { AllCompaniesScreen } from "./all-companies-screen";

function renderScreen(empty = false) {
  setMockPathname("/companies");
  setMockSearch("");
  return renderWithProviders(
    <CompanyDataProvider repository={createMockCompanies({ empty })}>
      <AllCompaniesScreen />
    </CompanyDataProvider>,
  );
}

afterEach(() => resetToasts());

describe("CO-00 · All companies", () => {
  it("lists my companies as cards with role, department, counts and approvals for me", async () => {
    renderScreen();
    expect(await screen.findByRole("heading", { name: "All companies", level: 1 })).toBeInTheDocument();
    const euroly = (await screen.findByRole("link", { name: "Euroly" })).closest("article")!;
    expect(euroly).toHaveTextContent("Org Admin");
    expect(euroly).toHaveTextContent("82 people");
    expect(euroly).toHaveTextContent("5 departments");
    expect(euroly).toHaveTextContent("4 approvals for you");
    expect(screen.getByRole("link", { name: "Araxitis" })).toHaveAttribute("href", "/companies/araxitis");
    const araxitis = screen.getByRole("link", { name: "Araxitis" }).closest("article")!;
    expect(araxitis).toHaveTextContent("Member · Design");
    expect(araxitis).not.toHaveTextContent("approvals for you");
  });

  it("filters with pills and shows the public-safe invitation; accepting opens the company", async () => {
    const user = userEvent.setup();
    renderScreen();
    const filters = await screen.findByRole("radiogroup", { name: "Filter companies" });
    expect(within(filters).getByRole("radio", { name: "All 2" })).toBeChecked();
    const strip = screen.getByRole("region", { name: "Nova Labs invited you as Member · Engineering" });
    expect(strip).toHaveTextContent("Your personal data stays private");
    await user.click(within(filters).getByRole("radio", { name: "Admin 1" }));
    expect(screen.queryByRole("link", { name: "Araxitis" })).not.toBeInTheDocument();
    await user.click(within(filters).getByRole("radio", { name: "All 2" }));
    const again = screen.getByRole("region", { name: "Nova Labs invited you as Member · Engineering" });
    await user.click(within(again).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/companies/nova-labs"));
  });

  it("shows the empty state with New company", async () => {
    const user = userEvent.setup();
    renderScreen(true);
    expect(await screen.findByText("No companies yet")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "New company" }).at(-1)!);
    expect(routerPush).toHaveBeenLastCalledWith("/companies?sheet=company-new", { scroll: false });
  });
});
