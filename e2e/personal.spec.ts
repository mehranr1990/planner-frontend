import { expect, test, type Page } from "@playwright/test";
import { collectErrors, hideModules, open, openSheetRoute, PERSIAN, REVIEW_WEEK, SAMPLE_TASK, seed } from "./support/helpers";

/*
 * The Personal shell (Wave 1 · 1C, P00PersonalIA · P17 · P18 · PM01):
 * grouped icon-only rail with the Inbox badge, hidden modules, the
 * shell-less Focus route, the intercepted task drawer, mobile Today / More,
 * the global sheet host, and no Assistant.
 */

const rail = (page: Page) => page.getByRole("navigation", { name: "Personal navigation" });
const primary = (page: Page) => page.getByRole("navigation", { name: "Primary" });

test.describe("desktop @ 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => seed(page, "light"));

  test("rail: icon-only, 3 groups + Settings, Inbox badge, no expand toggle", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal/my-day");
    const nav = rail(page);
    await expect(nav).toHaveAttribute("data-rail", "grouped");
    await expect(nav.getByRole("button", { name: /navigation/ })).toHaveCount(0);
    const hrefs = await nav.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs).toEqual([
      "/personal",
      "/personal/my-day",
      "/personal/tasks",
      "/personal/calendar",
      "/personal/goals",
      "/personal/habits",
      "/personal/finance",
      "/personal/journal",
      "/personal/insights",
      "/personal/inbox",
      "/personal/brain-dump",
      "/personal/settings",
    ]);
    await expect(nav.locator('[data-slot="rail-separator"]')).toHaveCount(2);
    await expect(nav.getByRole("link", { name: "My Day" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Inbox, 6 to triage" })).toBeVisible();
    // Icon-only: about the 64px of the board, never the 232px expanded rail.
    expect((await nav.boundingBox())!.width).toBeLessThanOrEqual(72);
    // Settings sits after the capture group.
    const settings = (await nav.getByRole("link", { name: "Settings" }).boundingBox())!;
    const brainDump = (await nav.getByRole("link", { name: "Brain Dump" }).boundingBox())!;
    expect(settings.y).toBeGreaterThan(brainDump.y);
    expect(errors).toEqual([]);
  });

  test("rail mirrors to the right edge in Persian RTL", async ({ page }) => {
    await seed(page, "dark", PERSIAN);
    await open(page, "/personal");
    const box = (await page.getByRole("navigation", { name: "ناوبری شخصی" }).boundingBox())!;
    expect(box.x).toBeGreaterThan(1440 / 2);
  });

  test("hidden modules leave the rail, search and More; deep links render Module hidden · Turn on (200, no 404)", async ({ page, context }) => {
    const errors = collectErrors(page);
    await hideModules(context, ["finance", "goals"]);
    await open(page, "/personal");
    await expect(rail(page).getByRole("link", { name: "Finance" })).toHaveCount(0);
    await expect(rail(page).getByRole("link", { name: "Goals" })).toHaveCount(0);
    // The optional group keeps Journal and Insights, so both separators stay.
    await expect(rail(page).locator('[data-slot="rail-separator"]')).toHaveCount(2);

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    await palette.getByRole("combobox").fill("finance");
    await expect(palette.getByRole("group", { name: "Personal" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    for (const url of ["/personal/finance", "/personal/goals/g-launch"]) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await open(page, url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Turn (Finance|Goals) on$/ })).toBeVisible();
      await expect(page.locator("[data-skeleton]")).toHaveCount(0);
    }

    // Turn on restores the page and the rail item.
    await page.getByRole("button", { name: "Turn Goals on" }).click();
    await expect(page.locator('[data-screen="goals"]')).toBeVisible();
    await expect(rail(page).getByRole("link", { name: "Goals" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("hidden module gates its sheet too", async ({ page, context }) => {
    await hideModules(context, ["finance"]);
    await openSheetRoute(page, "/personal/tasks?sheet=expense");
    const sheet = page.locator('[data-sheet="expense"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Turn Finance on" })).toBeVisible();
  });

  test("Focus is shell-less: no banner, rail or bottom nav; Leave focus returns to My Day", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, `/personal/focus?task=${SAMPLE_TASK}`);
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.locator("nav[data-rail]")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Assistant" })).toHaveCount(0);
    await expect(page.getByRole("main", { name: "Focus" })).toBeVisible();
    await expect(page.getByText("UI design · My Day screen")).toBeVisible();
    await page.getByRole("link", { name: "Leave focus" }).click();
    await expect(page).toHaveURL(/\/personal\/my-day$/);
    await expect(rail(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("task detail: soft navigation opens the 520px drawer over the list; Escape and Back close it", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal/tasks");
    const first = page.locator('[data-probe="tasks"] a').first();
    const href = (await first.getAttribute("href"))!;
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(page.locator("[data-task-drawer]")).toBeVisible();
    expect(Math.round((await drawer.boundingBox())!.width)).toBe(520);
    // The list page stays underneath (the route was intercepted).
    await expect(page.locator("[data-tasks-list]")).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/personal\/tasks$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Focus returns to the task that opened the drawer.
    await expect(page.locator(`[data-probe="tasks"] a[href="${href}"]`)).toBeFocused();

    await page.locator('[data-probe="tasks"] a').nth(1).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/personal\/tasks$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("task detail: a hard load renders the full page, no drawer", async ({ page }) => {
    await open(page, `/personal/tasks/${SAMPLE_TASK}`);
    await expect(page.locator('[data-skeleton="taskDetail"]')).toBeVisible();
    await expect(page.locator("[data-task-drawer]")).toHaveCount(0);
    await expect(page.getByText("UI design · My Day screen")).toBeVisible();
  });

  test("/personal/tasks/create is never swallowed by the task drawer (soft navigation, no reload)", async ({ page }) => {
    await open(page, "/personal/tasks");
    // A client navigation (the route interception applies to these); the marker proves no page load happened.
    await page.evaluate(() => {
      const w = window as unknown as { __softNav?: boolean; next: { router: { push(href: string): void } } };
      w.__softNav = true;
      w.next.router.push("/personal/tasks/create");
    });
    await expect(page).toHaveURL(/\/personal\/tasks\/create$/);
    await expect(page.locator('[data-screen="task-create"]')).toBeVisible();
    await expect(page.locator("[data-task-drawer]")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __softNav?: boolean }).__softNav)).toBe(true);
  });

  test("top-bar + opens Universal Quick Add over the route; Escape removes only ?sheet and returns focus", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal/tasks?view=board");
    const plus = page.getByRole("banner").getByRole("button", { name: "Quick add" });
    await plus.click();
    await expect(page).toHaveURL(/\/personal\/tasks\?view=board&sheet=quick-add$/);
    const sheet = page.getByRole("dialog", { name: "Universal Quick Add" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/personal\/tasks\?view=board$/);
    await expect(plus).toBeFocused();
    // Closing consumed the history entry: Back leaves the page, it does not "do nothing".
    await open(page, "/personal/calendar");
    await page.getByRole("banner").getByRole("button", { name: "Quick add" }).click();
    await expect(page).toHaveURL(/\/personal\/calendar\?sheet=quick-add$/);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/personal\/calendar$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/personal\/tasks\?view=board$/);
    expect(errors).toEqual([]);
  });

  test("a sheet that arrived with the URL closes by dropping the parameter", async ({ page }) => {
    await openSheetRoute(page, "/personal/inbox?tab=triage&sheet=note");
    await expect(page.locator('[data-sheet="note"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/personal\/inbox\?tab=triage$/);
    await expect(page.locator('[data-sheet="note"]')).toHaveCount(0);
  });

  test("⌘K offers Quick add only inside Personal (the sheet host lives there)", async ({ page }) => {
    await open(page, "/projects");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    await palette.getByRole("combobox").fill("quick");
    await expect(palette.getByRole("option", { name: /Quick add/ })).toHaveCount(0);
  });

  test("sheet host follows the P18 container rule", async ({ page }) => {
    for (const [id, side] of [
      ["quick-add", "center"],
      ["expense", "center"],
      ["habit", "end"],
      ["goal", "end"],
    ] as const) {
      await openSheetRoute(page, `/personal/my-day?sheet=${id}`);
      await expect(page.locator(`[data-sheet="${id}"]`)).toHaveAttribute("data-side", side);
    }
    // Quick note: a floating panel, non-modal on desktop — the page stays usable.
    await openSheetRoute(page, "/personal/my-day?sheet=note");
    const note = page.locator('[data-sheet="note"]');
    await expect(note).toBeVisible();
    await expect(note).not.toHaveAttribute("aria-modal", "true");
    await expect(rail(page).getByRole("link", { name: "Tasks" })).toBeVisible();
  });

  test("command palette: ⌘K → Quick add, and Personal pages are real links", async ({ page }) => {
    await open(page, "/personal");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    const input = palette.getByRole("combobox");
    await input.fill("calendar");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/personal\/calendar$/);
    await page.keyboard.press("Control+k");
    await palette.getByRole("combobox").fill("quick");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/personal\/calendar\?sheet=quick-add$/);
  });

  test("no Assistant on Personal; still on Projects", async ({ page }) => {
    await open(page, "/personal");
    await expect(page.getByRole("button", { name: "Assistant", exact: true })).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Assistant" })).toHaveCount(0);
    await open(page, "/projects");
    await expect(page.getByRole("button", { name: "Assistant", exact: true })).toBeVisible();
  });

  test("/personal/review redirects to this week's review", async ({ page }) => {
    await page.goto("/personal/review");
    await expect(page).toHaveURL(new RegExp(`${REVIEW_WEEK}$`));
  });
});

test.describe("mobile @ 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.beforeEach(async ({ page }) => seed(page, "light"));

  test("bottom nav: Today · Tasks · (+) · Calendar · More; Today covers Overview and My Day", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal");
    const nav = primary(page);
    const names = await nav.locator("a, button").evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim()),
    );
    expect(names).toEqual(["Today", "Tasks", "Quick add", "Calendar", "More"]);
    await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");

    // The Overview ⇄ Plan switch (PM01) lives on both Today pages.
    const today = page.getByRole("navigation", { name: "Today" });
    await expect(today.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await today.getByRole("link", { name: "Plan" }).click();
    await expect(page).toHaveURL(/\/personal\/my-day$/);
    await expect(page.getByRole("navigation", { name: "Today" }).getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("nav[data-rail]")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("bottom nav mirrors in RTL (Today on the right)", async ({ page }) => {
    await seed(page, "light", PERSIAN);
    await open(page, "/personal");
    const nav = page.getByRole("navigation", { name: "اصلی" });
    const today = (await nav.getByRole("link", { name: "امروز" }).boundingBox())!;
    const more = (await nav.getByRole("button", { name: "بیشتر" }).boundingBox())!;
    expect(today.x).toBeGreaterThan(more.x);
  });

  test("More: 8 module tiles in order with the Inbox badge, then Finish day and Weekly review", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal");
    await primary(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "Personal pages" });
    await expect(sheet).toBeVisible();
    const tiles = sheet.getByRole("list", { name: "Modules" }).getByRole("link");
    expect(await tiles.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual([
      "/personal/goals",
      "/personal/habits",
      "/personal/finance",
      "/personal/journal",
      "/personal/insights",
      "/personal/inbox",
      "/personal/brain-dump",
      "/personal/settings",
    ]);
    await expect(sheet.getByRole("link", { name: "Inbox, 6 to triage" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Assistant/ })).toHaveCount(0);
    const review = sheet.getByRole("link", { name: /Weekly review/ });
    await expect(review).toHaveAttribute("href", REVIEW_WEEK);
    await sheet.getByRole("link", { name: /Finish your day/ }).click();
    await expect(page).toHaveURL(/\/personal\/shutdown$/);
    await expect(sheet).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("More drops hidden modules", async ({ page, context }) => {
    await hideModules(context, ["finance", "braindump"]);
    await open(page, "/personal");
    await primary(page).getByRole("button", { name: "More" }).click();
    const tiles = page.getByRole("dialog", { name: "Personal pages" }).getByRole("list", { name: "Modules" }).getByRole("link");
    await expect(tiles).toHaveCount(6);
  });

  test("centre +: tap opens Quick Add, long-press opens Voice; Escape returns focus to +", async ({ page }) => {
    await open(page, "/personal");
    const fab = primary(page).getByRole("button", { name: "Quick add" });
    await fab.click();
    await expect(page).toHaveURL(/\?sheet=quick-add$/);
    await expect(page.getByRole("dialog", { name: "Universal Quick Add" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/personal$/);
    await expect(fab).toBeFocused();

    const box = (await fab.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(page).toHaveURL(/\?sheet=voice$/);
    await expect(page.getByRole("dialog", { name: "Voice capture" })).toBeVisible();
  });

  test("task detail is a full-screen view on mobile", async ({ page }) => {
    await open(page, "/personal/tasks");
    // Below lg the ⤢ link is hidden: tapping the title opens the detail.
    await page.locator("#task-title-t-ui-design").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    expect(Math.round((await drawer.boundingBox())!.width)).toBe(390);
  });

  test("header: account · Personal + name · bell; no context chips or digits toggle", async ({ page }) => {
    await open(page, "/personal");
    const header = page.getByRole("banner");
    await expect(header.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Notifications" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Contexts" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Persian digits ۱۲۳" })).toHaveCount(0);
  });
});
