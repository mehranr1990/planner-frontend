/** The styleguide's pages, in navigation order. Labels live in Styleguide.pages. */
export const styleguidePages = [
  { id: "foundations", href: "/styleguide" },
  { id: "components", href: "/styleguide/components" },
  { id: "navigation", href: "/styleguide/navigation" },
  { id: "rules", href: "/styleguide/rules" },
] as const;

export type StyleguidePageId = (typeof styleguidePages)[number]["id"];
