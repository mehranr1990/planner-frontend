import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { DepartmentsScreen } from "./departments-screen";

afterEach(() => resetToasts());

describe("CO-02 · Departments", () => {
  it("shows the tree, the department signature card and the inherited policies", async () => {
    renderCompanyScreen(<DepartmentsScreen />, { path: "/companies/euroly/departments" });
    const tree = await screen.findByRole("tree", { name: "Organisation tree" });
    expect(within(tree).getByRole("treeitem", { name: /Euroly/ })).toHaveAttribute("aria-expanded", "true");
    const engineering = within(tree).getByRole("treeitem", { name: /^Engineering/ });
    expect(engineering).toHaveAttribute("aria-selected", "true");
    expect(within(tree).getByRole("treeitem", { name: /QA unit/ })).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Engineering" });
    expect(card).toHaveTextContent("Manager Dariush K. · parent Euroly · 24 people");
    expect(within(card).getByRole("button", { name: "Edit department" })).toBeInTheDocument();
    const policies = screen.getByRole("region", { name: "Policies here" });
    expect(await within(policies).findByText("Two-step sign-in")).toBeInTheDocument();
    expect(policies).toHaveTextContent("overridden to Sat – Thu");
  });

  it("overrides a Default policy only with a reason", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<DepartmentsScreen />, { path: "/companies/euroly/departments" });
    const tree = await screen.findByRole("tree", { name: "Organisation tree" });
    await user.click(within(tree).getByRole("treeitem", { name: /^Designs?9/ }));
    const policies = screen.getByRole("region", { name: "Policies here" });
    await user.click((await within(policies).findAllByRole("button", { name: "Default · override" }))[0]!);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Override" }));
    expect(within(dialog).getByText("Add a reason")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Launch week");
    await user.click(within(dialog).getByRole("button", { name: "Override" }));
    await waitFor(() => expect(policies).toHaveTextContent("Default · overridden"));
  });

  it("dept-scoped roles see other departments as names only", async () => {
    renderCompanyScreen(<DepartmentsScreen />, { path: "/companies/euroly/departments", search: "state=as-member" });
    const card = await screen.findByRole("region", { name: "Engineering" });
    expect(within(card).getByText("Outside your department")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });
});
