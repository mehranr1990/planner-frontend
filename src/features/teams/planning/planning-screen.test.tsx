import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { teamCapabilities } from "@/data/mock/mock-teams";
import type { TeamMember, TeamTask } from "@/data/team-domain";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { planColumns, planTargets } from "./planning-model";
import { PlanningScreen } from "./planning-screen";

function renderPlanning(team = "design", search = "") {
  setMockPathname(`/teams/${team}/planning`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <PlanningScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

const person = (id: string) => ({ id, name: id, initials: id.slice(0, 2) });
const task = (id: string, holder: string | null, hours: number, extra: Partial<TeamTask> = {}): TeamTask => ({
  id,
  teamId: "t",
  title: id,
  status: "todo",
  priority: "medium",
  due: null,
  estimateHours: hours,
  assignees: holder ? [{ person: person(holder), state: "accepted" }] : [],
  source: { kind: "team" },
  planWeek: "2026-10-10",
  progress: 0,
  blockedBy: [],
  goal: null,
  revision: 1,
  updatedAt: "",
  can: { edit: true, status: true },
  ...extra,
});

describe("TM-04 model", () => {
  it("books estimates per person against capacity; over capacity is flagged", () => {
    const members: TeamMember[] = ["katy", "me"].map((id) => ({ person: person(id), role: "member", title: "" }));
    const columns = planColumns(
      members,
      [task("a", "katy", 20), task("b", "katy", 13), task("c", "me", 2)],
      new Map([
        ["katy", 32],
        ["me", 25],
      ]),
    );
    expect(columns.map((column) => [column.member.person.id, column.bookedHours, column.over])).toEqual([
      ["katy", 33, true],
      ["me", 2, false],
    ]);
  });

  it("Members plan only their own tasks; Lead+ any; project tasks keep their assignee", () => {
    const member = teamCapabilities("member", "active");
    const lead = teamCapabilities("lead", "active");
    const ids = ["katy", "me"];
    expect(planTargets(task("x", null, 1, { planWeek: null }), member, ids)).toEqual(["me"]);
    expect(planTargets(task("y", "katy", 1), member, ids)).toEqual([]);
    expect(planTargets(task("y", "katy", 1), lead, ids)).toEqual(["toplan", "me"]);
    const projectTask = task("p", "me", 1, {
      planWeek: null,
      source: { kind: "project", projectId: "p", projectName: "P" },
    });
    expect(planTargets(projectTask, lead, ids)).toEqual(["me"]);
  });
});

describe("TM-04 · Weekly planning", () => {
  it("Member view: To plan with carry-overs, people columns, notch Open my tasks, plan own task via Plan for…", async () => {
    const user = userEvent.setup();
    renderPlanning();
    const toPlan = await screen.findByRole("region", { name: "To plan" });
    expect(await within(toPlan).findByRole("link", { name: "Illustration style guide" })).toBeInTheDocument();
    expect(within(toPlan).getAllByText("carried over")).toHaveLength(2);
    expect(within(toPlan).getByText("Website Redesign")).toBeInTheDocument();
    expect(screen.getByText("You can plan your own tasks; the rest of the plan is read-only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open my tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "W42 plan · draft" })).toBeInTheDocument();
    expect(screen.getByText("Checkout redesign hand-off · icon set v2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit week focus" })).not.toBeInTheDocument();
    // Someone else's task offers no Plan for… to a Member.
    expect(screen.queryByRole("button", { name: "Plan for… Component QA" })).not.toBeInTheDocument();

    await user.click(within(toPlan).getByRole("button", { name: "Plan for… Illustration style guide" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mehran R." }));
    expect(await screen.findByText("Illustration style guide planned for Mehran R.")).toBeInTheDocument();
    const mine = screen.getByRole("region", { name: "Mehran R." });
    await waitFor(() =>
      expect(within(mine).getByRole("link", { name: "Illustration style guide" })).toBeInTheDocument(),
    );
  });

  it("Lead: reassigns between people (Pending), empty next week publishes, published notch opens week work", async () => {
    const user = userEvent.setup();
    renderPlanning("mobile");
    expect(await screen.findByRole("button", { name: "Open week work" })).toBeInTheDocument();
    expect(screen.getByText(/W42 published/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Plan for… Home widgets spike" }));
    await user.click(await screen.findByRole("menuitem", { name: "Kian F." }));
    expect(await screen.findByText("Home widgets spike planned for Kian F.")).toBeInTheDocument();
    const kian = screen.getByRole("region", { name: "Kian F." });
    await waitFor(() => expect(within(kian).getByText("Pending")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "W43" }));
    expect(await screen.findByText("Nothing planned yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish plan" }));
    expect(await screen.findByText("Plan published")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "W43 plan · published" })).toBeInTheDocument();
  });

  it("Review last week: task counts and carry-over decisions (read-only for Members)", async () => {
    const user = userEvent.setup();
    renderPlanning();
    await user.click(await screen.findByRole("radio", { name: "Review last week" }));
    expect(await screen.findByText("14/17")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getAllByText("→ W42")).toHaveLength(2);
    expect(screen.getByText("→ backlog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Decide for/ })).not.toBeInTheDocument();
  });
});
