import { ApiHttpError } from "@/api/errors";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createApiCompanyRepository } from "@/data/api/api-company-repository";
import { fakeApi, json } from "@/data/api/test-support";
import { CompanyDataProvider } from "@/data/company-provider";
import type { CompanyRepository } from "@/data/company-repositories";
import { RepositoryError } from "@/data/repositories";
import { createMockCompanies } from "@/data/mock/mock-companies";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { CompanySheetHost } from "./company-sheet-host";

function renderHost(path: string, search: string, repository: CompanyRepository = createMockCompanies()) {
  setMockPathname(path);
  setMockSearch(search);
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
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith(expect.stringMatching(/^\/companies\/co-/)));
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

  it("company-invite in live mode: no position / supervisor (set after joining); a refusal names its cause", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    // Radix Select scrolls the chosen option into view; jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView ??= () => {};
    try {
      const user = userEvent.setup();
      const repository = createMockCompanies();
      vi.spyOn(repository, "invite").mockRejectedValueOnce(new RepositoryError("conflict", "pending"));
      renderHost("/companies/euroly/people", "sheet=company-invite", repository);
      const sheet = await screen.findByRole("dialog", { name: "Invite to Euroly" });
      expect(within(sheet).queryByText("Position")).not.toBeInTheDocument();
      expect(within(sheet).queryByText("Supervisor")).not.toBeInTheDocument();
      expect(sheet).toHaveTextContent("Position and supervisor are set on their staff profile after they join.");
      await user.type(within(sheet).getByRole("textbox", { name: "Work email" }), "sara@example.com");
      await user.click(within(sheet).getByRole("combobox", { name: "Department" }));
      await user.click((await screen.findAllByRole("option"))[0]!);
      await user.click(within(sheet).getByRole("button", { name: "Send invitation" }));
      expect(await within(sheet).findByText("This person already has a pending invitation or is already a member.")).toBeInTheDocument();
      expect(repository.invite).toHaveBeenCalledWith("euroly", expect.objectContaining({ position: "", supervisorId: null }));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("company-invite: a server error says so and shows the request id for the operator", async () => {
    Element.prototype.scrollIntoView ??= () => {};
    const user = userEvent.setup();
    const repository = createMockCompanies();
    vi.spyOn(repository, "invite").mockRejectedValueOnce(new ApiHttpError(500, undefined, "req-123"));
    renderHost("/companies/euroly/people", "sheet=company-invite", repository);
    const sheet = await screen.findByRole("dialog", { name: "Invite to Euroly" });
    await user.type(within(sheet).getByRole("textbox", { name: "Work email" }), "sara@example.com");
    await user.click(within(sheet).getByRole("combobox", { name: "Department" }));
    await user.click((await screen.findAllByRole("option"))[0]!);
    await user.click(within(sheet).getByRole("button", { name: "Send invitation" }));
    expect(await within(sheet).findByText(/The server couldn’t send the invitation/)).toBeInTheDocument();
    expect(within(sheet).getByText("Request id for the operator: req-123")).toBeInTheDocument();
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

  it("company-new in live mode goes through the API: no approved COMPANY policy → actionable message, nothing created, no mock fallback", async () => {
    const user = userEvent.setup();
    const api = fakeApi((_call, parts) => (parts[0] === "retention-policies" ? json({ items: [], nextCursor: null }) : json({ items: [], nextCursor: null })));
    routerReplace.mockClear();
    renderHost("/companies", "sheet=company-new", createApiCompanyRepository(api.client));
    const sheet = await screen.findByRole("dialog", { name: "New company" });
    await user.type(within(sheet).getByRole("textbox", { name: "Name" }), "Kavir");
    await user.click(within(sheet).getByRole("button", { name: "Create company" }));
    expect(await within(sheet).findByText(/Creating companies isn’t enabled on this server yet/)).toBeInTheDocument();
    expect(api.calls.some((call) => call.path === "/retention-policies")).toBe(true);
    expect(api.writes()).toEqual([]);
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("company-new: one request while pending (no double submit); permission / incomplete-setup refusals read accurately", async () => {
    const user = userEvent.setup();
    const repository = createMockCompanies();
    let release: (value: never) => void = () => undefined;
    const create = vi.spyOn(repository, "create").mockImplementationOnce(() => new Promise<never>((_resolve, reject) => (release = reject)));
    renderHost("/companies", "sheet=company-new", repository);
    const sheet = await screen.findByRole("dialog", { name: "New company" });
    await user.type(within(sheet).getByRole("textbox", { name: "Name" }), "Kavir");
    const submit = within(sheet).getByRole("button", { name: "Create company" });
    await user.click(submit);
    await waitFor(() => expect(submit).toHaveAttribute("aria-disabled", "true"));
    await user.click(submit);
    expect(create).toHaveBeenCalledTimes(1);
    release(new RepositoryError("forbidden", "Not allowed") as never);
    expect(await within(sheet).findByText("Your account isn’t allowed to create companies.")).toBeInTheDocument();
    create.mockRejectedValueOnce(new RepositoryError("partial", "Company created; setup incomplete"));
    await user.click(submit);
    expect(await within(sheet).findByText("The company was created, but its setup didn’t finish. Submit again to complete it.")).toBeInTheDocument();
  });
});
