import { expect, test } from "@playwright/test";
import {
  ALL_MODES,
  collectErrors,
  fontLoaded,
  horizontalOverflow,
  MODES,
  MY_DAY_DEMO_ROUTES,
  MY_DAY_RESCHEDULE_ROUTE,
  open,
  openSheetRoute,
  PERSONAL_ROUTES,
  seedAnyMode,
  seedMode,
  SHEET_ROUTES,
  type AnyModeName,
  type ModeName,
} from "./support/helpers";

/*
 * Every route × {light-ltr-en, dark-rtl-fa} × {390, 768, 1024, 1440}: no
 * console or page errors (hydration mismatches included), no horizontal
 * overflow, and the locale's font is loaded.
 */

const ROUTES = ["/", "/personal", "/projects", "/teams", "/companies", "/styleguide", "/styleguide/components", "/styleguide/navigation", "/styleguide/rules"] as const;
const WIDTHS = [390, 768, 1024, 1440] as const;

test.describe.configure({ timeout: 60_000 });

/*
 * Personal (Step 3 integration): every route and every sheet URL ×
 * {light, dark} × {LTR English, RTL Persian} × {390, 1024, 1440}.
 */
for (const mode of Object.keys(ALL_MODES) as AnyModeName[]) {
  for (const width of [390, 1024, 1440] as const) {
    test.describe(`personal · ${mode} · ${width}px`, () => {
      for (const route of [
        ...PERSONAL_ROUTES,
        ...MY_DAY_DEMO_ROUTES,
        // Below lg Reschedule is a modal sheet: it aria-hides the page heading that open() waits for.
        ...(width === 390 ? [] : [MY_DAY_RESCHEDULE_ROUTE]),
        ...(width === 1440 ? [] : SHEET_ROUTES),
      ]) {
        test(route, async ({ page }) => {
          const errors = collectErrors(page);
          await page.setViewportSize({ width, height: 900 });
          await seedAnyMode(page, mode);
          const response = await page.goto(route);
          expect(response?.status(), "HTTP status").toBe(200);
          if (route.includes("sheet=")) await openSheetRoute(page, route);
          else await open(page, route);
          const { theme, preferences } = ALL_MODES[mode];
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await expect(page.locator("html")).toHaveAttribute("dir", preferences.direction);
          expect(await horizontalOverflow(page), "horizontal overflow (px)").toBeLessThanOrEqual(0);
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          expect(await horizontalOverflow(page), "horizontal overflow at the bottom (px)").toBeLessThanOrEqual(0);
          expect(errors).toEqual([]);
        });
      }
    });
  }
}

for (const mode of Object.keys(MODES) as ModeName[]) {
  for (const width of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} · ${mode} · ${width}px`, async ({ page }) => {
        const errors = collectErrors(page);
        await page.setViewportSize({ width, height: 900 });
        await seedMode(page, mode);
        await open(page, route);

        const html = page.locator("html");
        const { theme, preferences } = MODES[mode];
        await expect(html).toHaveAttribute("data-theme", theme);
        await expect(html).toHaveAttribute("dir", preferences.direction);
        await expect(html).toHaveAttribute("lang", preferences.locale);

        expect(await horizontalOverflow(page), "horizontal overflow (px)").toBeLessThanOrEqual(0);
        // Scrolled to the end too: late content (sticky/fixed bars) must not overflow either.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        expect(await horizontalOverflow(page), "horizontal overflow at the bottom (px)").toBeLessThanOrEqual(0);

        const family = preferences.locale === "fa" ? "Vazirmatn" : "Urbanist";
        expect(await fontLoaded(page, family), `${family} loaded`).toBe(true);
        const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
        expect(bodyFont, "body font stack").toMatch(new RegExp(family, "i"));

        expect(errors).toEqual([]);
      });
    }
  }
}
