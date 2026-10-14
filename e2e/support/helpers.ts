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

export const SHOTS = "e2e/screenshots/step2";

export { expect };
