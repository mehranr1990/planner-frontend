import { test, type Page } from "@playwright/test";
import { open, seedAnyMode, type AnyModeName } from "./support/helpers";

/*
 * P02 My Day reference screenshots (e2e/screenshots/p02) for the visual QA pass:
 * the real route across theme × direction × width, and the demo-harness states.
 */

test.describe.configure({ timeout: 60_000 });

const OUT = "e2e/screenshots/p02";

async function shoot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage, animations: "disabled" });
}

const matrix: { mode: AnyModeName; widths: number[] }[] = [
  { mode: "light-ltr-en", widths: [1440, 1280, 1100, 1024, 390] },
  { mode: "dark-ltr-en", widths: [1440] },
  { mode: "light-rtl-fa", widths: [1440, 1280, 1100, 1024, 390] },
  { mode: "dark-rtl-fa", widths: [1440, 1024, 390] },
];

for (const { mode, widths } of matrix) {
  for (const width of widths) {
    test(`my-day · ${mode} · ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 1024 ? 844 : 900 });
      await seedAnyMode(page, mode);
      await open(page, "/personal/my-day");
      await shoot(page, `my-day-${mode}-${width}`, width >= 1024);
    });
  }
}

const states = ["empty", "partial", "overloaded", "no-current"] as const;
for (const state of states) {
  for (const width of [1440, 390]) {
    test(`my-day state · ${state} · light-ltr-en · ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 1024 ? 844 : 900 });
      await seedAnyMode(page, "light-ltr-en");
      await open(page, `/styleguide/my-day?state=${state}`);
      await shoot(page, `state-${state}-${width}`, width >= 1024);
    });
  }
}

test("my-day · reschedule popover · light-ltr-en · 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAnyMode(page, "light-ltr-en");
  await open(page, "/styleguide/my-day?state=normal&reschedule=client-call");
  await shoot(page, "reschedule-1440", false);
});

test("my-day · reschedule sheet · light-ltr-en · 390", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAnyMode(page, "light-ltr-en");
  await page.goto("/styleguide/my-day?state=normal&reschedule=client-call");
  await page.waitForTimeout(800);
  await shoot(page, "reschedule-390", false);
});

test("my-day · 3 days · light-ltr-en · 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAnyMode(page, "light-ltr-en");
  await open(page, "/personal/my-day?view=3days");
  await shoot(page, "three-days-1440");
});

test("my-day · tray open · light-ltr-en · 390", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAnyMode(page, "light-ltr-en");
  await open(page, "/personal/my-day");
  await page.locator('[data-slot="unscheduled-zone"]:visible button[aria-expanded]').click();
  await shoot(page, "my-day-tray-open-390", false);
});
