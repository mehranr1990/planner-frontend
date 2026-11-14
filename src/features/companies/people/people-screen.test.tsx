import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { CompanyPeopleScreen } from "./people-screen";

afterEach(() => resetToasts());

// jsdom lacks the pointer-capture and scrolling APIs Radix Select calls.
beforeAll(() => {
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe("CO-03 · People", () => {
  it("All lists departments as rows; a department pill shows the workload card with bars for Org Admin", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<CompanyPeopleScreen />, { path: "/companies/euroly/people" });
    const pills = await screen.findByRole("radiogroup", { name: "Departments" });
    expect(within(pills).getByRole("radio", { name: "All 82" })).toBeChecked();
    expect(screen.getByRole("region", { name: "Departments · people & workload" })).toBeInTheDocument();
    await user.click(within(pills).getByRole("radio", { name: "Design 9" }));
    expect(await screen.findByText("Design · people & workload")).toBeInTheDocument();
    expect(screen.getByText(/Workload = booked estimates/)).toBeInTheDocument();
  });

  it("shows the work profile card (not the file) and requests sealed-file access", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<CompanyPeopleScreen />, { path: "/companies/euroly/people" });
    const card = await screen.findByRole("region", { name: "Katy F." });
    expect(card).toHaveTextContent("Design Engineer · Design · Engineering");
    expect(card).toHaveTextContent("MacBook Pro 14 · Monitor 27″");
    expect(card).toHaveTextContent("Employee file · sealed");
    expect(within(card).getByRole("button", { name: "Edit work profile" })).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Request access" }));
    await waitFor(() => expect(within(card).getByRole("link", { name: "Access requested" })).toHaveAttribute("href", "/companies/euroly/people/p-katy/file"));
  });

  it("dept-scoped Member: status only, other departments as names only, no invite", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<CompanyPeopleScreen />, { path: "/companies/euroly/people", search: "state=as-member" });
    const pills = await screen.findByRole("radiogroup", { name: "Departments" });
    await user.click(within(pills).getByRole("radio", { name: "Design 9" }));
    expect(await screen.findByText(/Status only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument();
    const katy = screen.getByRole("region", { name: "Katy F." });
    expect(within(katy).getByText("Outside your department")).toBeInTheDocument();
    expect(within(katy).queryByRole("button", { name: "Request access" })).not.toBeInTheDocument();
  });

  it("moves an employee's department seat after a server preview", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<CompanyPeopleScreen />, { path: "/companies/euroly/people" });
    const card = await screen.findByRole("region", { name: "Katy F." });
    expect(card).toHaveTextContent("DepartmentDesign · Engineering");
    await user.click(within(card).getByRole("button", { name: "Move" }));
    const dialog = await screen.findByRole("dialog", { name: "Move Katy F. to another department" });
    const confirm = within(dialog).getByRole("button", { name: "Move" });
    expect(confirm).toBeDisabled();
    const pick = async (field: string, name: string) => {
      within(dialog).getByRole("combobox", { name: field }).focus();
      await user.keyboard("{Enter}");
      const option = await screen.findByRole("option", { name });
      act(() => option.focus());
      await user.keyboard("{Enter}");
    };
    await pick("From", "Design");
    await pick("To", "Marketing");
    expect(await within(dialog).findByText("Ready to move")).toBeInTheDocument();
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("region", { name: "Katy F." })).toHaveTextContent("DepartmentMarketing · Engineering"));
  });

  it("never offers a move for your own seat or to a member", async () => {
    const user = userEvent.setup();
    renderCompanyScreen(<CompanyPeopleScreen />, { path: "/companies/euroly/people", search: "state=as-member" });
    const pills = await screen.findByRole("radiogroup", { name: "Departments" });
    await user.click(within(pills).getByRole("radio", { name: "Design 9" }));
    await screen.findByRole("region", { name: "Katy F." });
    expect(screen.queryByRole("button", { name: "Move" })).not.toBeInTheDocument();
  });
});
