export interface RadiusToken {
  name: string;
  cssVar: `--${string}`;
  className: string;
  px: string;
  usage: string;
}

export const radiusTokens: readonly RadiusToken[] = [
  { name: "Card", cssVar: "--radius-card", className: "rounded-card", px: "32", usage: "Cards, panels" },
  { name: "Card small", cssVar: "--radius-card-sm", className: "rounded-card-sm", px: "28", usage: "Compact cards" },
  { name: "Tile", cssVar: "--radius-tile", className: "rounded-tile", px: "22", usage: "Stat tiles, swatches" },
  { name: "Row", cssVar: "--radius-row", className: "rounded-row", px: "18", usage: "List rows, tooltips" },
  { name: "Input", cssVar: "--radius-input", className: "rounded-input", px: "18", usage: "Text fields" },
  { name: "Control", cssVar: "--radius-control", className: "rounded-pill", px: "999", usage: "Buttons, chips, islands" },
];

/** Notch geometry presets from the design guide (§4). */
export const notchPresets = {
  default: { notchWidth: 64, notchHeight: 64, fillet: 30, button: 52 },
  compact: { notchWidth: 60, notchHeight: 60, fillet: 28, button: 48 },
  double: { notchWidth: 112, notchHeight: 60, fillet: 28, button: 48 },
} as const;
