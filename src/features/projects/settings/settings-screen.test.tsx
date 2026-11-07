import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { SettingsScreen } from "./settings-screen";

function renderSettings(search = "", project = "website-redesign") {
  setMockPathname(`/projects/${project}/settings`);
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <SettingsScreen />
    </ProjectGate>,
  );
}

describe("PJ-14 · Project settings", () => {
  it("folder tabs; General edits show the dirty bar and switching tabs asks first", async () => {
    const user = userEvent.setup();
    renderSettings();
    const tabs = await screen.findByRole("tablist", { name: "Settings sections" });
    expect(within(tabs).getAllByRole("tab")).toHaveLength(6);
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /Workflow.*v4 draft/ })).toBeInTheDocument());
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Website 2026");
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeInTheDocument();
    await user.click(within(tabs).getByRole("tab", { name: /Fields/ }));
    expect(await screen.findByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stay" }));
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it("Workflow is read-only for Managers with the draft, matrix and statuses", async () => {
    renderSettings("tab=workflow");
    expect(await screen.findByText("Only Owners and Admins can change this.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Draft v4 · editing")).toBeInTheDocument());
    expect(screen.getByRole("table", { name: "Allowed transitions" })).toBeInTheDocument();
    expect(screen.getAllByText("QA").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Publish v4/ })).not.toBeInTheDocument();
  });

  it("Owner edits a draft workflow: add a status, toggle a transition, publish", async () => {
    const user = userEvent.setup();
    renderSettings("tab=workflow", "mobile-onboarding");
    await user.click(await screen.findByRole("button", { name: "Edit as draft v4" }));
    await user.click(await screen.findByRole("button", { name: "Add status" }));
    await waitFor(() => expect(screen.getAllByText("new").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /To do → New status 1/ }));
    const publish = await screen.findByRole("button", { name: "Publish v4" });
    expect(screen.getByText(/New transition To do → New status 1/)).toBeInTheDocument();
    await user.click(publish);
    expect(await screen.findByText(/Published v4/)).toBeInTheDocument();
  });

  it("Fields list with required toggles; Access has no Viewers-comment toggle", async () => {
    const { unmount } = renderSettings("tab=fields", "mobile-onboarding");
    expect(await screen.findByText("Add field")).toBeInTheDocument();
    unmount();
    renderSettings("tab=fields");
    expect(await screen.findByText("Customer impact")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Customer impact required" })).toBeChecked();
    await userEvent.setup().click(screen.getByRole("tab", { name: /Access/ }));
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
  });

  it("Import: upload → map → dry run → import with Undo", async () => {
    const user = userEvent.setup();
    renderSettings("tab=import");
    await screen.findByRole("button", { name: "Choose a CSV file" });
    const file = new File(["Title,Status,Due\nA,To do,2026-11-01\nB,QA,31/02\n"], "tasks.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("Choose a CSV file", { selector: "input" }), file);
    expect(await screen.findByText("2 rows found in tasks.csv")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dry run" }));
    expect(await screen.findByText("“QA” not in published workflow v3")).toBeInTheDocument();
    expect(screen.getByText("“31/02” is not a date")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import 1 task" }));
    expect(await screen.findByText("1 task imported")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("Lifecycle: Owner sees transfer + delete (name + password); Manager sees owner-only", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSettings("tab=lifecycle");
    expect(await screen.findByText("Only the Owner can do this.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete…" })).not.toBeInTheDocument();
    unmount();
    renderSettings("tab=lifecycle", "mobile-onboarding");
    await user.click(await screen.findByRole("button", { name: "Delete…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Mobile Onboarding?" });
    const submit = within(dialog).getByRole("button", { name: "Delete project" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Type the project name" }), "Mobile Onboarding");
    await user.type(within(dialog).getByLabelText("Password"), "wrong");
    await user.click(submit);
    expect(await within(dialog).findByText("That password didn’t work")).toBeInTheDocument();
  });
});
