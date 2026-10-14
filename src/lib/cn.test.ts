import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps a custom font size next to a text colour", () => {
    expect(cn("text-fg", "text-body")).toBe("text-fg text-body");
  });

  it("resolves conflicts within custom theme scales", () => {
    expect(cn("rounded-card", "rounded-pill")).toBe("rounded-pill");
    expect(cn("p-card", "p-4")).toBe("p-4");
    expect(cn("shadow-island", "shadow-elevated")).toBe("shadow-elevated");
    expect(cn("type-body", "type-caption")).toBe("type-caption");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});
