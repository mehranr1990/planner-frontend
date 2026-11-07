import { describe, expect, it } from "vitest";
import { projectPeople } from "@/fixtures/projects";
import { projectQuickParse } from "./project-quick-parse";

const members = [projectPeople.kian, projectPeople.sara, projectPeople.me];

describe("projectQuickParse (PJ-02 quick add)", () => {
  it("reads @person, !priority, due <day> <month> and ~estimate", () => {
    expect(projectQuickParse("Fix login @kian !high due 25 Oct ~3h", "2026-10-13", members)).toEqual({
      title: "Fix login",
      assignee: projectPeople.kian,
      priority: "high",
      due: "2026-10-25",
      estimateHours: 3,
    });
  });

  it("rolls a past day to next year and reads Jalali months in Persian", () => {
    expect(projectQuickParse("Plan due 2 Jan", "2026-10-13", members).due).toBe("2027-01-02");
    expect(projectQuickParse("بازبینی موعد ۲۵ آبان", "2026-10-13", members)).toMatchObject({
      title: "بازبینی",
      due: "2026-11-16",
    });
  });

  it("keeps unknown handles and words in the title; today/tomorrow still work", () => {
    expect(projectQuickParse("Ping @nobody tomorrow ~30m", "2026-10-13", members)).toEqual({
      title: "Ping @nobody",
      due: "2026-10-14",
      estimateHours: 0.5,
    });
  });
});
