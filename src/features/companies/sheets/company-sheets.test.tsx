import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { CompanyDataProvider } from "@/data/company-provider";
import { createMockCompanies } from "@/data/mock/mock-companies";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { CompanySheetHost } from "./company-sheet-host";

function renderHost(path: string, search: string) {
  setMockPathname(path);
  setMockSearch(search);
  const repository = createMockCompanies();
  renderWithProviders(
    <CompanyDataProvider repository={repository}>
      <CompanySheetHost />
    </CompanyDataProvider>,
  );
  return repository;
}

afterEach(() => resetToasts());

describe("CO-90 · company sheets", () => {
  it("company-new: the creator becomes Owner; currency lock note; opens the new company", async () => {
    const user = userEvent.setup();
    const repository = renderHost("/companies", "sheet=company-new");
    const sheet = await screen.findByRole("dialog", { name: "New company" });
    expect(sheet).toHaveTextContent("Currency is fixed after the first approved expense");
    await user.click(within(sheet).getByRole("button", { name: "Create company" }));
    expect(within(sheet).getByText("Enter a name")).toBeInTheDocument();
    await user.type(within(sheet).getByRole("textbox", { name: "Name" }), "Kavir");
    await user.type(within(sheet).getByRole("textbox", { name: "First departments (optional)" }), "Ops, Sales");
    await user.click(within(sheet).getByRole("button", { name: "Create company" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/^\/companies\/co-/)));
    const created = (await repository.list()).companies.find((company) => company.name === "Kavir")!;
    expect(created.role).toBe("owner");
    expect((await repository.departments(created.id)).map((dept) => dept.name)).toEqual(["Ops", "Sales"]);
  });

  it("company-invite: verified-only copy, role / department / position / supervisor", async () => {
    const user = userEvent.setup();
    renderHost("/companies/euroly/people", "sheet=company-invite");
    const sheet = await screen.findByRole("dialog", { name: "Invite to Euroly" });
    expect(sheet).toHaveTextContent("we never say whether an account exists");
    await user.click(within(sheet).getByRole("button", { name: "Send invitation" }));
    expect(within(sheet).getByText("Enter a work email")).toBeInTheDocument();
    expect(within(sheet).getByText("Choose a department")).toBeInTheDocument();
  });

  it("department-new: shows the inherited policies summary line", async () => {
    renderHost("/companies/euroly/departments", "sheet=department-new");
    const sheet = await screen.findByRole("dialog", { name: "New department" });
    expect(await within(sheet).findByText("Inherits 5 company policies (2 mandatory)")).toBeInTheDocument();
  });

  it("expense-new: receipt first; the policy needs a receipt to submit, a draft doesn't", async () => {
    const user = userEvent.setup();
    const repository = renderHost("/companies/euroly/expenses", "sheet=expense-new");
    const sheet = await screen.findByRole("dialog", { name: "New expense" });
    expect(within(sheet).getByText("Drop receipt or take a photo")).toBeInTheDocument();
    await user.type(within(sheet).getByRole("textbox", { name: "What for" }), "Client dinner");
    await user.type(within(sheet).getByRole("textbox", { name: "Amount (T)" }), "4,200,000");
    await user.click(within(sheet).getByRole("button", { name: "Submit" }));
    expect(await within(sheet).findByText(/attach the receipt to submit/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Save draft" }));
    await waitFor(async () => expect((await repository.expenses("euroly")).some((item) => item.title === "Client dinner" && item.status === "draft" && item.amount === 4_200_000)).toBe(true));
  });
});
