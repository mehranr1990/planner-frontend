import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/messages";
import { personalPageMetadata } from "./page-metadata";
import type { PersonalPageId } from "./pages";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "en", messages: messages.en, namespace: namespace as never }),
}));

describe("personalPageMetadata", () => {
  it.each(Object.keys(messages.en.Personal.pages) as PersonalPageId[])("%s has a localised <title>", async (page) => {
    expect(await personalPageMetadata(page)).toEqual({ title: messages.en.Personal.pages[page].title });
  });
});
