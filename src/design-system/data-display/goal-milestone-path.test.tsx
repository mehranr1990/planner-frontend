import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { currentIndex, GoalMilestonePath, milestonePoints, type MilestonePathNode } from "./goal-milestone-path";

const NODES: MilestonePathNode[] = [
  { id: "a", label: "Brief", status: "Done", state: "done" },
  { id: "b", label: "Design", status: "Done", state: "done" },
  { id: "c", label: "Development", status: "In progress · 64%", state: "current", detail: "Due 2 Aban · Next: finish API" },
  { id: "d", label: "Beta", status: "Next · 20 Aban", state: "next" },
];
const GOAL = { label: "Launch", status: "Goal · 30 Azar", reached: false };

describe("GoalMilestonePath", () => {
  it("rises along the journey and mirrors x for RTL (never a CSS flip)", () => {
    const ltr = milestonePoints(4, "ltr");
    const rtl = milestonePoints(4, "rtl");
    expect(ltr).toHaveLength(5);
    expect(ltr[0]).toEqual([50, 250]);
    expect(ltr[4]).toEqual([750, 104]);
    expect(rtl.map(([x]) => x)).toEqual(ltr.map(([x]) => 820 - x));
    expect(currentIndex(NODES)).toBe(2);
    expect(currentIndex(NODES.slice(0, 2))).toBe(2);
  });

  it("shows the selected node's detail, moves with arrows (mirrored in RTL) and draws the done segment", () => {
    const onSelect = vi.fn();
    const { container, rerender } = render(
      <GoalMilestonePath nodes={NODES} goal={GOAL} label="Goal path" selectedId="c" onSelect={onSelect} />,
    );
    expect(screen.getByRole("group", { name: "Goal path" })).toBeInTheDocument();
    expect(screen.getByText("Due 2 Aban · Next: finish API")).toBeInTheDocument();
    const selected = screen.getByRole("button", { name: /Development/, pressed: true });
    expect(selected).toHaveAttribute("tabindex", "0");
    expect(container.querySelector('[data-slot="done-path"]')).not.toBeNull();
    expect(container.querySelector('g[data-state="current"]')).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("style") ?? "").not.toMatch(/scale/);

    fireEvent.keyDown(selected, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("d");
    rerender(<GoalMilestonePath nodes={NODES} goal={GOAL} label="Goal path" selectedId="c" onSelect={onSelect} direction="rtl" />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Development/ }), { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(screen.getByRole("button", { name: /Development/ }), { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("__goal");
  });

  it("marks a late milestone, offers + between nodes, and renders the empty and vertical forms", () => {
    const onInsert = vi.fn();
    const late = NODES.map((node) => (node.id === "c" ? { ...node, state: "late" as const, status: "Behind · 3 days" } : node));
    const { container, rerender } = render(
      <GoalMilestonePath nodes={late} goal={GOAL} label="Goal path" onInsert={onInsert} insertLabel={(i) => `Add milestone ${i}`} />,
    );
    expect(container.querySelector('g[data-state="late"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add milestone 2" }));
    expect(onInsert).toHaveBeenCalledWith(2);

    rerender(<GoalMilestonePath nodes={[]} goal={GOAL} label="Goal path" empty={<p>Add your first milestone</p>} />);
    expect(screen.getByText("Add your first milestone")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="milestone-path-empty"]')).not.toBeNull();

    rerender(<GoalMilestonePath nodes={NODES} goal={{ ...GOAL, reached: true }} label="Goal path" orientation="vertical" />);
    expect(screen.getByRole("list", { name: "Goal path" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });
});
