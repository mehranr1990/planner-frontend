/*
 * Motion tokens. Durations are in seconds (the unit Motion uses); the CSS
 * mirrors in src/styles/tokens.css (--motion-*, --ease-*) are checked by
 * src/styles/tokens.test.ts.
 */

export const duration = {
  instant: 0.1,
  fast: 0.16,
  standard: 0.24,
  slow: 0.4,
} as const;

export type DurationToken = keyof typeof duration;

export const easing = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.16, 1, 0.3, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const spring = {
  /** Islands settling into place. */
  soft: { type: "spring", stiffness: 260, damping: 30, mass: 1 },
  /** Shared-layout morphs: tabs, pills, notch buttons changing shape. */
  layoutMorph: { type: "spring", bounce: 0.18, visualDuration: 0.42 },
} as const;
