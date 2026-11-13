import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { asDesktop, renderCompanyScreen } from "../test-utils";
import { CompanySettingsScreen } from "./company-settings-screen";

afterEach(() => resetToasts());

describe("CO-14 · Company settings", () => {
  it("General: currency is locked after the first approved expense", async () => {
    renderCompanyScreen(<CompanySettingsScreen />, { path: "/companies/euroly/settings" });
    expect(await screen.findByRole("tablist", { name: "Settings sections" })).toBeInTheDocument();
    expect(screen.getByText("Locked after the first approved expense (one currency per company).")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled();
  });

  it("Approval chains: edit a step into a draft, then publish for new requests only", async () => {
    const restore = asDesktop();
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<CompanySettingsScreen />, { path: "/companies/euroly/settings", search: "tab=chains" });
    const steps = await screen.findByRole("list", { name: "Sequential steps" });
    expect(steps).toHaveTextContent("if amount > 50,000,000 T");
    await user.click(within(steps).getByRole("button", { name: "Edit step 1" }));
    const dialog = await screen.findByRole("dialog");
    const days = within(dialog).getByRole("textbox", { name: "Escalate after (days)" });
    await user.clear(days);
    await user.type(days, "2");
    await user.click(within(dialog).getByRole("button", { name: "Save to draft" }));
    const publish = await screen.findByRole("button", { name: "Publish v4" });
    expect(screen.getByText(/applies to new requests only/)).toBeInTheDocument();
    await user.click(publish);
    await waitFor(async () => expect((await repository.chains("euroly")).find((chain) => chain.subject === "expenses")?.version).toBe(4));
    expect((await repository.approvals("euroly")).find((item) => item.id === "ap-travel")?.chainVersion).toBe(3);
    restore();
  });

  it("Lifecycle is Owner-only; Org Admin sees why", async () => {
    renderCompanyScreen(<CompanySettingsScreen />, { path: "/companies/euroly/settings", search: "tab=lifecycle" });
    expect(await screen.findByText("Only the Owner can transfer, archive or delete")).toBeInTheDocument();
  });

  it("Owner: transfer needs an eligible Org Admin and re-authentication", async () => {
    renderCompanyScreen(<CompanySettingsScreen />, { path: "/companies/euroly/settings", search: "tab=lifecycle&state=as-owner" });
    expect(await screen.findByRole("heading", { name: "Transfer administrative ownership" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete company" })).toBeInTheDocument();
    expect(screen.getByText(/retention holds are kept/)).toBeInTheDocument();
  });
});
