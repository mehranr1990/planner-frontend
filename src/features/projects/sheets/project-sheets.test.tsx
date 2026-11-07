import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectSheetHost } from "./project-sheet-host";
import { projectSheetHref } from "./project-sheet-params";

function renderHost(pathname: string, search: string) {
  setMockPathname(pathname);
  setMockSearch(search);
  return renderWithProviders(<ProjectSheetHost />);
}

afterEach(() => resetToasts());

describe("PJ-90 · project sheets", () => {
  it("builds sheet URLs that keep other params and drop the sheet's own on close", () => {
    expect(projectSheetHref("/projects/a/tasks", "view=mine", "assignment-reassign", { task: "t1" })).toBe(
      "/projects/a/tasks?view=mine&sheet=assignment-reassign&task=t1",
    );
    expect(projectSheetHref("/projects/a/tasks", "view=mine&sheet=assignment-reassign&task=t1", null)).toBe(
      "/projects/a/tasks?view=mine",
    );
  });

  it("project-new: Team/Company association disabled for a later phase; Create & invite opens the invite sheet", async () => {
    const user = userEvent.setup();
    renderHost("/projects", "sheet=project-new");
    const sheet = await screen.findByRole("dialog", { name: "New project" });
    const association = within(sheet).getByRole("group", { name: "" });
    expect(association).toHaveAttribute("aria-disabled", "true");
    expect(association).toHaveAccessibleDescription("Available in a later phase");
    expect(within(sheet).getByText("Owner: You · independent project")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Create & invite" }));
    expect(within(sheet).getByText("Give the project a name")).toBeInTheDocument();
    await user.type(within(sheet).getByRole("textbox", { name: "Project name" }), "Help Center");
    await user.click(within(sheet).getByRole("radio", { name: "Website" }));
    await user.click(within(sheet).getByRole("button", { name: "Create & invite" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/projects/help-center?sheet=project-invite"));
    expect(await screen.findByText("Help Center created")).toBeInTheDocument();
  });

  it("project-new: key suggested from the name, validated and checked for uniqueness; visibility defaults to Private", async () => {
    const user = userEvent.setup();
    renderHost("/projects", "sheet=project-new");
    const sheet = await screen.findByRole("dialog", { name: "New project" });
    const visibility = within(sheet).getByRole("radiogroup", { name: "Visibility" });
    const radios = within(visibility).getAllByRole("radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]).toHaveAccessibleName(/Private/);
    expect(radios[0]).toBeChecked();
    expect(within(sheet).getByText("More options come with Teams and Companies")).toBeInTheDocument();

    const key = within(sheet).getByRole("textbox", { name: "Project key" });
    expect(key).toHaveAccessibleDescription(/Used as the task prefix, e.g. WEB-12/);
    await user.type(within(sheet).getByRole("textbox", { name: "Project name" }), "Website");
    // WEB belongs to Website Redesign: the suggestion takes the first unused one.
    expect(key).toHaveValue("WEB2");
    await user.clear(key);
    await user.type(key, "web");
    expect(await within(sheet).findByText("Another project already uses this key")).toBeInTheDocument();
    expect(key).toHaveAttribute("aria-invalid", "true");

    await user.clear(key);
    await user.type(key, "1");
    await user.tab();
    expect(within(sheet).getByText("Use 2–10 capital letters (A–Z) or digits, starting with a letter")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Create & invite" }));
    expect(routerPush).not.toHaveBeenCalledWith(expect.stringContaining("sheet=project-invite"));

    await user.clear(key);
    await user.type(key, "site2");
    expect(key).toHaveValue("SITE2");
    await waitFor(() => expect(key).not.toHaveAttribute("aria-invalid"));
    await user.click(within(sheet).getByRole("button", { name: "Create & invite" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/projects/website?sheet=project-invite"));
  });

  it("project-invite (Owner): roles with descriptions, verified-only copy, pending with resend / cancel", async () => {
    const user = userEvent.setup();
    renderHost("/projects/mobile-onboarding", "sheet=project-invite");
    const sheet = await screen.findByRole("dialog", { name: "Invite to Mobile Onboarding" });
    const roles = within(sheet).getByRole("radiogroup", { name: "Role" });
    expect(
      within(roles)
        .getAllByRole("radio")
        .map((radio) => radio.firstChild?.textContent),
    ).toEqual(["Admin", "Manager", "Member", "Viewer", "Task-only access"]);
    expect(within(sheet).getByText(/we never say whether an account exists/)).toBeInTheDocument();
    const pending = await within(sheet).findByRole("region", { name: "Pending · 1" });
    expect(pending).toHaveTextContent("nima@studio.ir");
    await user.click(within(pending).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Invitation to nima@studio.ir cancelled")).toBeInTheDocument();

    await user.type(within(sheet).getByRole("textbox", { name: "Emails" }), "kian@araxitis.com{Enter}");
    expect(within(sheet).getByRole("button", { name: "Remove kian@araxitis.com" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Send invitations" }));
    expect(await screen.findByText("Invitation sent")).toBeInTheDocument();
  });

  it("project-invite (Manager): explains the missing right instead of the form", async () => {
    renderHost("/projects/website-redesign", "sheet=project-invite");
    const sheet = await screen.findByRole("dialog", { name: "Invite to Website Redesign" });
    expect(await within(sheet).findByText("Your role can’t invite — ask an Admin")).toBeInTheDocument();
  });

  it("assignment-reassign: decline reason, member load (project estimates), pending for the new person", async () => {
    const user = userEvent.setup();
    renderHost("/projects/website-redesign/tasks", "sheet=assignment-reassign&task=empty-states");
    const sheet = await screen.findByRole("dialog", { name: "Reassign “Empty states”" });
    expect(await within(sheet).findByText("Declined by Arash P.")).toBeInTheDocument();
    expect(within(sheet).getByText("“no capacity this sprint”")).toBeInTheDocument();
    const list = within(sheet).getByRole("radiogroup", { name: "New assignee" });
    await waitFor(() =>
      expect(within(list).getByRole("radio", { name: /Kian F\./ })).toHaveTextContent("34h / 30h · over"),
    );
    expect(within(sheet).getByText("Load shows project estimates only.")).toBeInTheDocument();
    await user.click(within(list).getByRole("radio", { name: /Jonathan K\./ }));
    await user.click(within(sheet).getByRole("button", { name: "Reassign" }));
    // The new person now holds a pending assignment.
    expect(await within(sheet).findByText("Pending · Jonathan K.")).toBeInTheDocument();
  });

  it("ignores Personal sheet ids", () => {
    renderHost("/projects", "sheet=quick-add");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
