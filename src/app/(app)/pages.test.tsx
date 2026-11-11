import { screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { renderWithProviders } from "@/test/render";
import CompaniesPage, { generateMetadata as companiesMetadata } from "./companies/page";
import { generateMetadata as projectsMetadata } from "./projects/page";
import { generateMetadata as teamsMetadata } from "./teams/page";

// getTranslations needs the Next.js request; resolve it from the bundled catalogue instead.
const locale = vi.hoisted(() => ({ current: "en" as "en" | "fa" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: locale.current, messages: messages[locale.current], namespace: namespace as never }),
}));

const pages = [
  ["companies", CompaniesPage, companiesMetadata, "Companies overview", "Review approvals"],
] as const;

// Personal routes render their own screens (covered by each feature).
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

  it("titles /projects (PJ-00 renders its own screen)", async () => {
    locale.current = "en";
    expect(await projectsMetadata()).toEqual({ title: "Projects" });
  });

  it("titles /teams (TM-00 renders its own screen)", async () => {
    locale.current = "en";
    expect(await teamsMetadata()).toEqual({ title: "All teams" });
  });

  it("translates the metadata title in Persian", async () => {
    locale.current = "fa";
    expect(await companiesMetadata()).toEqual({ title: "نمای کلی شرکت‌ها" });
    locale.current = "en";
  });
});
