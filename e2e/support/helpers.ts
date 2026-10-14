import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Shared E2E helpers (same conventions as styleguide.spec.ts): preferences
 * travel in the mp-preferences cookie exactly as the app writes it, the theme
 * in next-themes' localStorage key, and console/page errors are collected.
 */

export type Theme = "light" | "dark";
export type Preferences = {
  locale: "en" | "fa";
  direction: "ltr" | "rtl";
  digits: "latn" | "fa";
  currency: "toman" | "rial";
  calendar: "jalali" | "gregorian";
};

export const PERSIAN: Preferences = { locale: "fa", direction: "rtl", digits: "fa", currency: "toman", calendar: "jalali" };
export const ENGLISH: Preferences = { locale: "en", direction: "ltr", digits: "latn", currency: "toman", calendar: "gregorian" };

export const MODES = {
  "light-ltr-en": { theme: "light", preferences: ENGLISH },
  "dark-rtl-fa": { theme: "dark", preferences: PERSIAN },
} as const satisfies Record<string, { theme: Theme; preferences: Preferences }>;
export type ModeName = keyof typeof MODES;

/** Theme × direction matrix for the Personal routes (Step 3 integration pass). */
export const ALL_MODES = {
  ...MODES,
  "dark-ltr-en": { theme: "dark", preferences: ENGLISH },
  "light-rtl-fa": { theme: "light", preferences: PERSIAN },
} as const satisfies Record<string, { theme: Theme; preferences: Preferences }>;
export type AnyModeName = keyof typeof ALL_MODES;

export async function seedAnyMode(page: Page, mode: AnyModeName) {
  await seed(page, ALL_MODES[mode].theme, ALL_MODES[mode].preferences);
}

/** The sample week's review (week = Jalali date of its Saturday). */
export const REVIEW_WEEK = "/personal/review/1405-07-18";
export const SAMPLE_TASK = "t-ui-design";

/** Every Personal route of P00PersonalIA, with representative params. */
export const PERSONAL_ROUTES = [
  "/personal",
  "/personal/my-day",
  "/personal/my-day?date=1405-07-21&view=3days",
  "/personal/tasks",
  "/personal/tasks?view=board&group=horizon",
  "/personal/tasks/create",
  `/personal/tasks/${SAMPLE_TASK}`,
  "/personal/calendar?view=month&cal=shamsi",
  "/personal/inbox?tab=triage",
  "/personal/brain-dump",
  `/personal/focus?task=${SAMPLE_TASK}`,
  "/personal/shutdown?step=route",
  "/personal/goals",
  "/personal/goals/g-launch?tab=journey",
  "/personal/habits",
  "/personal/finance?tab=trends",
  "/personal/journal",
  "/personal/journal/1405-07-21",
  "/personal/insights?tab=focus",
  REVIEW_WEEK,
  "/personal/settings",
] as const;

/** One URL per global sheet (P18), on a Personal route. */
export const SHEET_ROUTES = ["quick-add", "expense", "habit", "goal", "mood", "reschedule", "note", "voice"].map(
  (id) => `/personal/tasks?sheet=${id}`,
);

/** Planner settings cookie (mp-planner) hiding the given optional modules. */
export async function hideModules(context: BrowserContext, hidden: readonly string[]) {
  const modules = Object.fromEntries(
    ["goals", "habits", "finance", "journal", "insights", "braindump"].map((id) => [id, !hidden.includes(id)]),
  );
  await context.addCookies([
    {
      name: "mp-planner",
      value: encodeURIComponent(JSON.stringify({ version: 1, modules })),
      url: test.info().project.use.baseURL!,
    },
  ]);
}

export const ROUTES = ["/personal", "/projects", "/teams", "/companies", "/styleguide", "/styleguide/components", "/styleguide/navigation"] as const;

export async function setPreferencesCookie(context: BrowserContext, preferences: Preferences) {
  await context.addCookies([
    {
      name: "mp-preferences",
      value: encodeURIComponent(JSON.stringify(preferences)),
      url: test.info().project.use.baseURL!,
    },
  ]);
}

/** Seed theme (localStorage, before any script) and preferences (cookie). */
export async function seed(page: Page, theme: Theme, preferences: Preferences = ENGLISH) {
  await setPreferencesCookie(page.context(), preferences);
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem("theme", value);
    } catch {}
  }, theme);
}

export async function seedMode(page: Page, mode: ModeName) {
  await seed(page, MODES[mode].theme, MODES[mode].preferences);
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** Resolves once React has hydrated the given element (fiber keys are attached). */
export async function waitForHydration(page: Page, selector = "h1") {
  await page.waitForFunction((sel) => {
    const element = document.querySelector(sel);
    return Boolean(element && Object.keys(element).some((key) => key.startsWith("__reactFiber")));
  }, selector);
  // Let any recoverable hydration error queued during commit reach the console.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

/** Navigate, wait for the page heading, fonts and hydration. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await waitForHydration(page);
}

/**
 * Navigate to a ?sheet= URL. A modal sheet aria-hides the page, so the page
 * heading leaves the accessibility tree: wait on DOM selectors instead.
 */
export async function openSheetRoute(page: Page, path: string) {
  await page.goto(path);
  await page.locator("main h1").first().waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
  await waitForHydration(page, "main h1");
  await page.locator("[data-sheet]").first().waitFor();
}

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

export async function fontLoaded(page: Page, family: string): Promise<boolean> {
  return page.evaluate(
    (name) => [...document.fonts].some((face) => face.family.includes(name) && face.status === "loaded"),
    family,
  );
}

/** Resolved value of a custom property on an element. */
export async function cssVar(page: Page, selector: string, name: string): Promise<string> {
  return page.locator(selector).first().evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop).trim(), name);
}

/** The element that currently has focus, described for assertions. */
export async function activeElementInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? { tag: el.tagName, label: el.getAttribute("aria-label"), text: el.textContent?.trim() ?? "" } : null;
  });
}

export const SHOTS = "e2e/screenshots/1c";

export { expect };
