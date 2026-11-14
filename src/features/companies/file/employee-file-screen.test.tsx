import { screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { asDesktop, renderCompanyScreen } from "../test-utils";
import { EmployeeFileScreen } from "./employee-file-screen";

afterEach(() => resetToasts());

// jsdom lacks the pointer-capture and scrolling APIs Radix Select calls.
beforeAll(() => {
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe("CO-12 · Employee file (sealed)", () => {
  it("is sealed for Org Admin without a grant; Request access is logged", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<EmployeeFileScreen />, { path: "/companies/euroly/people/p-harry/file" });
    expect(await screen.findByText("Employee file · sealed")).toBeInTheDocument();
    expect(screen.getByText(/do NOT get access by role/)).toBeInTheDocument();
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request access" }));
    await waitFor(async () => expect((await repository.audit("euroly"))[0]).toMatchObject({ action: "requested employee file access" }));
  });

  it("with an HR grant: grant banner, documents with per-doc grants, corrective action, audited open", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<EmployeeFileScreen />, { path: "/companies/euroly/people/p-katy/file" });
    const card = await screen.findByRole("region", { name: "Katy F." });
    expect(screen.getByText(/access granted to you until/)).toBeInTheDocument();
    expect(card).toHaveTextContent("HR + Harry B.");
    const corrective = screen.getByRole("region", { name: "Corrective actions" });
    expect(corrective).toHaveTextContent("Missed security training");
    expect(corrective).toHaveTextContent("I was on leave");
    expect((await repository.audit("euroly"))[0]).toMatchObject({ kind: "file", subject: "Katy F. · employee file" });
    await user.click(screen.getByRole("button", { name: "Access log" }));
    expect(await screen.findByRole("dialog", { name: "Access log (the employee can see it too)" })).toHaveTextContent("opened file (grant: HR reviewer)");
  });

  it("the employee sees their own file and its access log", async () => {
    renderCompanyScreen(<EmployeeFileScreen />, { path: "/companies/euroly/people/p-mehran/file" });
    expect(await screen.findByText("Your own file · you see who opened it")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Access log" })).toBeInTheDocument();
  });

  it("a corrective action needs a reviewer (another Owner / Org Admin) before it opens", async () => {
    const restore = asDesktop();
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<EmployeeFileScreen />, { path: "/companies/euroly/people/p-katy/file" });
    await user.click(await screen.findByRole("button", { name: "Open corrective action" }));
    const dialog = await screen.findByRole("dialog", { name: "Open corrective action" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "Missed onboarding");
    await user.type(within(dialog).getByRole("textbox", { name: "Evidence (required)" }), "log.csv");
    await user.click(within(dialog).getByRole("button", { name: "Open" }));
    expect(await within(dialog).findByText("Choose who reviews this action")).toBeInTheDocument();
    within(dialog).getByRole("combobox", { name: "Reviewer" }).focus();
    await user.keyboard("{Enter}");
    const option = await screen.findByRole("option", { name: "Navid E." });
    expect(screen.queryByRole("option", { name: "Mehran R." })).not.toBeInTheDocument();
    act(() => option.focus());
    await user.keyboard("{Enter}");
    await user.click(within(dialog).getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const file = await repository.employeeFile("euroly", "p-katy");
    expect(file.status === "open" && file.corrective[0]?.reason).toBe("Missed onboarding");
    restore();
  });
});
