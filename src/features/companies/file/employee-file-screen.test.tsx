import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { EmployeeFileScreen } from "./employee-file-screen";

afterEach(() => resetToasts());

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
});
