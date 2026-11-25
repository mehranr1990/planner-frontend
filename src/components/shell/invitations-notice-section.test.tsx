import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerPush } from "@/test/setup";
import { NotificationsPopover } from "./notifications-popover";

describe("bell: workspace invitations", () => {
  it("lists pending project / team / company invitations, counts them and answers in place", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsPopover />);
    await user.click(await screen.findByRole("button", { name: /^Notifications, \d+ unread$/ }));
    const section = await screen.findByRole("region", { name: "Invitations" });
    expect(await within(section).findByText("You’re invited to join Data Migration")).toBeInTheDocument();
    expect(await within(section).findByText("You’re invited to join Research Guild")).toBeInTheDocument();
    expect(await within(section).findByText("You’re invited to join Nova Labs")).toBeInTheDocument();

    const team = within(section).getByText("You’re invited to join Research Guild").closest("li")!;
    await user.click(within(team as HTMLElement).getByRole("button", { name: "Accept" }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/^\/teams\//));
  });
});
