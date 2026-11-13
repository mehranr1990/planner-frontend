import { describe, expect, it } from "vitest";
import { scopes } from "@/design-system/tokens/colors";
import enNavigation from "@/messages/en/navigation.json";
import faNavigation from "@/messages/fa/navigation.json";
import { appContexts, getAppContext, getProjectContext, getTeamContext, projectHref, teamHref, companyHref, getCompanyContext } from "./contexts";
import { navItemIds } from "./types";

type Tree = { [key: string]: string | Tree };

function lookup(tree: Tree, path: string): string | Tree | undefined {
  return path.split(".").reduce<string | Tree | undefined>(
    (node, key) => (node && typeof node === "object" ? node[key] : undefined),
    tree,
  );
}

const catalogues = {
  en: enNavigation as unknown as Tree,
  fa: faNavigation as unknown as Tree,
};

describe("navigation contexts", () => {
  it("lists the five scopes in display order (Social after Companies, SO-01)", () => {
    expect(appContexts.map((context) => context.id)).toEqual([...scopes]);
    expect(appContexts.map((context) => context.basePath)).toEqual([
      "/personal",
      "/projects",
      "/teams",
      "/companies",
      "/social",
    ]);
  });

  it("matches the final nav sets (Personal: P00PersonalIA; others: Shell board)", () => {
    const ids = Object.fromEntries(appContexts.map((context) => [context.id, context.nav.map((item) => item.id)]));
    expect(ids).toEqual({
      personal: [
        "overview",
        "myday",
        "tasks",
        "calendar",
        "goals",
        "habits",
        "finance",
        "journal",
        "insights",
        "inbox",
        "braindump",
        "settings",
      ],
      // The collection (/projects, D7); a project's own nav comes from getProjectContext.
      project: ["overview"],
      // The collection (/teams, TS-01); a team's own nav comes from getTeamContext.
      team: ["overview"],
      // The collection (/companies, CS-01); a company's own nav comes from getCompanyContext.
      company: ["overview"],
      social: ["overview", "connections", "groups", "activities", "balances", "lending"],
    });
  });

  it("builds the company rail: four groups + Settings, Work labelled Projects & teams (CS-01 C2)", () => {
    const context = getCompanyContext("euroly");
    expect(context.nav.map((item) => item.id)).toEqual([
      "overview",
      "departments",
      "people",
      "work",
      "goals",
      "resources",
      "expenses",
      "approvals",
      "budgets",
      "channels",
      "knowledge",
      "reports",
      "settings",
    ]);
    expect(context.nav.find((item) => item.id === "work")?.labelKey).toBe("items.companyWork");
    expect(context.nav.find((item) => item.id === "approvals")?.badge).toBe("approvals");
    expect(context.nav.filter((item) => item.mobileOrder).map((item) => item.id)).toEqual(["overview", "work", "approvals"]);
    expect(companyHref("euroly", "resources")).toBe("/companies/euroly/resources");
  });

  it.each(appContexts.map((context) => [context.id, context] as const))("%s has unique ids and hrefs", (_, context) => {
    const ids = context.nav.map((item) => item.id);
    const hrefs = context.nav.map((item) => item.href);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it.each(appContexts.map((context) => [context.id, context] as const))(
    "%s hrefs start with the base path; Personal and Social are fully routed, other contexts only their overview",
    (_, context) => {
      for (const item of context.nav) {
        expect(item.href === context.basePath || item.href.startsWith(`${context.basePath}/`), item.href).toBe(true);
        expect(item.href).not.toMatch(/\/$/);
        expect(item.status).toBe(context.id === "personal" || context.id === "social" || item.id === "overview" ? "available" : "planned");
      }
      expect(context.nav[0]).toMatchObject({
        id: "overview",
        href: context.basePath,
        status: "available",
      });
    },
  );

  it.each(appContexts.filter((context) => !context.collection).map((context) => [context.id, context] as const))(
    "%s has exactly three mobile slots in ascending order",
    (_, context) => {
      const slots = context.nav.flatMap((item) => (item.mobileOrder === undefined ? [] : [item.mobileOrder]));
      expect([...slots].sort()).toEqual([1, 2, 3]);
    },
  );

  it("groups the Personal rail as P00PersonalIA: 3 groups + Settings at the bottom", () => {
    const personal = getAppContext("personal");
    expect(personal.rail).toEqual({
      groups: [
        ["overview", "myday", "tasks", "calendar", "goals", "habits"],
        ["finance", "journal", "insights"],
        ["inbox", "braindump"],
      ],
      footer: ["settings"],
    });
    // Every Personal item appears exactly once in the rail.
    const railIds = [...personal.rail!.groups.flat(), ...personal.rail!.footer];
    expect([...railIds].sort()).toEqual(personal.nav.map((item) => item.id).sort());
    expect(personal.nav.find((item) => item.id === "inbox")?.badge).toBe("inbox");
    for (const id of ["project", "team", "company"] as const) expect(getAppContext(id).rail).toBeUndefined();
    expect(getAppContext("project").collection).toBe(true);
    expect(getAppContext("team").collection).toBe(true);
  });

  it("gives Personal the PM01 bottom bar: Today (Overview + My Day) · Tasks · Calendar", () => {
    const items = getAppContext("personal").mobileNav!;
    expect(items.map((item) => [item.labelKey, item.href, item.mobileOrder])).toEqual([
      ["items.today", "/personal", 1],
      ["items.tasks", "/personal/tasks", 2],
      ["items.calendar", "/personal/calendar", 3],
    ]);
    expect(items[0]!.alsoActiveOn).toEqual(["/personal/my-day"]);
  });

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

  it("builds a project's context from its id (SH01 · D1, D2, D3, D6, D8)", () => {
    const project = getProjectContext("website-redesign");
    expect(project.basePath).toBe("/projects/website-redesign");
    expect(project.workspaceId).toBe("website-redesign");
    expect(project.collection).toBeUndefined();
    expect(project.rail).toEqual({
      groups: [
        ["overview", "tasks", "timeline", "gantt", "calendar"],
        ["milestones", "risks", "workload"],
        ["channels", "members", "files", "analytics"],
      ],
      footer: ["settings"],
    });
    expect(project.nav.map((item) => [item.id, item.href])).toEqual([
      ["overview", "/projects/website-redesign"],
      ["tasks", "/projects/website-redesign/tasks"],
      ["timeline", "/projects/website-redesign/timeline"],
      ["gantt", "/projects/website-redesign/gantt"],
      ["calendar", "/projects/website-redesign/calendar"],
      ["milestones", "/projects/website-redesign/milestones"],
      ["risks", "/projects/website-redesign/risks"],
      ["workload", "/projects/website-redesign/workload"],
      ["channels", "/projects/website-redesign/channels"],
      ["members", "/projects/website-redesign/members"],
      ["files", "/projects/website-redesign/files"],
      ["analytics", "/projects/website-redesign/analytics"],
      ["settings", "/projects/website-redesign/settings"],
    ]);
    expect(project.nav.every((item) => item.status === "available")).toBe(true);
    // Board and Flow are Tasks view modes: their routes keep Tasks current.
    expect(project.nav.find((item) => item.id === "tasks")?.alsoActiveOn).toEqual([
      "/projects/website-redesign/board",
      "/projects/website-redesign/flow",
    ]);
    expect(project.nav.find((item) => item.id === "risks")?.badge).toBe("risks");
    expect(getProjectContext("website-redesign")).toBe(project);
    expect(projectHref("a b", "board")).toBe("/projects/a%20b/board");
  });

  it("builds a team context per id: 3 groups + Settings, Activity is not a route (TS-01, T1–T3, T11)", () => {
    const team = getTeamContext("design");
    expect(team.basePath).toBe("/teams/design");
    expect(team.workspaceId).toBe("design");
    expect(team.collection).toBeUndefined();
    expect(team.rail).toEqual({
      groups: [
        ["overview", "work", "calendar", "planning"],
        ["projects", "goals", "people", "analytics"],
        ["channels", "checkins", "recognition", "files"],
      ],
      footer: ["settings"],
    });
    expect(team.nav.map((item) => item.id)).not.toContain("activity");
    expect(team.nav.find((item) => item.id === "checkins")).toMatchObject({ href: "/teams/design/check-ins", badge: "checkins" });
    expect(team.nav.filter((item) => item.mobileOrder).map((item) => [item.id, item.mobileOrder])).toEqual([
      ["overview", 1],
      ["work", 2],
      ["calendar", 3],
    ]);
    expect(team.nav.every((item) => item.status === "available")).toBe(true);
    expect(getTeamContext("design")).toBe(team);
    expect(teamHref("a b", "work")).toBe("/teams/a%20b/work");
    expect(getAppContext("team").mobileNav?.map((item) => item.labelKey)).toEqual(["items.allTeams"]);
  });

  it("looks contexts up by id", () => {
    expect(getAppContext("team").basePath).toBe("/teams");
  });
});
