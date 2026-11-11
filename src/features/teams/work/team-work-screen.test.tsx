import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { teamTaskFixtures } from "@/fixtures/team-work";
import { teamFixtures } from "@/fixtures/teams";
import { renderWithProviders } from "@/test/render";
import { routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { TeamWorkScreen } from "./team-work-screen";
import { buildFlowModel, groupTeamTasks, workFilterCounts } from "./work-model";

function renderWork(search = "") {
  setMockPathname("/teams/design/work");
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamWorkScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

const WEEK = "2026-10-10";
const design = teamTaskFixtures.filter((task) => task.teamId === "design");
const designMembers = teamFixtures[0]!.members.map((person) => ({ person, role: "member" as const, title: "" }));

describe("TM-02 model", () => {
  it("counts quick filters and groups by week plan", () => {
    const counts = workFilterCounts(design, WEEK);
    expect(counts).toMatchObject({ blocked: 3, unassigned: 1, done: 3 });
    const groups = groupTeamTasks(
      design.filter((task) => task.status !== "done"),
      "plan",
      WEEK,
    );
    expect(groups.map((group) => [group.kind, group.tasks.length])).toEqual([
      ["plan", 11],
      ["unplanned", 1],
    ]);
  });

  it("maps this week's plan to CaseFlow: stages, waiting links, badges, Done this week tiles", () => {
    const model = buildFlowModel(design, designMembers, WEEK, () => undefined, (task) => `/x/${task.id}`);
    const [todo, active, review] = model.columns;
    expect(new Set(todo!.rows.map((row) => row.id))).toEqual(
      new Set(["t-critique", "t-component-qa", "t-specs", "t-icon-export", "t-illustrations"]),
    );
    expect(active!.rows.find((row) => row.id === "t-handoff")?.state).toBe("blocked");
    expect(review!.rows.map((row) => row.id)).toEqual(["t-icons"]);
    expect(model.links).toContainEqual({ from: "t-icons", to: "t-handoff", satisfied: false });
    expect(model.people.find((person) => person.id === "katy")?.badge).toEqual({ kind: "alert", n: 3 });
    expect(model.people.find((person) => person.id === "me")?.badge).toEqual({ kind: "alert", n: 2 });
    expect(model.outcomes[0]).toMatchObject({ id: "t-onboarding", highlighted: true });
  });
});

describe("TM-02 · Team work", () => {
  it("lists team and project tasks grouped by week plan with source chips; project rows open PJ-15", async () => {
    renderWork();
    const plan = await screen.findByRole("region", { name: "In this week’s plan" });
    expect(within(plan).getByRole("link", { name: "API integration" })).toHaveAttribute(
      "href",
      "/projects/website-redesign/tasks/api-integration",
    );
    expect(within(plan).getByRole("link", { name: "Usability round 2" })).toHaveAttribute(
      "href",
      "/teams/design/work/t-usability",
    );
    expect(screen.getByRole("region", { name: "Not planned" })).toHaveTextContent("Accessibility pass");
    expect(within(plan).getByText("Waiting for you to accept")).toBeInTheDocument();
  });

  it("“Include project tasks” off leaves only team tasks", async () => {
    const user = userEvent.setup();
    renderWork();
    await screen.findByRole("link", { name: "API integration" });
    await user.click(screen.getByRole("switch", { name: "Include project tasks" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "API integration" })).not.toBeInTheDocument());
  });

  it("moves a team task with the fixed statuses and offers Undo", async () => {
    const user = userEvent.setup();
    renderWork();
    await user.click(await screen.findByRole("button", { name: "Change status of Critique notes W42" }));
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "To do",
      "In progress",
      "Review",
      "Blocked",
      "Done",
    ]);
    await user.click(screen.getByRole("menuitemradio", { name: "In progress" }));
    expect(await screen.findByText("Critique notes W42 moved to In progress")).toBeInTheDocument();
    // Project tasks are read-only on team surfaces.
    expect(screen.queryByRole("button", { name: "Change status of API integration" })).not.toBeInTheDocument();
  });

  it("quick add parses tokens and creates a task in this week's plan", async () => {
    const user = userEvent.setup();
    renderWork("add=task");
    const input = await screen.findByRole("textbox", { name: "Add a team task" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "Banner study !high ~2h{Enter}");
    expect(await screen.findByText("Task added")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Banner study" })).toBeInTheDocument();
  });

  it("switches to Board and Flow views (URL view mode)", async () => {
    const user = userEvent.setup();
    renderWork();
    await screen.findByRole("region", { name: "In this week’s plan" });
    await user.click(screen.getByRole("radio", { name: "Board" }));
    expect(routerReplace).toHaveBeenLastCalledWith("/teams/design/work?view=board", { scroll: false });
  });

  it("Flow view: the shared CaseFlow with people badges and Done this week", async () => {
    renderWork("view=flow");
    const flow = await screen.findByRole("region", { name: "Week 42 · hand-offs" });
    expect(within(flow).getByRole("list", { name: "People in this flow" })).toBeInTheDocument();
    expect(within(flow).getByRole("img", { name: "Katy F.: 3 open, something blocked or waiting" })).toBeInTheDocument();
    expect(within(flow).getByRole("img", { name: "Ava R.: 1 open" })).toBeInTheDocument();
    expect(within(flow).getAllByText("Needs Icon set v2")).toHaveLength(2);
    expect(within(flow).getByText("→ Needed by Checkout flow hand-off, Icon export pipeline")).toBeInTheDocument();
    expect(within(flow).getByRole("link", { name: /Onboarding variants/ })).toBeInTheDocument();
  });

  it("Viewer: quick add hidden, no status menus", async () => {
    renderWork("state=read-only");
    await screen.findByRole("region", { name: "In this week’s plan" });
    expect(screen.queryByRole("textbox", { name: "Add a team task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change status of/ })).not.toBeInTheDocument();
  });

  it("empty state", async () => {
    renderWork("state=empty");
    expect(await screen.findByRole("heading", { name: "No team tasks yet" })).toBeInTheDocument();
  });
});
