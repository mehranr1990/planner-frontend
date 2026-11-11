import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createMockTeams } from "@/data/mock/mock-teams";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { TeamTaskDetailView } from "./team-task-detail-view";

function renderDetail(taskId: string, search = "") {
  setMockPathname(`/teams/design/work/${taskId}`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamTaskDetailView taskId={taskId} variant="page" />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

describe("TM-15 · Team task detail", () => {
  it("head: signature card with Mark done, team status, Team chip, due and week plan", async () => {
    renderDetail("t-critique");
    expect(await screen.findByRole("heading", { level: 1, name: "Critique notes W42" })).toBeInTheDocument();
    const head = screen.getByRole("region", { name: "Critique notes W42" });
    expect(within(head).getByRole("button", { name: "Mark done" })).toBeInTheDocument();
    expect(head).toHaveTextContent("To do");
    expect(head).toHaveTextContent("Week plan W42");
  });

  it("assignment block: Accept adds it to Personal with Undo", async () => {
    const user = userEvent.setup();
    renderDetail("t-critique");
    const block = await screen.findByRole("region", { name: "Harry B. assigned this to you" });
    await user.click(within(block).getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Accepted · added to your tasks")).toBeInTheDocument();
  });

  it("properties: goal link and the related project task (link only, opens in its project)", async () => {
    renderDetail("t-critique");
    expect(await screen.findByRole("link", { name: "Design system v2" })).toHaveAttribute("href", "/teams/design/goals");
    expect(screen.getByRole("link", { name: "Project task “Design tokens” in Website Redesign" })).toHaveAttribute(
      "href",
      "/projects/website-redesign/tasks/design-4",
    );
  });

  it("hides a related project the viewer cannot open", async () => {
    renderDetail("t-icons");
    await screen.findByRole("heading", { level: 1, name: "Icon set v2" });
    expect(screen.queryByText(/Partner Portal/)).not.toBeInTheDocument();
    // Not assigned to me and not a Lead: the notch is Copy link (never empty).
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("comments use the PJ-15 component", async () => {
    const user = userEvent.setup();
    renderDetail("t-critique");
    expect(await screen.findByText("Please cover the onboarding spacing too.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Comment" }), "On it");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("On it")).toBeInTheDocument();
  });

  it("Viewer: Copy link in the notch", async () => {
    renderDetail("t-critique", "state=read-only");
    expect(await screen.findByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
  });

  it("project tasks never open here", async () => {
    renderDetail("api-integration");
    expect(await screen.findByRole("heading", { name: "This task isn’t available" })).toBeInTheDocument();
  });
});

describe("TM-15 mock: accepted team tasks project into Personal", () => {
  it("calls the projection on accept and removes it on undo", async () => {
    const calls: [string, unknown][] = [];
    const { teamTasks } = createMockTeams({
      respond: (value) => Promise.resolve(structuredClone(value)),
      onProjection: (id, projection) => calls.push([id, projection]),
    });
    const detail = await teamTasks.get("t-critique");
    const accepted = await teamTasks.accept("t-critique", detail.task.revision);
    expect(calls.at(-1)).toEqual(["t-critique", expect.objectContaining({ title: "Critique notes W42", teamName: "Design Team" })]);
    await teamTasks.revertAccept("t-critique", accepted.revision);
    expect(calls.at(-1)).toEqual(["t-critique", null]);
  });
});
