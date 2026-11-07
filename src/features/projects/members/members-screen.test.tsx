import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { MembersScreen } from "./members-screen";

function renderMembers(search = "") {
  setMockPathname("/projects/website-redesign/members");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <MembersScreen />
    </ProjectGate>,
  );
}

const rowOf = (name: RegExp) => screen.getByText(name).closest("li")!;

describe("PJ-13 · Members", () => {
  it("rows with role, capacity, open tasks; the Owner has no role popover; guide and pending invitations", async () => {
    renderMembers();
    await screen.findByText("Mehran R. (you)");
    const owner = rowOf(/^Sara P\.$/);
    expect(within(owner).getByText("Owner")).toBeInTheDocument();
    expect(within(owner).queryByRole("button", { name: /Role of/ })).not.toBeInTheDocument();
    const kian = rowOf(/^Kian F\.$/);
    expect(within(kian).getByRole("button", { name: "Role of Kian F.: Member" })).toBeInTheDocument();
    expect(within(kian).getByRole("button", { name: /Capacity of Kian F\.: 32h/ })).toBeInTheDocument();
    expect(kian).toHaveTextContent(/\d+ open/);
    expect(rowOf(/^Ava R\.$/)).toHaveTextContent("Grant: 2 tasks · until");
    expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pending invitations" })).toBeInTheDocument();
  });

  it("role change applies at once with an Undo toast (Manager: Member / Viewer only)", async () => {
    const user = userEvent.setup();
    renderMembers();
    await screen.findByText("Mehran R. (you)");
    await user.click(screen.getByRole("button", { name: "Role of Kian F.: Member" }));
    const group = await screen.findByRole("radiogroup", { name: "Change role" });
    expect(within(group).queryByRole("radio", { name: "Admin" })).not.toBeInTheDocument();
    await user.click(within(group).getByRole("radio", { name: "Viewer" }));
    expect(await screen.findByText("Kian F. is now Viewer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Role of Kian F.: Viewer" })).toBeInTheDocument());
  });

  it("remove previews tasks becoming Unassigned; leave goes to /projects", async () => {
    const user = userEvent.setup();
    renderMembers();
    await screen.findByText("Mehran R. (you)");
    await user.click(screen.getByRole("button", { name: "More for Kian F." }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove from project" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Kian F." });
    expect(dialog).toHaveTextContent(/become Unassigned|No open tasks/);
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText(/^Kian F\.$/)).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "More for Mehran R." }));
    await user.click(await screen.findByRole("menuitem", { name: "Leave project" }));
    const leave = await screen.findByRole("dialog", { name: "Leave project" });
    await user.click(within(leave).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/projects"));
  });

  it("guests tab edits the task grant with expiry; viewers get no Invite and no menus", async () => {
    const user = userEvent.setup();
    const { unmount } = renderMembers("view=guests");
    const card = (await screen.findByRole("heading", { name: "Ava R." })).closest("article")!;
    await waitFor(() => expect(within(card).getAllByRole("checkbox", { checked: true })).toHaveLength(2));
    await user.click(within(card).getByRole("button", { name: "Edit grant" }));
    expect(within(card).getAllByRole("checkbox").length).toBeGreaterThan(2);
    unmount();
    renderMembers("state=read-only");
    await screen.findByText("Mehran R. (you)");
    expect(screen.queryByRole("button", { name: /Invite/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Role of/ })).not.toBeInTheDocument();
  });
});
