import { describe, expect, it } from "vitest";
import { scopes } from "@/design-system/tokens/colors";
import enNavigation from "@/messages/en/navigation.json";
import faNavigation from "@/messages/fa/navigation.json";
import { appContexts, getAppContext } from "./contexts";
import { navItemIds } from "./types";

type Tree = { [key: string]: string | Tree };

function lookup(tree: Tree, path: string): string | Tree | undefined {
  return path.split(".").reduce<string | Tree | undefined>(
    (node, key) => (node && typeof node === "object" ? node[key] : undefined),
    tree,
  );
}

const catalogues = { en: enNavigation as unknown as Tree, fa: faNavigation as unknown as Tree };

describe("navigation contexts", () => {
  it("lists the four scopes in display order", () => {
    expect(appContexts.map((context) => context.id)).toEqual([...scopes]);
    expect(appContexts.map((context) => context.basePath)).toEqual([
      "/personal",
      "/projects",
      "/teams",
      "/companies",
    ]);
  });

  it("matches the Shell board nav sets", () => {
    const ids = Object.fromEntries(appContexts.map((context) => [context.id, context.nav.map((item) => item.id)]));
    expect(ids).toEqual({
      personal: ["overview", "myday", "tasks", "calendar", "goals", "habits", "finance", "journal", "insights"],
      project: ["overview", "tasks", "board", "timeline", "gantt", "flow", "docs", "analytics"],
      team: ["overview", "work", "people", "calendar", "checkins", "activity", "files"],
      company: ["overview", "departments", "projects", "people", "goals", "finance", "assets", "approvals", "reports"],
    });
  });

  it.each(appContexts.map((context) => [context.id, context] as const))("%s has unique ids and hrefs", (_, context) => {
    const ids = context.nav.map((item) => item.id);
    const hrefs = context.nav.map((item) => item.href);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it.each(appContexts.map((context) => [context.id, context] as const))(
    "%s hrefs start with the base path; only the overview is available",
    (_, context) => {
      for (const item of context.nav) {
        expect(item.href === context.basePath || item.href.startsWith(`${context.basePath}/`), item.href).toBe(true);
        expect(item.href).not.toMatch(/\/$/);
        expect(item.status).toBe(item.id === "overview" ? "available" : "planned");
      }
      expect(context.nav[0]).toMatchObject({ id: "overview", href: context.basePath, status: "available" });
    },
  );

  it.each(appContexts.map((context) => [context.id, context] as const))(
    "%s has exactly three mobile slots in ascending order",
    (_, context) => {
      const slots = context.nav.flatMap((item) => (item.mobileOrder === undefined ? [] : [item.mobileOrder]));
      expect([...slots].sort()).toEqual([1, 2, 3]);
    },
  );

  it.each(["en", "fa"] as const)("every label key exists in the %s catalogue", (locale) => {
    const tree = catalogues[locale];
    for (const context of appContexts) {
      for (const key of [context.labelKey, context.descriptionKey, context.addLabelKey, ...context.nav.map((i) => i.labelKey)]) {
        const value = lookup(tree, key);
        expect(typeof value, `${locale}: ${key}`).toBe("string");
        expect((value as string).trim(), `${locale}: ${key}`).not.toBe("");
      }
    }
    for (const id of navItemIds) {
      expect(typeof lookup(tree, `items.${id}`), `${locale}: items.${id}`).toBe("string");
    }
  });

  it("uses an icon for every item and context", () => {
    for (const context of appContexts) {
      expect(context.icon).toBeTruthy();
      for (const item of context.nav) expect(item.icon, item.id).toBeTruthy();
    }
  });

  it("looks contexts up by id", () => {
    expect(getAppContext("team").basePath).toBe("/teams");
  });
});
