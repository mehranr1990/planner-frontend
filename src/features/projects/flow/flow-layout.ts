import type { ProjectWorkflow, WorkflowStatus } from "@/data/project-domain";

/*
 * PJ-06 workflow graph layout, pure: statuses in columns by distance from
 * the first status (breadth-first over the allowed transitions), one edge per
 * pair of statuses with an arrowhead for each allowed direction. RTL mirrors
 * every x through coordinates (x → width − x); arrowheads follow the path
 * (`orient="auto-start-reverse"`), never a CSS flip.
 */

export const NODE_W = 136;
export const NODE_H = 52;
const COL_GAP = 200;
const ROW_GAP = 104;
const PAD_X = 24;
const PAD_Y = 16;

export interface FlowNode {
  status: WorkflowStatus;
  /** Box left / top in the (mirrored) coordinate system. */
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  /** SVG path in the (mirrored) coordinate system. */
  path: string;
  /** Arrowhead at the end (first → second allowed) / at the start (second → first allowed). */
  head: boolean;
  tail: boolean;
}

export interface FlowLayout {
  width: number;
  height: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

function depths(workflow: ProjectWorkflow): Map<string, number> {
  const depth = new Map<string, number>();
  const first = workflow.statuses[0];
  if (!first) return depth;
  depth.set(first.id, 0);
  const queue = [first.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of workflow.transitions[id] ?? []) {
      if (!depth.has(next) && workflow.statuses.some((status) => status.id === next)) {
        depth.set(next, depth.get(id)! + 1);
        queue.push(next);
      }
    }
  }
  const max = Math.max(0, ...depth.values());
  for (const status of workflow.statuses) if (!depth.has(status.id)) depth.set(status.id, max + 1);
  return depth;
}

export function layoutFlow(workflow: ProjectWorkflow, { rtl = false }: { rtl?: boolean } = {}): FlowLayout {
  const depth = depths(workflow);
  const columns = new Map<number, WorkflowStatus[]>();
  for (const status of workflow.statuses) {
    const d = depth.get(status.id)!;
    columns.set(d, [...(columns.get(d) ?? []), status]);
  }
  const maxDepth = Math.max(0, ...columns.keys());
  const maxRows = Math.max(1, ...[...columns.values()].map((list) => list.length));
  const width = PAD_X * 2 + maxDepth * COL_GAP + NODE_W;
  const height = PAD_Y * 2 + maxRows * ROW_GAP;
  const mx = (x: number) => (rtl ? width - x : x);

  const raw = new Map<string, { x: number; y: number; depth: number; row: number }>();
  for (const [d, list] of columns) {
    const top = (height - list.length * ROW_GAP) / 2 + (ROW_GAP - NODE_H) / 2;
    list.forEach((status, row) => raw.set(status.id, { x: PAD_X + d * COL_GAP, y: top + row * ROW_GAP, depth: d, row }));
  }
  const nodes = workflow.statuses.map((status) => {
    const box = raw.get(status.id)!;
    return { status, x: rtl ? width - box.x - NODE_W : box.x, y: box.y };
  });

  const edges: FlowEdge[] = [];
  const seen = new Set<string>();
  for (const from of workflow.statuses) {
    for (const to of workflow.transitions[from.id] ?? []) {
      if (!raw.has(to) || to === from.id) continue;
      const key = [from.id, to].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const a0 = raw.get(from.id)!;
      const b0 = raw.get(to)!;
      // Draw from the earlier node (column, then row) to the later one.
      const swap = b0.depth < a0.depth || (b0.depth === a0.depth && b0.row < a0.row);
      const [aId, bId] = swap ? [to, from.id] : [from.id, to];
      const a = raw.get(aId)!;
      const b = raw.get(bId)!;
      let path: string;
      if (a.depth === b.depth) {
        const x1 = a.x + NODE_W / 2;
        const y1 = a.y + NODE_H;
        const y2 = b.y;
        const bend = 28;
        path = `M ${mx(x1 - 12)} ${y1} C ${mx(x1 + bend)} ${y1 + 24}, ${mx(x1 + bend)} ${y2 - 24}, ${mx(x1 - 12)} ${y2}`;
      } else {
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x - 6;
        const y2 = b.y + NODE_H / 2;
        const mid = (x1 + x2) / 2;
        path = `M ${mx(x1)} ${y1} C ${mx(mid)} ${y1}, ${mx(mid)} ${y2}, ${mx(x2)} ${y2}`;
      }
      const allowed = (x: string, y: string) => (workflow.transitions[x] ?? []).includes(y);
      edges.push({ id: key, path, head: allowed(aId, bId), tail: allowed(bId, aId) });
    }
  }
  return { width, height, nodes, edges };
}
