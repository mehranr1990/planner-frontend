import { describe, expect, it } from "vitest";
import { isValidProjectKey, normalizeProjectKey, suggestProjectKey } from "./project-key";

const none = () => false;

describe("project key (PJ-90)", () => {
  it("suggests the initials of the name's Latin words", () => {
    expect(suggestProjectKey("Help Center", none)).toBe("HC");
    expect(suggestProjectKey("Q4 sales push 2027", none)).toBe("QSP");
    expect(suggestProjectKey("سایت Shop Mobile", none)).toBe("SM");
  });

  it("uses the first letters of a single Latin word", () => {
    expect(suggestProjectKey("Website", none)).toBe("WEB");
  });

  it("falls back to PRJ, then the first unused PRJ2, PRJ3…", () => {
    expect(suggestProjectKey("بازطراحی سایت", none)).toBe("PRJ");
    const taken = new Set(["PRJ", "PRJ2"]);
    expect(suggestProjectKey("بازطراحی سایت", (key) => taken.has(key))).toBe("PRJ3");
    expect(suggestProjectKey("Help Center", (key) => key === "HC")).toBe("HC2");
  });

  it("keeps suggestions within 10 characters", () => {
    const name = "a b c d e f g h i j k l";
    expect(suggestProjectKey(name, none)).toBe("ABCDEFGHIJ");
    expect(suggestProjectKey(name, (key) => key === "ABCDEFGHIJ")).toBe("ABCDEFGHI2");
  });

  it("validates A–Z / 0–9, 2–10 chars, letter first", () => {
    expect(isValidProjectKey("WEB")).toBe(true);
    expect(isValidProjectKey("A1")).toBe(true);
    expect(isValidProjectKey("ABCDEFGHIJ")).toBe(true);
    expect(isValidProjectKey("W")).toBe(false);
    expect(isValidProjectKey("ABCDEFGHIJK")).toBe(false);
    expect(isValidProjectKey("1AB")).toBe(false);
    expect(isValidProjectKey("web")).toBe(false);
    expect(isValidProjectKey("WE-B")).toBe(false);
  });

  it("normalises typed input to uppercase A–Z / 0–9", () => {
    expect(normalizeProjectKey("we-b 1۲")).toBe("WEB1");
  });
});
