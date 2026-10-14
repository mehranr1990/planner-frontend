import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import HomePage from "./page";

// getTranslations needs the Next.js request; resolve it from the bundled catalogue instead.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "en", messages: messages.en, namespace: namespace as never }),
}));

describe("home page", () => {
  it("links to the default context's overview and to the styleguide", async () => {
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1, name: "Mehran Planner" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the application shell" })).toHaveAttribute("href", "/personal");
    expect(screen.getByRole("link", { name: "Open the styleguide" })).toHaveAttribute("href", "/styleguide");
  });
});
