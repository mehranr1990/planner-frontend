import { describe, expect, it } from "vitest";
import { safeNextPath, signInHref } from "./navigation";

describe("auth navigation", () => {
  it("accepts only app-relative return paths", () => {
    expect(safeNextPath("/personal/tasks?view=board")).toBe("/personal/tasks?view=board");
    for (const unsafe of ["//evil.test", "/\\evil.test", "https://evil.test", "personal", "", null, undefined]) {
      expect(safeNextPath(unsafe)).toBeNull();
    }
  });

  it("builds the sign-in link with reason and a safe next", () => {
    expect(signInHref("expired", "/personal/calendar")).toBe("/sign-in?reason=expired&next=%2Fpersonal%2Fcalendar");
    expect(signInHref(undefined, "//evil.test")).toBe("/sign-in");
  });
});
