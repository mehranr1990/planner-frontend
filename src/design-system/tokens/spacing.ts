export interface SpacingToken {
  name: string;
  className: string;
  px: number;
  usage: string;
  /** Width class used to preview the step. */
  bar: string;
}

/* Named steps on top of Tailwind's 4px scale. */
export const spacingTokens: readonly SpacingToken[] = [
  { name: "gutter", className: "px-gutter", px: 16, usage: "Mobile page gutter", bar: "w-gutter" },
  { name: "card", className: "p-card", px: 24, usage: "Card padding", bar: "w-card" },
  { name: "section", className: "gap-section", px: 24, usage: "Gap between cards", bar: "w-section" },
  { name: "card-lg", className: "p-card-lg", px: 28, usage: "Large card padding", bar: "w-card-lg" },
  { name: "touch", className: "min-h-touch", px: 48, usage: "Minimum touch target", bar: "w-touch" },
  { name: "page", className: "xl:px-page", px: 72, usage: "Desktop page margin", bar: "w-page" },
];
