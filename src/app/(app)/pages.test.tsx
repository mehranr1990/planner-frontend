import { screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { renderWithProviders } from "@/test/render";
import CompaniesPage, { generateMetadata as companiesMetadata } from "./companies/page";
import PersonalPage, { generateMetadata as personalMetadata } from "./personal/page";
import ProjectsPage, { generateMetadata as projectsMetadata } from "./projects/page";
import TeamsPage, { generateMetadata as teamsMetadata } from "./teams/page";

// getTranslations needs the Next.js request; resolve it from the bundled catalogue instead.
const locale = vi.hoisted(() => ({ current: "en" as "en" | "fa" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: locale.current, messages: messages[locale.current], namespace: namespace as never }),
}));

const pages = [
  ["personal", PersonalPage, personalMetadata, "Personal overview", "Plan my day"],
  ["projects", ProjectsPage, projectsMetadata, "Projects overview", "New task"],
  ["teams", TeamsPage, teamsMetadata, "Teams overview", "Check in"],
  ["companies", CompaniesPage, companiesMetadata, "Companies overview", "Review approvals"],
] as const;

describe("context overview routes", () => {
  it.each(pages)("/%s renders its overview", (_route, Page, _metadata, title, cta) => {
    renderWithProviders(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: cta })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("region", { name: "Overview layout placeholder" })).toBeInTheDocument();
  });

  it.each(pages)("/%s has a translated title", async (_route, _Page, generateMetadata, title) => {
    locale.current = "en";
    expect(await generateMetadata()).toEqual({ title });
  });

  it("translates the metadata title in Persian", async () => {
    locale.current = "fa";
    expect(await teamsMetadata()).toEqual({ title: "نمای کلی تیم‌ها" });
    locale.current = "en";
  });
});
