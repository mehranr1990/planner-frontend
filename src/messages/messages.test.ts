import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clientMessages } from "./client";
import { messages } from "./index";
import { styleguideMessages } from "./styleguide";

type Tree = { [key: string]: string | Tree };

function keyPaths(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : keyPaths(value, `${prefix}${key}.`),
  );
}

function valueAt(tree: Tree, path: string): string | Tree | undefined {
  return path.split(".").reduce<string | Tree | undefined>(
    (node, key) => (node !== undefined && typeof node !== "string" ? node[key] : undefined),
    tree,
  );
}

const BRANCH_TYPES = new Set(["plural", "selectordinal", "select"]);
/** Selector-only uses that a language without plural forms (Persian) may drop. */
const PLURAL_TYPES = new Set(["plural", "selectordinal"]);

/**
 * The arguments of an ICU message and how each is used ("{count, plural, one {{formatted} x}}"
 * → count: plural, formatted: text). Branch texts and selectors are not arguments; quoted
 * text ('{literal}') is skipped.
 */
function icuUsage(message: string): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const record = (name: string, kind: string) => found.set(name, (found.get(name) ?? new Set()).add(kind));
  let i = 0;

  const skipQuote = () => {
    // '' is a literal apostrophe; '{…}' quotes syntax characters.
    if (message[i + 1] === "'") {
      i += 2;
      return;
    }
    if (message[i + 1] === "{" || message[i + 1] === "}" || message[i + 1] === "#") {
      const end = message.indexOf("'", i + 1);
      i = end < 0 ? message.length : end + 1;
      return;
    }
    i += 1;
  };

  const readUntil = (stops: string) => {
    const start = i;
    while (i < message.length && !stops.includes(message[i]!)) i += 1;
    return message.slice(start, i).trim();
  };

  const skipBlock = () => {
    // Skips a style such as "{n, number, ::currency/IRR}" up to its closing brace.
    let depth = 0;
    while (i < message.length) {
      const char = message[i]!;
      if (char === "{") depth += 1;
      if (char === "}") {
        if (depth === 0) return;
        depth -= 1;
      }
      i += 1;
    }
  };

  function parseText(): void {
    while (i < message.length) {
      const char = message[i]!;
      if (char === "'") skipQuote();
      else if (char === "{") parseArgument();
      else if (char === "}") return;
      else i += 1;
    }
  }

  function parseArgument(): void {
    i += 1; // {
    const name = readUntil(",}");
    if (message[i] === "}") {
      record(name, "text");
      i += 1;
      return;
    }
    i += 1; // ,
    const type = readUntil(",}");
    record(name, BRANCH_TYPES.has(type) ? type : "text");
    if (message[i] === "}") {
      i += 1;
      return;
    }
    i += 1; // ,
    if (!BRANCH_TYPES.has(type)) {
      skipBlock();
      i += 1;
      return;
    }
    while (i < message.length) {
      readUntil("{}"); // selector, e.g. "one", "=0", "offset:1 other"
      if (message[i] === "}") {
        i += 1;
        return;
      }
      i += 1; // {
      parseText();
      i += 1; // }
    }
  }

  parseText();
  return found;
}

/** The argument names of an ICU message. */
function icuArguments(message: string): string[] {
  return [...icuUsage(message).keys()].sort();
}

/**
 * Placeholder differences between an English and a Persian message. Persian
 * has a single plural form, so it may drop an argument that English uses
 * only as a plural selector ("{count, plural, one {…} other {…}}" →
 * "{formatted} نفر"); every other argument must appear in both.
 */
function placeholderMismatch(en: string, fa: string): string | null {
  const enUsage = icuUsage(en);
  const faArgs = icuArguments(fa);
  const pluralOnly = (name: string) => [...(enUsage.get(name) ?? [])].every((kind) => PLURAL_TYPES.has(kind));
  const missing = [...enUsage.keys()].filter((name) => !faArgs.includes(name) && !pluralOnly(name));
  const extra = faArgs.filter((name) => !enUsage.has(name));
  if (missing.length === 0 && extra.length === 0) return null;
  return `missing in fa {${missing.join(", ")}}, only in fa {${extra.join(", ")}}`;
}

