import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { neutralTokens } from "@/design-system/tokens/colors";
import { radiusTokens } from "@/design-system/tokens/radii";
import { shadowTokens } from "@/design-system/tokens/shadows";
import { duration, easing } from "@/design-system/tokens/motion";

/*
 * mehran-planner-design/tokens.css is imported directly (single source of
 * truth); these tests guard the contract between it and the app layers.
 */

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (path: string) => stripComments(readFileSync(resolve(__dirname, path), "utf8"));

const designCss = read("../../mehran-planner-design/tokens.css");
const appCss = read("tokens.css");
const globalsCss = read("globals.css");
const appStyles = [globalsCss, appCss, read("typography.css"), read("utilities.css")];

/** Set by next/font on <html>, not declared in any stylesheet. */
const NEXT_FONT_VARIABLES = ["--font-urbanist", "--font-vazirmatn"];

/** Custom properties declared in the first block matching `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  const result = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    result.set(match[1]!, match[2]!.trim().replace(/\s+/g, " "));
  }
  return result;
}

/** Names that really define a value: `--x: var(--x)` (Tailwind reference keys) does not count. */
const declared = (css: string) =>
  [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .filter(([, name, value]) => value!.trim() !== `var(${name})`)
    .map((match) => match[1]!);

/** Every custom property declared in any rule whose selector list includes :root or a scope. */
function rootLevelDeclarations(css: string): Set<string> {
  const names = new Set<string>();
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1]!.split(",").map((selector) => selector.trim());
    if (selectors.includes(":root") || selectors.some((selector) => selector.startsWith("[data-scope"))) {
      for (const match of rule[2]!.matchAll(/(--[\w-]+)\s*:/g)) names.add(match[1]!);
    }
  }
  return names;
}
const consumed = (css: string) => [...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]!);

const available = new Set([...declared(designCss), ...appStyles.flatMap(declared), ...NEXT_FONT_VARIABLES]);

describe("design tokens contract", () => {
  it("imports the design package tokens before the app layer", () => {
    const designImport = globalsCss.indexOf('@import "../../mehran-planner-design/tokens.css"');
    const appImport = globalsCss.indexOf('@import "./tokens.css"');
    expect(designImport).toBeGreaterThan(-1);
    expect(appImport).toBeGreaterThan(designImport);
  });

  it("declares every custom property the app consumes", () => {
    const missing = [...new Set(appStyles.flatMap(consumed))].filter((name) => !available.has(name));
    expect(missing).toEqual([]);
  });

  it("documents only tokens that exist", () => {
    const documented = [...neutralTokens, ...radiusTokens, ...shadowTokens].map((token) => token.cssVar);
    expect(documented.filter((name) => !available.has(name))).toEqual([]);
  });

  it("resolves every Tailwind reference key to a real token", () => {
    const referenceBlock = globalsCss.match(/@theme inline reference \{([^}]*)\}/)?.[1] ?? "";
    const keys = [...referenceBlock.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]!);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((name) => !available.has(name))).toEqual([]);
  });

  it("never overrides a themed design primitive at :root level in the app layer", () => {
    // A later :root declaration would beat the design's [data-theme="dark"] block.
    const themed = declarations(designCss, '[data-theme="dark"]');
    const overrides = [...rootLevelDeclarations(appCss)].filter((name) => themed.has(name));
    expect(overrides).toEqual([]);
  });

  it("contains no raw colours outside the design package", () => {
    // color-mix() of tokens is fine; literal colour functions and hex are not.
    const rawColour = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
    for (const css of appStyles) expect(css).not.toMatch(rawColour);
  });

  it("keeps the design's font families as fallbacks", () => {
    const overrides = declarations(appCss, ":root");
    expect(overrides.get("--font-latin")).toContain("'Urbanist'");
    expect(overrides.get("--font-fa")).toContain("'Vazirmatn'");
  });

  it("never uses pure black for dark surfaces", () => {
    const dark = declarations(designCss, '[data-theme="dark"]');
    for (const name of ["--canvas", "--surface", "--raised", "--subtle"]) {
      expect(dark.get(name)?.toLowerCase(), name).not.toMatch(/^#0{3}(0{3})?$/);
    }
  });

  it("gives weekend label text the AA-safe danger text tone", () => {
    expect(appCss).toMatch(/--weekend-text:\s*var\(--danger-text\)/);
  });
});

describe("motion tokens stay in sync between CSS and TS", () => {
  const css = declarations(appCss, ":root");

  it.each(Object.entries(duration))("--motion-%s", (name, seconds) => {
    expect(css.get(`--motion-${name}`)).toBe(`${Math.round(seconds * 1000)}ms`);
  });

  it.each(Object.entries(easing))("--ease-%s", (name, curve) => {
    expect(css.get(`--ease-${name}`)).toBe(`cubic-bezier(${curve.join(", ")})`);
  });
});
