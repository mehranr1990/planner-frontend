import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { generateMetadata as componentsMetadata } from "./components/page";
import { generateMetadata as navigationMetadata } from "./navigation/page";
import { generateMetadata as foundationsMetadata } from "./page";

// getTranslations needs the Next.js request; resolve it from the bundled catalogue instead.
const locale = vi.hoisted(() => ({ current: "en" as "en" | "fa" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: locale.current, messages: messages[locale.current], namespace: namespace as never }),
}));

describe("styleguide page metadata", () => {
  it.each([
    [foundationsMetadata, "Styleguide", "راهنمای طراحی"],
    [componentsMetadata, "Components · Styleguide", "کامپوننت‌ها · راهنمای طراحی"],
    [navigationMetadata, "Navigation & shell · Styleguide", "ناوبری و پوسته · راهنمای طراحی"],
  ])("translates a styleguide page title (%#)", async (generateMetadata, en, fa) => {
    locale.current = "en";
    const english = await generateMetadata();
    expect(english.title).toBe(en);
    expect(english.description).toMatch(/^Mehran Planner /);

    locale.current = "fa";
    const persian = await generateMetadata();
    expect(persian.title).toBe(fa);
    expect(persian.description).toMatch(/برنامه‌ریز مهران/);
  });
});