/** Namespaces read with useTranslations() in client-capable code outside the styleguide. */
function clientNamespacesInSource(): Set<string> {
  const src = resolve(__dirname, "..");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return path.endsWith(join("features", "styleguide")) ? [] : files(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
  const namespaces = new Set<string>();
  for (const file of files(src)) {
    for (const match of readFileSync(file, "utf8").matchAll(/useTranslations\(\s*["'`]([A-Za-z]+)/g)) {
      namespaces.add(match[1]!);
    }
  }
  return namespaces;
}

describe("message catalogues", () => {
  it("Persian has exactly the English keys", () => {
    const en = keyPaths(messages.en as unknown as Tree).sort();
    const fa = keyPaths(messages.fa as unknown as Tree).sort();
    expect(fa.filter((key) => !en.includes(key))).toEqual([]);
    expect(en.filter((key) => !fa.includes(key))).toEqual([]);
  });

  it("has no empty strings", () => {
    for (const locale of ["en", "fa"] as const) {
      const tree = messages[locale] as unknown as Tree;
      const empty = keyPaths(tree).filter((path) => {
        const value = valueAt(tree, path);
        return typeof value === "string" && value.trim() === "";
      });
      expect(empty, locale).toEqual([]);
    }
  });

  it("Persian uses the same ICU placeholders as English for every key", () => {
    const en = messages.en as unknown as Tree;
    const fa = messages.fa as unknown as Tree;
    const mismatches = keyPaths(en).flatMap((path) => {
      const enValue = valueAt(en, path);
      const faValue = valueAt(fa, path);
      if (typeof enValue !== "string" || typeof faValue !== "string") return [];
      const mismatch = placeholderMismatch(enValue, faValue);
      return mismatch ? [`${path}: ${mismatch}`] : [];
    });
    expect(mismatches).toEqual([]);
  });

  it("reads ICU arguments, not branch text or quoted text", () => {
    expect(icuArguments("{count, plural, one {{formatted} unread} other {# items}}")).toEqual(["count", "formatted"]);
    expect(icuArguments("{kind, select, task {Task} other {Item {name}}}")).toEqual(["kind", "name"]);
    expect(icuArguments("Hi {name}, it’s {when, date, short}")).toEqual(["name", "when"]);
    expect(icuArguments("Type '{name}' literally, it''s {value}")).toEqual(["value"]);
    expect(icuArguments("No placeholders")).toEqual([]);
  });

  it("flags missing and extra placeholders, allowing only a dropped plural selector", () => {
    expect(placeholderMismatch("Hi {name}", "سلام {name}")).toBeNull();
    expect(placeholderMismatch("Hi {name}", "سلام")).toBe("missing in fa {name}, only in fa {}");
    expect(placeholderMismatch("Hi", "سلام {name}")).toBe("missing in fa {}, only in fa {name}");
    expect(placeholderMismatch("{count, plural, one {{formatted} item} other {{formatted} items}}", "{formatted} مورد")).toBeNull();
    expect(placeholderMismatch("{count, plural, one {# item} other {# items}}", "{formatted} مورد")).toBe(
      "missing in fa {}, only in fa {formatted}",
    );
    // A select carries meaning, not grammar: Persian must keep it.
    expect(placeholderMismatch("{kind, select, task {Task} other {Item}}", "مورد")).toBe("missing in fa {kind}, only in fa {}");
  });

  it("the full catalogue is the client and styleguide sets plus server-only Home", () => {
    for (const locale of ["en", "fa"] as const) {
      expect(messages[locale]).toEqual({ ...clientMessages[locale], Home: messages[locale].Home, Styleguide: styleguideMessages[locale] });
      expect(clientMessages[locale]).not.toHaveProperty("Styleguide");
      expect(clientMessages[locale]).not.toHaveProperty("Home");
    }
  });

  it("ships every namespace that client code outside the styleguide reads", () => {
    const shipped = Object.keys(clientMessages.en);
    const missing = [...clientNamespacesInSource()].filter((namespace) => !shipped.includes(namespace));
    expect(missing).toEqual([]);
  });
});
