import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "./project-gate";
import { ProjectModulePlaceholder } from "./project-module-placeholder";
import { projectModuleSegments } from "./project-modules";

function renderGate(path: string, search = "") {
  setMockPathname(path);
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <ProjectModulePlaceholder module={projectModuleSegments[path.split("/")[3] ?? ""] ?? "overview"} />
    </ProjectGate>,
  );
}

describe("ProjectGate (SH-02)", () => {
  it("renders the coming-soon module page with the project breadcrumb", async () => {
    renderGate("/projects/website-redesign/timeline");
    expect(await screen.findByRole("heading", { level: 1, name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Website Redesign");
    expect(screen.getByText("Timeline is coming soon")).toBeInTheDocument();
  });

  it("shows the same not-available screen for unknown and forbidden projects", async () => {
    renderGate("/projects/secret-project");
    expect(
      await screen.findByRole("heading", {
        name: "This project isn’t available",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my projects" })).toHaveAttribute("href", "/projects");
    expect(screen.queryByText("secret-project")).not.toBeInTheDocument();
  });

  it("shows a pending invitation as a public-safe preview and accepts it", async () => {
    const user = userEvent.setup();
    renderGate("/projects/data-migration");
    expect(
      await screen.findByRole("heading", {
        name: "You’re invited to “Data Migration”",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sara P\. invited you as Member/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(routerReplace).toHaveBeenCalledWith("/projects/data-migration");
  });

  it("shows revoked access", async () => {
    renderGate("/projects/old-agency");
    expect(await screen.findByRole("heading", { name: "Your access was removed" })).toBeInTheDocument();
  });

  it.each([
    ["error", "Couldn’t load this page"],
    ["unauthenticated", "Sign in to continue"],
    ["not-available", "This project isn’t available"],
    ["revoked", "Your access was removed"],
    ["deleted", "This task was deleted"],
    ["invite-pending", "You’re invited to “Data Migration”"],
  ])("demo state %s renders its full-page template", async (state, title) => {
    renderGate("/projects/website-redesign", `state=${state}`);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
  });

  it.each([
    ["read-only", "You’re a Viewer in this project · editing is off"],
    ["guest", "Limited access · you see 3 shared tasks only"],
    ["offline", "Offline · showing last loaded version"],
    ["conflict", "Updated by Sara P. a moment ago"],
  ])("demo state %s shows one banner under the header", async (state, text) => {
    renderGate("/projects/website-redesign/tasks", `state=${state}`);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(document.querySelectorAll("[data-banner]")).toHaveLength(1);
  });

  it("archived: banner with the date, no Restore for a Manager", async () => {
    renderGate("/projects/website-redesign/tasks", "state=archived");
    expect(await screen.findByText(/^Archived .* · read-only$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("loading shows the skeleton; the demo switch lists every state", () => {
    renderGate("/projects/website-redesign", "state=loading");
    expect(screen.getByRole("status", { name: "Loading" })).toHaveAttribute("aria-busy", "true");
    const select = screen.getByRole("combobox", { name: "Demo state" });
    expect(select.querySelectorAll("option")).toHaveLength(17);
  });

  it("page states (pending) are reachable on module pages", async () => {
    renderGate("/projects/website-redesign/files", "state=pending");
    expect(await screen.findByText("Pending approval")).toBeInTheDocument();
  });
});
