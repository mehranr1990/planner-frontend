import { expect, test } from "@playwright/test";
import { collectErrors, fontLoaded, horizontalOverflow, MODES, open, seedMode, type ModeName } from "./support/helpers";

/*
 * Every route × {light-ltr-en, dark-rtl-fa} × {390, 768, 1024, 1440}: no
 * console or page errors (hydration mismatches included), no horizontal
 * overflow, and the locale's font is loaded.
 */

const ROUTES = ["/", "/personal", "/projects", "/teams", "/companies", "/styleguide", "/styleguide/components", "/styleguide/navigation", "/styleguide/rules"] as const;
const WIDTHS = [390, 768, 1024, 1440] as const;

test.describe.configure({ timeout: 60_000 });

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
