import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { ReimbursementsScreen } from "./reimbursements-screen";

afterEach(() => resetToasts());

describe("CO-11 · Reimbursements", () => {
  it("confirms an open payment run only with a reference; items become Settled", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<ReimbursementsScreen />, { path: "/companies/euroly/expenses/reimbursements" });
    const card = await screen.findByRole("region", { name: /15,050,000/ });
    expect(card).toHaveTextContent("The app never moves money");
    await user.click(within(card).getByRole("button", { name: "Confirm payment" }));
    expect(within(card).getByText("Add the payment reference")).toBeInTheDocument();
    await user.type(within(card).getByRole("textbox", { name: "Payment reference" }), "TRX-99");
    await user.click(within(card).getByRole("button", { name: "Confirm payment" }));
    await waitFor(async () => expect((await repository.reimbursements("euroly")).find((item) => item.id === "rb-course")?.status).toBe("settled"));
  });

  it("Mine: not received within 14 days; Record in my finance is explicit and idempotent", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<ReimbursementsScreen />, { path: "/companies/euroly/expenses/reimbursements" });
    await user.click(await screen.findByRole("radio", { name: "Mine 1" }));
    const list = screen.getByRole("region", { name: "My reimbursements" });
    expect(list).toHaveTextContent("Nothing is written to your Personal Finance automatically");
    expect(within(list).getByRole("button", { name: "Not received" })).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Record in my finance" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Record in my finance?" });
    await user.click(within(dialog).getByRole("button", { name: "Record in my finance" }));
    await waitFor(async () => expect((await repository.reimbursements("euroly")).find((item) => item.id === "rb-taxi")?.recordedInPersonal).toBe(true));
    expect(await within(list).findByText("Recorded in my finance")).toBeInTheDocument();
  });
});
