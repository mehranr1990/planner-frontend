export interface ShadowToken {
  name: string;
  cssVar: `--${string}`;
  className: string;
  usage: string;
}

/* Dark theme drops the island shadow entirely: depth comes from lighter surfaces. */
export const shadowTokens: readonly ShadowToken[] = [
  { name: "Island", cssVar: "--shadow-island", className: "shadow-island", usage: "Floating islands, top bar, rail" },
  { name: "Elevated", cssVar: "--shadow-elevated", className: "shadow-elevated", usage: "Overlays: menus, dialogs, sheets" },
  { name: "Tooltip", cssVar: "--shadow-tooltip", className: "shadow-tooltip", usage: "Tooltip island: hairline ring + soft tint" },
  { name: "Focus", cssVar: "--focus-ring", className: "focus-ring", usage: "Keyboard focus on every interactive element" },
];
