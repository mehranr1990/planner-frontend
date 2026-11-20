import { describe, expect, it } from "vitest";
import { projectSheetHref } from "@/features/projects/sheets/project-sheet-params";
import { sectionSheetRoute } from "./sheet-params";

describe("sectionSheetRoute", () => {
  it("keeps the current route inside the section, query included", () => {
    expect(sectionSheetRoute("/projects", "?view=board", "/projects")).toEqual({ pathname: "/projects", search: "?view=board" });
    expect(sectionSheetRoute("/projects/p1/tasks", "?x=1", "/projects")).toEqual({ pathname: "/projects/p1/tasks", search: "?x=1" });
  });

  it("opens over the section base from any route without its sheet host", () => {
    expect(sectionSheetRoute("/", "?tab=today", "/projects")).toEqual({ pathname: "/projects", search: "" });
    expect(sectionSheetRoute("/personal/tasks", "", "/teams")).toEqual({ pathname: "/teams", search: "" });
    expect(sectionSheetRoute("/teams/t1", "", "/social")).toEqual({ pathname: "/social", search: "" });
    expect(sectionSheetRoute("/projects-archive", "", "/projects")).toEqual({ pathname: "/projects", search: "" });
  });

  it("builds the New project href over /projects from Personal home", () => {
    const route = sectionSheetRoute("/", "?tab=today", "/projects");
    expect(projectSheetHref(route.pathname, route.search, "project-new")).toBe("/projects?sheet=project-new");
  });
});
