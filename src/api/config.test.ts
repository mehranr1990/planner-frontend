import { afterEach, describe, expect, it, vi } from "vitest";
import { apiOrigin } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("apiOrigin", () => {
  it("defaults to same origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "");
    expect(apiOrigin()).toBe("");
  });

  it("normalises a configured origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "http://localhost:4000/");
    expect(apiOrigin()).toBe("http://localhost:4000");
  });

  it("rejects a path so /api/v1 is never double-prefixed", () => {
    vi.stubEnv("NEXT_PUBLIC_API_ORIGIN", "http://localhost:4000/api/v1");
    expect(() => apiOrigin()).toThrow(/without a path/);
  });
});
