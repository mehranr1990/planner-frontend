import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { generateMetadata as companiesMetadata } from "./companies/page";
import { generateMetadata as projectsMetadata } from "./projects/page";
import { generateMetadata as teamsMetadata } from "./teams/page";

// getTranslations needs the Next.js request; resolve it from the bundled catalogue instead.
const locale = vi.hoisted(() => ({ current: "en" as "en" | "fa" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: locale.current, messages: messages[locale.current], namespace: namespace as never }),
}));

// Personal routes render their own screens (covered by each feature).
describe("context collection routes", () => {
  it("titles /companies (CO-00 renders its own screen)", async () => {
    locale.current = "en";
    expect(await companiesMetadata()).toEqual({ title: "All companies" });
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
    expect(await companiesMetadata()).toEqual({ title: "همه‌ی شرکت‌ها" });
    locale.current = "en";
  });
});
