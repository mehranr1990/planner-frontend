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
  { name: "Row", cssVar: "--radius-row", className: "rounded-row", px: "18", usage: "List rows" },
  { name: "Input", cssVar: "--radius-input", className: "rounded-input", px: "18", usage: "Text fields" },
  { name: "Control", cssVar: "--radius-control", className: "rounded-pill", px: "999", usage: "Buttons, chips, islands" },
  { name: "Signature", cssVar: "--radius-signature", className: "rounded-signature", px: "32", usage: "Signature (notched) cards" },
  { name: "Product", cssVar: "--radius-product", className: "rounded-product", px: "28", usage: "Product cards" },
  { name: "Utility", cssVar: "--radius-utility", className: "rounded-utility", px: "20", usage: "Utility cards, KPI tiles" },
  { name: "Metric", cssVar: "--radius-metric", className: "rounded-metric", px: "20", usage: "Metric tiles" },
  { name: "Field", cssVar: "--radius-field", className: "rounded-field", px: "16", usage: "Rows and fields in utility cards, tooltips" },
  { name: "Folder tab", cssVar: "--radius-folder-tab", className: "rounded-folder-tab", px: "24", usage: "Folder tab top corners" },
];

/**
 * Notch geometry presets (P00CardsTabs, design CLAUDE.md §4). P00 wins over
 * design/tokens.css, whose --notch-fillet: 30px (for a 52px button) is
 * superseded: desktop is a 64px notch, 28px fillet, 54px action button.
 * A signature card holds at most one action, so there is no multi-button
 * preset (the old compact 60×60 and double 112×60 were retired in Wave 1B).
 */
export const notchPresets = {
  /** Desktop signature card (lg and up). */
  desktop: { notchWidth: 64, notchHeight: 64, fillet: 28, button: 54 },
  /** Mobile signature card (below lg). */
  mobile: { notchWidth: 56, notchHeight: 56, fillet: 24, button: 46 },
  /** Focus Clock / timer hero card. */
  focus: { notchWidth: 72, notchHeight: 72, fillet: 30, button: 56 },
  /** Two related actions (Stop + Open): the Cards board double notch, 112×60 / f28 with two 48px buttons. */
  double: { notchWidth: 112, notchHeight: 60, fillet: 28, button: 48 },
} as const;

export type NotchPresetName = keyof typeof notchPresets;
