export type TypeStyle = "display" | "h1" | "title" | "body" | "caption" | "label";

export interface TypeToken {
  style: TypeStyle;
  className: `type-${TypeStyle}`;
  latin: string;
  persian: string;
}

/* Specs as size / line-height / weight; implemented in src/styles/typography.css. */
export const typeScale: readonly TypeToken[] = [
  { style: "display", className: "type-display", latin: "Display 52 / 1.1 / 400", persian: "Display 40 / 1.4 / 600" },
  { style: "h1", className: "type-h1", latin: "H1 34 / 1.2 / 500", persian: "H1 28 / 1.5 / 700" },
  { style: "title", className: "type-title", latin: "Card title 22 / 1.3 / 600", persian: "H2 20 / 1.6 / 700" },
  { style: "body", className: "type-body", latin: "Body 15 / 1.55 / 400", persian: "Body 15 / 1.85 / 500" },
  { style: "caption", className: "type-caption", latin: "Caption 13 / 1.45 / 500", persian: "Caption 12 / 1.7 / 600" },
  { style: "label", className: "type-label", latin: "Label 12 / 600 · caps", persian: "Label 12 / 1.7 · no caps" },
];
