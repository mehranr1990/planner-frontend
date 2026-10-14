import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { generateMetadata as rootMetadata } from "./layout";

// getTranslations needs the Next.js request; resolve it from the bundled catalogue instead.
const locale = vi.hoisted(() => ({ current: "en" as "en" | "fa" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: locale.current, messages: messages[locale.current], namespace: namespace as never }),
}));
// next/font only works inside the Next.js compiler.
vi.mock("next/font/google", () => ({
  Urbanist: () => ({ variable: "font-urbanist" }),
  Vazirmatn: () => ({ variable: "font-vazirmatn" }),
}));

describe("root layout metadata", () => {
  it("translates the root title template and description", async () => {
    locale.current = "en";
    expect(await rootMetadata()).toEqual({
      title: { default: "Mehran Planner", template: "%s · Mehran Planner" },
      description: "Personal, project, team and company planning in one calm workspace.",
    });

    locale.current = "fa";
    expect(await rootMetadata()).toEqual({
      title: { default: "برنامه‌ریز مهران", template: "%s · برنامه‌ریز مهران" },
      description: "برنامه‌ریزی شخصی، پروژه، تیم و شرکت در یک فضای کاری آرام.",
    });
  });
});
