/*
 * Colour token metadata. Primitive values live in design/tokens.css (plus
 * src/styles/design-extensions.css for board-only colours),
 * semantic aliases in src/styles/tokens.css. This file names the tokens,
 * documents their role and pairs each with its Tailwind class (written out in
 * full so Tailwind can see it).
 */

export interface ColorToken {
  name: string;
  cssVar: `--${string}`;
  swatch: string;
  role: string;
}

export const neutralTokens: readonly ColorToken[] = [
  { name: "Canvas", cssVar: "--canvas", swatch: "bg-canvas", role: "Page, notch cut-outs" },
  { name: "Surface", cssVar: "--surface", swatch: "bg-surface", role: "Cards, islands, rail" },
  { name: "Raised", cssVar: "--surface-raised", swatch: "bg-raised", role: "Inputs, inner panels" },
  { name: "Subtle", cssVar: "--surface-subtle", swatch: "bg-subtle", role: "Rows inside cards" },
  { name: "Elevated", cssVar: "--surface-elevated", swatch: "bg-elevated", role: "Menus, dialogs" },
  { name: "Line", cssVar: "--border-subtle", swatch: "bg-line", role: "Grid lines, dividers" },
  { name: "Hairline", cssVar: "--border-soft", swatch: "bg-hairline", role: "Toasts, secondary button" },
  { name: "Border", cssVar: "--border-default", swatch: "bg-outline", role: "Outline buttons, chips" },
  { name: "Muted icon", cssVar: "--icon-muted", swatch: "bg-icon-muted", role: "Drag handles" },
  { name: "Text 3", cssVar: "--text-muted", swatch: "bg-fg-muted", role: "Captions, meta" },
  { name: "Text 2", cssVar: "--text-secondary", swatch: "bg-fg-secondary", role: "Secondary labels" },
  { name: "Text 1", cssVar: "--text-primary", swatch: "bg-fg", role: "Body, titles" },
  { name: "On accent", cssVar: "--on-accent", swatch: "bg-on-accent", role: "Text on accent / volt" },
];

export const scopes = ["personal", "project", "team", "company"] as const;

export type Scope = (typeof scopes)[number];

export interface ScopeTokens {
  hue: string;
  usage: string;
  soft: string;
  deep: string;
  dot: string;
  text: string;
}

export const scopeTokens: Record<Scope, ScopeTokens> = {
  personal: {
    hue: "Mint",
    usage: "My day, habits, notes, personal goals",
    soft: "bg-personal-soft",
    deep: "bg-personal-deep",
    dot: "bg-personal-dot",
    text: "text-personal-deep",
  },
  project: {
    hue: "Sky",
    usage: "Boards, milestones, flows, deliverables",
    soft: "bg-project-soft",
    deep: "bg-project-deep",
    dot: "bg-project-dot",
    text: "text-project-deep",
  },
  team: {
    hue: "Periwinkle",
    usage: "Members, workload, meetings, chat",
    soft: "bg-team-soft",
    deep: "bg-team-deep",
    dot: "bg-team-dot",
    text: "text-team-deep",
  },
  company: {
    hue: "Orchid",
    usage: "Strategy, OKRs, portfolio, reports",
    soft: "bg-company-soft",
    deep: "bg-company-deep",
    dot: "bg-company-dot",
    text: "text-company-deep",
  },
};

export type StatusTone = "danger" | "warning" | "success" | "info" | "neutral";

export const statusTokens: Record<StatusTone, { soft: string; text: string }> = {
  danger: { soft: "bg-danger-soft", text: "text-danger-text" },
  warning: { soft: "bg-warning-soft", text: "text-warning-text" },
  success: { soft: "bg-success-soft", text: "text-success-text" },
  info: { soft: "bg-info-soft", text: "text-info-text" },
  neutral: { soft: "bg-hairline", text: "text-fg-secondary" },
};

/*
 * Board-only primitives (src/styles/design-extensions.css) and their
 * semantic aliases (src/styles/tokens.css).
 */

export const deepCardTokens: readonly ColorToken[] = [
  { name: "Deep card", cssVar: "--deep-card", swatch: "bg-deep-card", role: "Signature insight card fill" },
  { name: "On deep card", cssVar: "--on-deep-card", swatch: "bg-on-deep-card", role: "Headings on the deep card" },
  { name: "On deep card muted", cssVar: "--on-deep-card-muted", swatch: "bg-on-deep-card-muted", role: "Body copy on the deep card" },
];

export interface VizToken {
  name: string;
  cssVar: `--${string}`;
  swatch: string;
  hue: string;
}

/** Finance categories — frozen DataViz palette (supersedes P13 prose). */
export const vizCategoryTokens: readonly VizToken[] = [
  { name: "Housing", cssVar: "--viz-housing", swatch: "bg-viz-housing", hue: "Green" },
  { name: "Food", cssVar: "--viz-food", swatch: "bg-viz-food", hue: "Coral" },
  { name: "Transport", cssVar: "--viz-transport", swatch: "bg-viz-transport", hue: "Blue" },
  { name: "Lifestyle", cssVar: "--viz-lifestyle", swatch: "bg-viz-lifestyle", hue: "Amber" },
  { name: "Work", cssVar: "--viz-work", swatch: "bg-viz-work", hue: "Violet" },
  { name: "Health", cssVar: "--viz-health", swatch: "bg-viz-health", hue: "Pink" },
  { name: "Other", cssVar: "--viz-other", swatch: "bg-viz-other", hue: "Neutral" },
];

/** Layered-area series (DataVizAdd). */
export const vizSeriesTokens: readonly VizToken[] = [
  { name: "Mood", cssVar: "--viz-mood", swatch: "bg-viz-mood", hue: "Green" },
  { name: "Energy", cssVar: "--viz-energy", swatch: "bg-viz-energy", hue: "Amber" },
  { name: "Focus", cssVar: "--viz-focus", swatch: "bg-viz-focus", hue: "Blue" },
];
