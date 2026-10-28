import { screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PLANNER_SETTINGS } from "@/features/planner-settings/planner-settings";
import { messages } from "@/messages";
import { renderWithProviders, testPreferences } from "@/test/render";
import { personalPages, type PersonalPageId } from "./pages";
import { personalPageMetadata, PersonalSkeleton } from "./personal-skeleton";

// Server APIs resolved from the bundled catalogue and the test preferences.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "en", messages: messages.en, namespace: namespace as never }),
}));
vi.mock("@/features/preferences/request-preferences", () => ({
  getRequestPreferences: async () => testPreferences,
}));

async function renderSkeleton(page: PersonalPageId, options?: Parameters<typeof renderWithProviders>[1]) {
  // Async server components render as the element they resolve to.
  return renderWithProviders(await PersonalSkeleton({ page }), options);
}

// Pages whose real screen has replaced the skeleton (Overview: P01, My Day: P02, Tasks: P03; covered by their features).
const BUILT: readonly PersonalPageId[] = ["overview", "myday", "tasks"];
const skeletonPages = (Object.keys(personalPages) as PersonalPageId[]).filter((page) => !BUILT.includes(page));

describe("PersonalSkeleton", () => {
  it.each(skeletonPages)("%s renders its header and the board/step it waits for", async (page) => {
    await renderSkeleton(page);
    const title = messages.en.Personal.pages[page].title;
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText("Personal · 13 Oct")).toBeInTheDocument();
    const skeleton = document.querySelector(`[data-skeleton="${page}"]`)!;
    expect(skeleton).toHaveTextContent(personalPages[page].board);
    expect(skeleton).toHaveTextContent(`step ${personalPages[page].step}`);
  });

  it.each(Object.keys(personalPages) as PersonalPageId[])("%s has a localised <title>", async (page) => {
    expect(await personalPageMetadata(page)).toEqual({ title: messages.en.Personal.pages[page].title });
  });

  it("never shows the Today switch (Overview and My Day bring their own)", async () => {
    await renderSkeleton("calendar");
    expect(screen.queryByRole("navigation", { name: "Today" })).not.toBeInTheDocument();
  });

  it("renders Module hidden · Turn on for a hidden optional module, keeping the page title", async () => {
    await renderSkeleton("finance", {
      plannerSettings: { ...DEFAULT_PLANNER_SETTINGS, modules: { ...DEFAULT_PLANNER_SETTINGS.modules, finance: false } },
    });
    expect(screen.getByRole("heading", { level: 1, name: "Finance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn Finance on" })).toBeInTheDocument();
    expect(document.querySelector('[data-skeleton="finance"]')).toBeNull();
  });

  it("never hides a core module", async () => {
    await renderSkeleton("inbox", {
      plannerSettings: {
        ...DEFAULT_PLANNER_SETTINGS,
        modules: Object.fromEntries(Object.keys(DEFAULT_PLANNER_SETTINGS.modules).map((id) => [id, false])) as never,
      },
    });
    expect(document.querySelector('[data-skeleton="inbox"]')).not.toBeNull();
  });
});
