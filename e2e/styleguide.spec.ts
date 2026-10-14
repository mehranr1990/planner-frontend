import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type Theme = "light" | "dark";
type Dir = "ltr" | "rtl";

const WIDTHS = [1440, 390] as const;

const PERSIAN = { locale: "fa", direction: "rtl", digits: "fa", currency: "toman", calendar: "jalali" } as const;
const ENGLISH = { locale: "en", direction: "ltr", digits: "latn", currency: "toman", calendar: "gregorian" } as const;

/** Preferences travel in a cookie, exactly as the app writes them. */
async function setPreferencesCookie(context: BrowserContext, preferences: Record<string, string>) {
  await context.addCookies([
    {
      name: "mp-preferences",
      value: encodeURIComponent(JSON.stringify(preferences)),
      url: test.info().project.use.baseURL!,
    },
  ]);
}

/** Seed theme (next-themes, localStorage) + preferences (cookie). RTL uses Persian. */
async function seed(page: Page, theme: Theme, dir: Dir) {
  await setPreferencesCookie(page.context(), dir === "rtl" ? PERSIAN : ENGLISH);
  await page.addInitScript((themeValue) => window.localStorage.setItem("theme", themeValue), theme);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function openStyleguide(page: Page) {
  await page.goto("/styleguide");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of ["light", "dark"] as const) {
  for (const dir of ["ltr", "rtl"] as const) {
    for (const width of WIDTHS) {
      test(`styleguide ${theme} · ${dir} · ${width}px`, async ({ page }) => {
        const errors = collectErrors(page);
        await page.setViewportSize({ width, height: 900 });
        await seed(page, theme, dir);
        await openStyleguide(page);

        const html = page.locator("html");
        await expect(html).toHaveAttribute("data-theme", theme);
        await expect(html).toHaveAttribute("dir", dir);
        await expect(html).toHaveAttribute("lang", dir === "rtl" ? "fa" : "en");

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);

        const family = dir === "rtl" ? "Vazirmatn" : "Urbanist";
        const fontLoaded = await page.evaluate(
          (name) => [...document.fonts].some((face) => face.family.includes(name) && face.status === "loaded"),
          family,
        );
        expect(fontLoaded, `${family} loaded`).toBe(true);

        await page.screenshot({
          path: `e2e/screenshots/styleguide-${theme}-${dir}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });

        expect(errors).toEqual([]);
      });
    }
  }
}

test("controls switch theme, direction, digits and currency", async ({ page }) => {
  const errors = collectErrors(page);
  await seed(page, "light", "ltr");
  await openStyleguide(page);
  const html = page.locator("html");

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const canvas = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim(),
  );
  expect(canvas.toUpperCase()).toBe("#121412");

  await page.getByRole("radio", { name: "RTL" }).click();
  await expect(html).toHaveAttribute("dir", "rtl");
  // Language is independent: still English, but mirrored icons now flip.
  await expect(html).toHaveAttribute("lang", "en");
  const chevronScale = await page
    .getByRole("region", { name: "Icons · mirror or keep" })
    .locator("svg.lucide-chevron-right")
    .evaluate((icon) => getComputedStyle(icon).scale);
  expect(chevronScale).toBe("-1 1");
  const searchScale = await page
    .getByRole("region", { name: "Icons · mirror or keep" })
    .locator("svg.lucide-search")
    .first()
    .evaluate((icon) => getComputedStyle(icon).scale);
  expect(searchScale).toBe("none");

  await page.getByRole("radio", { name: "Persian digits" }).click();
  const numbers = page.getByRole("region", { name: "Digits & money" });
  await expect(numbers.getByText("۲٬۰۰۰٬۰۰۰ Toman").first()).toBeVisible();

  await page.getByRole("radio", { name: "Rial" }).click();
  await expect(numbers.getByText("۲۰٬۰۰۰٬۰۰۰ IRR").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("mirroring follows direction, not language", async ({ page }) => {
  await seed(page, "light", "rtl");
  await openStyleguide(page);
  const icons = page.locator("#icons");
  const chevronScale = () =>
    icons.locator("svg.lucide-chevron-right").evaluate((icon) => getComputedStyle(icon).scale);
  expect(await chevronScale()).toBe("-1 1");

  // Persian text laid out LTR: nothing should flip.
  await page.getByRole("radio", { name: "LTR" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  expect(await chevronScale()).toBe("none");
});

test("preferences persist across reloads via the cookie", async ({ page, context }) => {
  const errors = collectErrors(page);
  // Start from English: the test switches to Persian (the no-cookie default).
  await setPreferencesCookie(context, ENGLISH);
  await openStyleguide(page);
  await page.getByRole("radio", { name: "فارسی" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("radio", { name: "ریال" }).click();

  const cookie = (await context.cookies()).find((entry) => entry.name === "mp-preferences");
  expect(JSON.parse(decodeURIComponent(cookie!.value))).toMatchObject({ locale: "fa", direction: "rtl", currency: "rial" });

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "پایه‌ها" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "ریال" })).toHaveAttribute("aria-checked", "true");
  expect(errors).toEqual([]);
});

test.describe("first render comes from the server (JavaScript disabled)", () => {
  test.use({ javaScriptEnabled: false });

  test("Persian cookie: Persian, RTL, Persian digits and Jalali before any script runs", async ({ page }) => {
    await setPreferencesCookie(page.context(), PERSIAN);
    await page.goto("/styleguide");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "fa");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("پایه‌ها");
    await expect(page.getByText("سه‌شنبه ۲۱ مهر ۱۴۰۵").first()).toBeVisible();
    await expect(page.getByText("۲٬۰۰۰٬۰۰۰ تومان").first()).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("برنامه‌ریز مهران");
  });

  test("no cookie: Persian, RTL, Persian digits, Jalali", async ({ page }) => {
    // Persian is the first-run default (product decision #8).
    await page.goto("/styleguide");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "fa");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("پایه‌ها");
    await expect(page.getByText("سه‌شنبه ۲۱ مهر ۱۴۰۵").first()).toBeVisible();
    await expect(page.getByText("۲٬۰۰۰٬۰۰۰ تومان").first()).toBeVisible();
  });

  test("independent combination: Persian text, LTR layout, Latin digits, Gregorian, Rial", async ({ page }) => {
    await setPreferencesCookie(page.context(), { locale: "fa", direction: "ltr", digits: "latn", currency: "rial", calendar: "gregorian" });
    await page.goto("/styleguide");
    await expect(page.locator("html")).toHaveAttribute("lang", "fa");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("پایه‌ها");
    await expect(page.getByText("20,000,000 ریال").first()).toBeVisible();
    await expect(page.getByRole("radio", { name: "میلادی" })).toHaveAttribute("aria-checked", "true");
  });
});

/** Resolves once React has hydrated: it attaches fiber keys to hydrated DOM nodes. */
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const heading = document.querySelector("h1");
    return Boolean(heading && Object.keys(heading).some((key) => key.startsWith("__reactFiber")));
  });
  // Let any recoverable hydration error queued during commit reach the console.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

test("hydrates every preference combination with matching output", async ({ browser }) => {
  // 16 fresh contexts in one test: the Step 2 styleguide is heavier, so 30s is too tight.
  test.setTimeout(120_000);
  const heading = { en: "Foundations", fa: "پایه‌ها" } as const;
  const jalaliYear = { latn: "1405", fa: "۱۴۰۵" } as const;
  const amount = { toman: { latn: "2,000,000", fa: "۲٬۰۰۰٬۰۰۰" }, rial: { latn: "20,000,000", fa: "۲۰٬۰۰۰٬۰۰۰" } } as const;

  for (const locale of ["en", "fa"] as const) {
    for (const direction of ["ltr", "rtl"] as const) {
      for (const digits of ["latn", "fa"] as const) {
        for (const [currency, calendar] of [["toman", "jalali"], ["rial", "gregorian"]] as const) {
          const label = `${locale}/${direction}/${digits}/${currency}/${calendar}`;
          const context = await browser.newContext();
          await setPreferencesCookie(context, { locale, direction, digits, currency, calendar });
          const page = await context.newPage();
          const errors = collectErrors(page);
          await page.goto("/styleguide");
          await waitForHydration(page);

          await expect(page.locator("html"), label).toHaveAttribute("dir", direction);
          await expect(page.locator("html"), label).toHaveAttribute("lang", locale);
          await expect(page.getByRole("heading", { level: 1 }), label).toHaveText(heading[locale]);
          const numbers = page.locator("#numbers");
          await expect(numbers.getByText(amount[currency][digits]).first(), label).toBeVisible();
          await expect(page.locator("#dates").getByText(jalaliYear[digits]).first(), label).toBeVisible();
          expect(errors, label).toEqual([]);
          await context.close();
        }
      }
    }
  }
});

test("a change in one tab reaches server-rendered output in another", async ({ context }) => {
  await setPreferencesCookie(context, ENGLISH);
  const home = await context.newPage();
  await home.goto("/");
  await waitForHydration(home);
  await expect(home.getByRole("heading", { level: 1 })).toHaveText("Mehran Planner");

  const controls = await context.newPage();
  await controls.goto("/styleguide");
  await waitForHydration(controls);
  await controls.getByRole("radio", { name: "فارسی" }).click();

  // The home page heading is a Server Component (getTranslations): it only
  // changes if the receiving tab refreshes its server output.
  await expect(home.getByRole("heading", { level: 1 })).toHaveText("برنامه‌ریز مهران");
  await expect(home.locator("html")).toHaveAttribute("dir", "rtl");
});

test("keyboard focus is visible", async ({ page }) => {
  await seed(page, "light", "ltr");
  await openStyleguide(page);
  const light = page.getByRole("radio", { name: "Light" });
  await light.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(light).toBeFocused();
  const outline = await light.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline).toEqual({ style: "solid", width: "3px" });

  // Arrow keys move within the radiogroup (roving focus).
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Dark" })).toBeFocused();
});

test("touch targets are at least 48px", async ({ page }) => {
  await seed(page, "light", "ltr");
  await page.setViewportSize({ width: 390, height: 900 });
  await openStyleguide(page);
  const sizes = await page
    .getByRole("group", { name: "Preview settings" })
    .getByRole("radio")
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
  expect(sizes.length).toBeGreaterThan(0);
  for (const height of sizes) expect(height).toBeGreaterThanOrEqual(48);
});

test("reduced motion is respected", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStyleguide(page);
  await expect(page.getByTestId("reduced-motion-on")).toBeVisible();
});
