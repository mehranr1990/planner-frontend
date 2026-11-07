import { describe, expect, it } from "vitest";
import { sampleWorkflow } from "@/fixtures/project-work";
import { layoutFlow, NODE_W } from "./flow-layout";

describe("PJ-06 workflow graph layout", () => {
  it("places statuses in columns by distance and draws one edge per pair", () => {
    const layout = layoutFlow(sampleWorkflow);
    const x = (id: string) => layout.nodes.find((node) => node.status.id === id)!.x;
    expect(x("todo")).toBeLessThan(x("in-progress"));
    expect(x("in-progress")).toBe(x("blocked"));
    expect(x("in-review")).toBeGreaterThan(x("in-progress"));
    expect(x("done")).toBeGreaterThan(x("in-review"));
    const review = layout.edges.find((edge) => edge.id === "in-progress|in-review")!;
    expect(review).toMatchObject({ head: true, tail: true });
    const backToTodo = layout.edges.find((edge) => edge.id === "blocked|todo")!;
    expect(backToTodo).toMatchObject({ head: true, tail: true });
    expect(layout.edges).toHaveLength(5);
  });

  it("mirrors every x in RTL (x → width − x), never a CSS flip", () => {
    const ltr = layoutFlow(sampleWorkflow);
    const rtl = layoutFlow(sampleWorkflow, { rtl: true });
    for (const node of ltr.nodes) {
      const mirrored = rtl.nodes.find((other) => other.status.id === node.status.id)!;
      expect(mirrored.x).toBe(ltr.width - node.x - NODE_W);
      expect(mirrored.y).toBe(node.y);
    }
    const first = ltr.edges[0]!.path.split(" ");
    const mirroredFirst = rtl.edges[0]!.path.split(" ");
    expect(Number(mirroredFirst[1])).toBe(ltr.width - Number(first[1]));
  });
});
