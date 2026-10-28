import type { Scope } from "@/data/domain";

/*
 * Scope layers (P04 rules): Personal is always on; Projects, Teams and
 * Companies are read-only context that can be hidden, per person.
 */

export const LAYER_SCOPES: readonly Scope[] = ["personal", "project", "team", "company"];

export const isEditableScope = (scope: Scope): boolean => scope === "personal";

export function toggleLayer(hidden: ReadonlySet<Scope>, scope: Scope): Set<Scope> {
  const next = new Set(hidden);
  if (scope === "personal") return next;
  if (next.has(scope)) next.delete(scope);
  else next.add(scope);
  return next;
}

export function visibleBlocks<T extends { scope: Scope }>(blocks: readonly T[], hidden: ReadonlySet<Scope>): T[] {
  return hidden.size === 0 ? [...blocks] : blocks.filter((block) => !hidden.has(block.scope));
}

export function layerCounts(blocks: Iterable<{ scope: Scope }>): Record<Scope, number> {
  const counts: Record<Scope, number> = { personal: 0, project: 0, team: 0, company: 0 };
  for (const block of blocks) counts[block.scope] += 1;
  return counts;
}

/** Stored hidden layers, ignoring anything that is not a hideable scope. */
export function parseHiddenLayers(raw: string | null): Set<Scope> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((item): item is Scope => LAYER_SCOPES.includes(item as Scope) && item !== "personal"));
  } catch {
    return new Set();
  }
}
