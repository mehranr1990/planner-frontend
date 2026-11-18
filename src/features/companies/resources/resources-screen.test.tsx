import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("Add resource offers only the context's resource types; an empty catalog explains itself and blocks Add", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<ResourcesScreen />, { path: "/companies/euroly/resources" });
    vi.spyOn(repository, "resourceTypes").mockResolvedValue([]);
    await user.click(await screen.findByRole("button", { name: "Add resource" }));
    const dialog = await screen.findByRole("dialog", { name: "Add resource" });
    expect(await within(dialog).findByText("No resource types are set up for this department yet")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();

  });

  it("Add resource sends the chosen configured type id", async () => {
    const user = userEvent.setup();
    const { repository } = renderCompanyScreen(<ResourcesScreen />, { path: "/companies/euroly/resources" });
    vi.spyOn(repository, "resourceTypes").mockResolvedValue([{ id: "t1", key: null, title: "Docking station" }]);
    const add = vi.spyOn(repository, "addResource");
    await user.click(await screen.findByRole("button", { name: "Add resource" }));
    const next = await screen.findByRole("dialog", { name: "Add resource" });
    expect((await within(next).findAllByText("Docking station")).length).toBeGreaterThan(0);
    await user.type(within(next).getByRole("textbox", { name: "Name" }), "Dock 1");
    await user.type(within(next).getByRole("textbox", { name: "Tag" }), "EU-DK-001");
    await user.click(within(next).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(add).toHaveBeenCalledWith("euroly", { name: "Dock 1", tag: "EU-DK-001", typeId: "t1", departmentId: null }));
  });
});
