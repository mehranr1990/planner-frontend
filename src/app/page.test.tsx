import { describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT ${href}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

describe("home page", () => {
  it("redirects to the default context's overview (sign-in happens there)", () => {
    expect(() => HomePage()).toThrow("NEXT_REDIRECT /personal");
    expect(redirect).toHaveBeenCalledWith("/personal");
  });
});
