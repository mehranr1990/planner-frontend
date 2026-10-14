import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricGroup, MetricTile } from "./metric-tile";

describe("MetricTile", () => {
  it("pairs the label with its value and hint in a description list", () => {
    render(<MetricTile data-testid="tile" label="Focus hours" value="21h" hint="+3h vs last week" />);
    const tile = screen.getByTestId("tile");
    expect(tile.tagName).toBe("DL");
    expect(within(tile).getByRole("term")).toHaveTextContent("Focus hours");
    const [value, hint] = within(tile).getAllByRole("definition");
    expect(value).toHaveTextContent("21h");
    expect(value!.className).toContain("tabular");
    expect(hint).toHaveTextContent("+3h vs last week");
  });

  it("shares one quiet geometry and is never notched", () => {
    render(<MetricTile data-testid="tile" label="Tasks completed" value="31" />);
    const tile = screen.getByTestId("tile");
    expect(tile.className).toContain("rounded-metric");
    expect(tile.className).toContain("bg-subtle");
    expect(tile.className).toContain("p-3.5");
    expect(tile.className).not.toMatch(/notch|shadow/);
    expect(within(tile).getAllByRole("definition")).toHaveLength(1);
  });

  it("danger tone tints the tile and keeps the state in the label text", () => {
    render(<MetricTile data-testid="tile" label="Blocked" value="2" tone="danger" />);
    const tile = screen.getByTestId("tile");
    expect(tile).toHaveAttribute("data-tone", "danger");
    expect(tile.className).toContain("bg-danger-soft");
    expect(tile.className).toContain("text-danger-text");
    expect(within(tile).getByRole("term")).toHaveTextContent("Blocked");
  });
});

describe("MetricGroup", () => {
  it("is a labelled list with one item per tile", () => {
    render(
      <MetricGroup aria-label="This week">
        <MetricTile label="Focus hours" value="21h" />
        <MetricTile label="Tasks completed" value="31" />
        <MetricTile label="On-time rate" value="82%" />
        <MetricTile label="Average mood" value="Good" />
      </MetricGroup>,
    );
    const list = screen.getByRole("list", { name: "This week" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    // Four across when the group is wide enough, two by two when narrow.
    expect(list.className).toContain("grid-cols-2");
    expect(list.className).toContain("@xl:grid-cols-4");
    expect(list.parentElement!.className).toContain("@container");
  });

  it("supports a three-tile family", () => {
    render(
      <MetricGroup aria-label="Goal" columns={3}>
        <MetricTile label="Progress" value="72%" />
        <MetricTile label="Open tasks" value="18" />
        <MetricTile label="Blocked" value="2" tone="danger" />
      </MetricGroup>,
    );
    expect(screen.getByRole("list", { name: "Goal" }).className).toContain("@md:grid-cols-3");
  });
});
