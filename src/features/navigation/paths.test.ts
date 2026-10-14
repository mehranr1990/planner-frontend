import { describe, expect, it } from "vitest";
import { getAppContext } from "./contexts";
import {
  contextHref,
  getContextFromPathname,
  getMobileNavItems,
  getNavItemForPathname,
  isNavItemActive,
  normalizePathname,
} from "./paths";

describe("normalizePathname", () => {
  it.each([
    [undefined, "/"],
    [null, "/"],
    ["", "/"],
    ["/", "/"],
    ["///", "/"],
    ["/personal/", "/personal"],
    ["/personal//my-day/", "/personal/my-day"],
    ["/projects?tab=1", "/projects"],
    ["/projects/board#top", "/projects/board"],
    ["teams", "/teams"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePathname(input)).toBe(expected);
  });
});

describe("getContextFromPathname", () => {
  it.each([
    ["/personal", "personal"],
    ["/personal/", "personal"],
    ["/personal/my-day", "personal"],
    ["/projects", "project"],
    ["/projects/board/42", "project"],
    ["/teams/people", "team"],
    ["/companies/", "company"],
  ])("%s → %s", (pathname, id) => {
    expect(getContextFromPathname(pathname)?.id).toBe(id);
  });

  it.each(["/", "/styleguide", "/projectsx", "/personalities", "/Personal", "/settings/personal"])(
    "%s is outside every context",
    (pathname) => {
      expect(getContextFromPathname(pathname)).toBeUndefined();
    },
  );
});

describe("getNavItemForPathname", () => {
  it("maps base paths to the overview, with or without a trailing slash", () => {
    expect(getNavItemForPathname("/teams")?.item?.id).toBe("overview");
    expect(getNavItemForPathname("/teams/")?.item?.id).toBe("overview");
  });

  it("maps item routes and their nested routes", () => {
    expect(getNavItemForPathname("/personal/my-day")?.item?.id).toBe("myday");
    expect(getNavItemForPathname("/projects/board/42")?.item?.id).toBe("board");
    expect(getNavItemForPathname("/teams/check-ins/")?.item?.id).toBe("checkins");
    expect(getNavItemForPathname("/companies/approvals?filter=open")?.item?.id).toBe("approvals");
  });

  it("keeps the context but no item for unknown routes inside a context", () => {
    const result = getNavItemForPathname("/projects/unknown");
    expect(result?.context.id).toBe("project");
    expect(result?.item).toBeUndefined();
  });

  it("returns undefined outside every context", () => {
    expect(getNavItemForPathname("/")).toBeUndefined();
    expect(getNavItemForPathname("/styleguide")).toBeUndefined();
  });

  it("does not leak items between contexts", () => {
    // "board" exists only under Projects.
    expect(getNavItemForPathname("/personal/board")?.item).toBeUndefined();
  });
});

describe("isNavItemActive", () => {
  const personal = getAppContext("personal");
  const overview = personal.nav.find((item) => item.id === "overview")!;
  const myday = personal.nav.find((item) => item.id === "myday")!;

  it("matches the overview on its base path only", () => {
    expect(isNavItemActive(overview, "/personal")).toBe(true);
    expect(isNavItemActive(overview, "/personal/")).toBe(true);
    expect(isNavItemActive(overview, "/personal/my-day")).toBe(false);
  });

  it("matches other items on nested routes, segment-aware", () => {
    expect(isNavItemActive(myday, "/personal/my-day")).toBe(true);
    expect(isNavItemActive(myday, "/personal/my-day/notes")).toBe(true);
    expect(isNavItemActive(myday, "/personal/my-days")).toBe(false);
    expect(isNavItemActive(myday, null)).toBe(false);
  });
});

describe("contextHref / getMobileNavItems", () => {
  it("returns overview routes", () => {
    expect(contextHref("personal")).toBe("/personal");
    expect(contextHref("company")).toBe("/companies");
  });

  it("returns the bottom-bar items in slot order", () => {
    expect(getMobileNavItems(getAppContext("personal")).map((item) => item.id)).toEqual(["overview", "tasks", "calendar"]);
    expect(getMobileNavItems(getAppContext("project")).map((item) => item.id)).toEqual(["overview", "tasks", "flow"]);
  });
});
