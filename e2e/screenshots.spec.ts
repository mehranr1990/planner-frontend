import { expect, test, type Page } from "@playwright/test";
import { open, seedMode, SHOTS, type ModeName } from "./support/helpers";

/*
 * Step 3 (Wave 1 · 1C) reference screenshots (e2e/screenshots/1c). Full page for routes;
 * viewport for open overlays, where the fixed shell is what matters.
 */

test.describe.configure({ timeout: 60_000 });

async function shoot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage, animations: "disabled" });
}

const pages: { route: string; slug: string; mode: ModeName; widths: number[] }[] = [
  { route: "/personal", slug: "personal", mode: "light-ltr-en", widths: [1440, 1024, 768, 390] },
  { route: "/personal", slug: "personal", mode: "dark-rtl-fa", widths: [1440, 1024, 768, 390] },
  { route: "/personal/my-day", slug: "personal-my-day", mode: "light-ltr-en", widths: [1440, 390] },
  { route: "/personal/my-day", slug: "personal-my-day", mode: "dark-rtl-fa", widths: [1440, 390] },
  { route: "/personal/tasks", slug: "personal-tasks", mode: "dark-rtl-fa", widths: [1440, 390] },
  { route: "/personal/settings", slug: "personal-settings", mode: "light-ltr-en", widths: [1440] },
  { route: "/personal/focus", slug: "personal-focus", mode: "dark-rtl-fa", widths: [1440, 390] },
  { route: "/projects", slug: "projects", mode: "light-ltr-en", widths: [1440] },
  { route: "/styleguide/components", slug: "styleguide-components", mode: "light-ltr-en", widths: [1440, 390] },
  { route: "/styleguide/navigation", slug: "styleguide-navigation", mode: "light-ltr-en", widths: [1440, 390] },
];

for (const { route, slug, mode, widths } of pages) {
  for (const width of widths) {
    test(`screenshot ${slug} · ${mode} · ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedMode(page, mode);
      await open(page, route);
      const mobileShell = width < 1024 && !route.startsWith("/styleguide");
      if (!mobileShell) {
        await shoot(page, `${slug}-${mode}-${width}`);
        return;
      }
      // Below lg the bottom bar is position:fixed; a full-page capture would paint
      // it mid-page. Capture the viewport at the top and scrolled to the end instead.
      await shoot(page, `${slug}-${mode}-${width}`, false);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await shoot(page, `${slug}-${mode}-${width}-end`, false);
    });
  }
}

test.describe("shell overlays", () => {
  for (const mode of ["light-ltr-en", "dark-rtl-fa"] as const) {
    const fa = mode === "dark-rtl-fa";
    for (const width of [1440, 390]) {
      test(`overlays · ${mode} · ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await seedMode(page, mode);
        await open(page, "/personal");

        if (width === 1440) {
          // The context pill is the first button in the top bar.
          await page.getByRole("banner").getByRole("button").first().click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await shoot(page, `overlay-switcher-${mode}-${width}`, false);
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
        }

        await page.getByRole("button", { name: fa ? "منوی حساب" : "Account menu" }).click();
        await expect(page.getByRole("menu")).toBeVisible();
        await shoot(page, `overlay-profile-menu-${mode}-${width}`, false);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);

        await page.keyboard.press("Control+k");
        await expect(page.getByRole("combobox")).toBeFocused();
        await shoot(page, `overlay-command-palette-${mode}-${width}`, false);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("combobox")).toHaveCount(0);

        if (width === 390) {
          await page.locator('nav[data-scope] button[aria-haspopup="dialog"]').last().click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await shoot(page, `overlay-more-sheet-${mode}-${width}`, false);
          await page.keyboard.press("Escape");
          await page.locator('nav[data-scope] button[aria-haspopup="dialog"]').first().click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await shoot(page, `overlay-quick-add-${mode}-${width}`, false);
        } else {
          // Personal "+" → Universal Quick Add (centred sheet, ?sheet=quick-add).
          await page.getByRole("banner").getByRole("button", { name: fa ? "افزودن سریع" : "Quick add" }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await shoot(page, `overlay-quick-add-${mode}-${width}`, false);
          await page.keyboard.press("Escape");
          // The task drawer over the tasks list (P06).
          await open(page, "/personal/tasks");
          await page.locator('[data-probe="tasks"] a').first().click();
          await expect(page.locator("[data-task-drawer]")).toBeVisible();
          await shoot(page, `overlay-task-drawer-${mode}-${width}`, false);
        }
      });
    }
  }
});
