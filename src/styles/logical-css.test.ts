import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * Source-level guard for direction-aware styling. The app runs in LTR
 * (English) and RTL (Persian), so spacing, positioning, borders, radii and
 * alignment must use logical utilities (ms/me, ps/pe, start/end, border-s/e,
 * rounded-s/e, text-start/end, gap) that follow `dir`.
 *
 * Every string literal in src/**\/*.tsx (production files, not tests) is
 * split into class tokens; a token whose utility is a physical-direction one
 * fails the test with file:line.
 *
 * Not flagged:
 *  - tokens under an explicit `rtl:` / `ltr:` variant: a deliberate
 *    per-direction value (e.g. `ltr:left-0 rtl:right-0` around a mirrored
 *    transform).
 *  - utilities that are symmetric or already logical (inset-x-*, mx-*, px-*,
 *    translate-x-* — the last is paired with an rtl: variant where it moves
 *    along the inline axis).
 *  - entries in ALLOWLIST below, each with the reason it must stay physical.
 */

const SRC = resolve(__dirname, "..");

/** Physical utilities that have a logical equivalent. */
const PHYSICAL =
  /^-?(?:(?:ml|mr|pl|pr|left|right|space-x|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-.+|(?:border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br)(?:-.+)?|text-left|text-right)$/;

interface AllowEntry {
  /** Path under src/, with forward slashes. */
  file: string;
  /** The exact class token (with variants) that is allowed in that file. */
  token: string;
  reason: string;
}

/**
 * Legitimate physical utilities. Keep each entry narrow (one file, one token)
 * and say why the logical form would be wrong.
 */
const ALLOWLIST: readonly AllowEntry[] = [];

interface Violation {
  location: string;
  token: string;
}

function listTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsx(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

/** The utility of a class token, without variants (`lg:hover:`) and the important marker. */
function splitToken(token: string): { variants: string[]; utility: string } {
  // Variants are separated by ":" outside brackets (arbitrary values may contain ":").
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of token) {
    if (char === "[" || char === "(") depth += 1;
    if (char === "]" || char === ")") depth = Math.max(0, depth - 1);
    if (char === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  const utility = current.replace(/^!|!$/g, "");
  return { variants: parts, utility };
}

function findPhysicalTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const { variants, utility } = splitToken(token);
      if (variants.some((variant) => variant === "rtl" || variant === "ltr")) return false;
      return PHYSICAL.test(utility);
    });
}

function stringLiterals(source: ts.SourceFile): { text: string; pos: number }[] {
  const found: { text: string; pos: number }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      // Import specifiers are paths, not class names.
      if (!(ts.isStringLiteral(node) && ts.isImportDeclaration(node.parent))) {
        found.push({ text: node.text, pos: node.getStart(source) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const path of listTsx(SRC)) {
    const file = relative(SRC, path).split(sep).join("/");
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const literal of stringLiterals(source)) {
      for (const token of findPhysicalTokens(literal.text)) {
        if (ALLOWLIST.some((entry) => entry.file === file && entry.token === token)) continue;
        const { line } = source.getLineAndCharacterOfPosition(literal.pos);
        violations.push({ location: `src/${file}:${line + 1}`, token });
      }
    }
  }
  return violations;
}

describe("logical CSS", () => {
  it("flags physical utilities and ignores logical, symmetric and per-direction ones", () => {
    expect(findPhysicalTokens("ml-2 pr-4 left-0 -right-1 lg:hover:text-left border-l rounded-tr-lg space-x-2 left-[3px]")).toEqual([
      "ml-2",
      "pr-4",
      "left-0",
      "-right-1",
      "lg:hover:text-left",
      "border-l",
      "rounded-tr-lg",
      "space-x-2",
      "left-[3px]",
    ]);
    expect(
      findPhysicalTokens(
        "ms-2 pe-4 start-0 -end-1 text-start border-s rounded-se-lg gap-2 mx-auto px-3 inset-x-0 translate-x-1 rtl:-translate-x-1 ltr:left-0 rtl:right-0",
      ),
    ).toEqual([]);
    // Prose and other strings that merely contain the words are not class tokens.
    expect(findPhysicalTokens("Slides in from the left or right edge")).toEqual([]);
  });

  it("uses logical direction utilities in every component", () => {
    const violations = scan().map((violation) => `${violation.location}  ${violation.token}`);
    expect(violations, "Use ms/me, ps/pe, start/end, border-s/e, rounded-s/e, text-start/end instead").toEqual([]);
  });

  it("keeps the allowlist free of stale entries", () => {
    const stale = ALLOWLIST.filter((entry) => {
      const text = readFileSync(join(SRC, entry.file), "utf8");
      return !text.includes(entry.token);
    }).map((entry) => `${entry.file}  ${entry.token}`);
    expect(stale).toEqual([]);
  });
});
