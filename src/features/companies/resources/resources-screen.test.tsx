import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderCompanyScreen } from "../test-utils";
import { findConflict, ResourcesScreen } from "./resources-screen";

afterEach(() => resetToasts());

describe("CO-06 · Resources & capacity", () => {
  it("lists equipment with statuses and the request card; the reviewer approves from the notch", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<ResourcesScreen />, { path: "/companies/euroly/resources" });
    const filters = await screen.findByRole("radiogroup", { name: "Filter resources" });
    expect(within(filters).getByRole("radio", { name: "Requested 1" })).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "MacBook Pro 14 · EU-LT-021" });
    expect(await within(card).findByText("Request · waiting for you")).toBeInTheDocument();
    expect(card).toHaveTextContent("Prototype testing");
    await user.click(await within(card).findByRole("button", { name: "Approve request" }));
    await waitFor(async () => expect((await repository.resources("euroly")).find((item) => item.id === "r-2")?.status).toBe("assigned"));
  });

  it("capacity tab shows the department heat table with localized months", async () => {
    renderCompanyScreen(<ResourcesScreen />, { path: "/companies/euroly/resources", search: "tab=capacity" });
    const table = await screen.findByRole("table", { name: "Department capacity by month" });
    expect(within(table).getByRole("columnheader", { name: "Mehr" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "Engineering" }).closest("tr")).toHaveTextContent("104%");
  });

  it("suggests the next free date for a conflicting request", () => {
    const resource = { busy: [{ from: "2026-10-15", to: "2026-10-20" }] } as Parameters<typeof findConflict>[0];
    expect(findConflict(resource, "2026-10-18", "2026-10-19")?.suggestion).toEqual({ from: "2026-10-21", to: "2026-10-22" });
    expect(findConflict(resource, "2026-10-22", "2026-10-23")).toBeNull();
  });
});
