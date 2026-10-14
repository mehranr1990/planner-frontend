import { expect, test, type Page } from "@playwright/test";
import { collectErrors, cssVar, open, PERSIAN, seed } from "./support/helpers";

/*
 * Application shell (Step 2): desktop top bar, rail, context switcher,
 * command palette, account menu, notifications, quick create, assistant;
 * mobile header, chips, bottom bar and its sheets.
 */

const SHELL_ROOT = '[data-slot="scope-boundary"]';

const shellScope = (page: Page) => page.locator(SHELL_ROOT).getAttribute("data-scope");

/** Escape until no menu is open (a submenu needs two presses). */
async function closeMenus(page: Page) {
  for (let i = 0; i < 3 && (await page.locator('[role="menu"]').count()) > 0; i += 1) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
}

for (const width of [1440, 1024] as const) {
  test.describe(`desktop shell @ ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test.beforeEach(async ({ page }) => {
      await seed(page, "light");
    });

    test("top bar islands and rail landmark are present", async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, "/personal");
      const banner = page.getByRole("banner");
      await expect(banner).toHaveCount(1);
      await expect(banner.getByRole("link", { name: "Planner home" })).toBeVisible();
      await expect(banner.getByRole("button", { name: /Switch context/ })).toBeVisible();
      await expect(banner.getByRole("region", { name: "Today's schedule" })).toBeVisible();
      const actions = banner.getByRole("group", { name: "Quick actions" });
      await expect(actions).toBeVisible();
      for (const name of ["Search and commands", "Quick create", "Notifications", "Account menu"]) {
        await expect(actions.getByRole("button", { name })).toBeVisible();
      }
      // The search label shows from xl (1280); below it the button keeps its name.
      await expect(actions.getByText("Search", { exact: true })).toBeVisible({ visible: width >= 1280 });

      await expect(page.getByRole("navigation", { name: "Personal navigation" })).toBeVisible();
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();

      // Islands sit in one row and do not overlap each other.
      const boxes = await Promise.all(
        [
          banner.getByRole("link", { name: "Planner home" }),
          banner.getByRole("button", { name: /Switch context/ }),
          banner.getByRole("region", { name: "Today's schedule" }),
          actions,
        ].map((locator) => locator.boundingBox()),
      );
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i]!.x, `island ${i} starts after island ${i - 1}`).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 0.5);
      }
      expect(errors).toEqual([]);
    });

    test("context switcher picks a Projects workspace, navigates and re-tints", async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, "/personal");
      expect(await shellScope(page)).toBe("personal");
      const primaryBefore = await cssVar(page, SHELL_ROOT, "--primary");
      const ctaBefore = await page.getByRole("button", { name: "Plan my day" }).evaluate((el) => getComputedStyle(el).backgroundColor);

      const trigger = page.getByRole("button", { name: /Switch context/ });
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      const panel = page.getByRole("dialog", { name: "Switch context" });
      await expect(panel).toBeVisible();

      await panel.getByRole("button", { name: /^Projects/ }).click();
      const projects = panel.getByRole("group", { name: "Projects workspaces" });
      await expect(projects).toBeVisible();
      // "New project" is planned: disabled, not a working button.
      await expect(projects.getByRole("button", { name: "New project" })).toHaveAttribute("aria-disabled", "true");
      await projects.getByRole("button", { name: "Planner App" }).click();

      await expect(page).toHaveURL(/\/projects$/);
      await expect(panel).toBeHidden();
      await expect(page.getByRole("heading", { level: 1, name: "Projects overview" })).toBeVisible();
      await expect(page.locator(SHELL_ROOT)).toHaveAttribute("data-scope", "project");
      await expect(trigger).toContainText("Planner App");
      await expect(page.getByRole("navigation", { name: "Projects navigation" })).toBeVisible();

      const primaryAfter = await cssVar(page, SHELL_ROOT, "--primary");
      expect(primaryAfter).not.toBe(primaryBefore);
      const ctaAfter = await page.getByRole("button", { name: "New task" }).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(ctaAfter).not.toBe(ctaBefore);

      // Re-opening shows the chosen workspace as current.
      await trigger.click();
      await expect(panel.getByRole("button", { name: "Planner App", exact: true })).toHaveAttribute("aria-current", "true");
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(errors).toEqual([]);
    });

    test("rail expands and collapses; planned items are disabled, not links", async ({ page }) => {
      await open(page, "/personal");
      const rail = page.getByRole("navigation", { name: "Personal navigation" });
      const toggle = rail.getByRole("button", { name: "Expand navigation" });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      const collapsedWidth = (await rail.boundingBox())!.width;

      await toggle.click();
      const collapse = rail.getByRole("button", { name: "Collapse navigation" });
      await expect(collapse).toHaveAttribute("aria-expanded", "true");
      await expect(collapse).toBeFocused();
      await expect.poll(async () => (await rail.boundingBox())!.width).toBeGreaterThan(collapsedWidth + 100);
      await expect(rail.getByText("Coming soon").first()).toBeVisible();

      await collapse.click();
      await expect(rail.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false");

      // Exactly one link (the overview); every planned item is an aria-disabled button.
      await expect(rail.getByRole("link")).toHaveCount(1);
      await expect(rail.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
      for (const name of ["My Day", "Tasks", "Calendar", "Goals", "Habits", "Finance", "Journal", "Insights"]) {
        const item = rail.getByRole("button", { name, exact: true });
        await expect(item).toHaveAttribute("aria-disabled", "true");
        expect(await item.evaluate((el) => el.tagName)).toBe("BUTTON");
      }
      // Clicking a planned item goes nowhere.
      await rail.getByRole("button", { name: "Tasks", exact: true }).click({ force: true });
      await expect(page).toHaveURL(/\/personal$/);
    });

    test("Ctrl+K palette: filter, Enter navigates", async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, "/personal");
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Control+k");
      const palette = page.getByRole("dialog", { name: "Search and commands" });
      await expect(palette).toBeVisible();
      const input = palette.getByRole("combobox", { name: "Search pages" });
      await expect(input).toBeFocused();
      const all = await palette.getByRole("option").count();
      expect(all).toBeGreaterThan(20);

      await input.fill("proj");
      await expect.poll(() => palette.getByRole("option").count()).toBeLessThan(all);
      await expect(palette.getByRole("group", { name: "Projects" })).toBeVisible();
      await expect(palette.getByRole("group", { name: "Personal" })).toHaveCount(0);
      // The first available result is active and is the Projects overview.
      const activeId = await input.getAttribute("aria-activedescendant");
      await expect(page.locator(`[id="${activeId}"]`)).toContainText("Overview");
      // Planned entries are listed but disabled.
      await expect(palette.locator('[role="option"][aria-disabled="true"]').first()).toBeVisible();

      await input.fill("zzzz-no-match");
      await expect(palette.getByRole("option")).toHaveCount(0);
      await expect(palette.getByText(/zzzz-no-match/)).toBeVisible();

      await input.fill("proj");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/projects$/);
      await expect(palette).toBeHidden();
      expect(errors).toEqual([]);
    });

    test("palette Escape clears text first, then closes and returns focus to the trigger", async ({ page }) => {
      await open(page, "/personal");
      const searchButton = page.getByRole("button", { name: "Search and commands" });
      await searchButton.click();
      const palette = page.getByRole("dialog", { name: "Search and commands" });
      const input = palette.getByRole("combobox", { name: "Search pages" });
      await expect(input).toBeFocused();
      await input.pressSequentially("tea");
      await expect(input).toHaveValue("tea");

      await page.keyboard.press("Escape");
      await expect(input).toHaveValue("");
      await expect(palette).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(palette).toBeHidden();
      await expect(searchButton).toBeFocused();

      // Arrow keys move the active option; Enter on a planned entry does nothing.
      await page.keyboard.press("Control+k");
      await expect(input).toBeFocused();
      await page.keyboard.press("ArrowDown");
      const activeId = await input.getAttribute("aria-activedescendant");
      await expect(page.locator(`[id="${activeId}"]`)).toHaveAttribute("aria-disabled", "true");
      await page.keyboard.press("Enter");
      await expect(palette).toBeVisible();
      await expect(page).toHaveURL(/\/personal$/);
      await page.keyboard.press("Control+k");
      await expect(palette).toBeHidden();
    });

    test("profile menu changes theme, direction and digits independently", async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, "/personal");
      const html = page.locator("html");
      const account = page.getByRole("button", { name: "Account menu" });

      await account.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await menu.getByRole("menuitem", { name: /^Theme/ }).click();
      await page.getByRole("menuitemradio", { name: "Dark" }).click();
      await expect(html).toHaveAttribute("data-theme", "dark");
      // The row shows the current value (the submenu itself closes after a pointer pick, see report).
      await expect(menu.getByRole("menuitem", { name: /^Theme/ })).toContainText("Dark");
      await closeMenus(page);
      await expect(account).toBeFocused();
      await account.click();
      await page.getByRole("menuitem", { name: /^Theme/ }).click();
      await expect(page.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
      await closeMenus(page);

      // Direction alone: layout flips, language stays English.
      await account.click();
      await page.getByRole("menuitem", { name: /^Direction/ }).click();
      await page.getByRole("menuitemradio", { name: "Right to left" }).click();
      await expect(html).toHaveAttribute("dir", "rtl");
      await expect(html).toHaveAttribute("lang", "en");
      await closeMenus(page);

      // Rail moves to the right edge under RTL.
      const rail = await page.getByRole("navigation", { name: "Personal navigation" }).boundingBox();
      expect(rail!.x).toBeGreaterThan(page.viewportSize()!.width / 2);

      // Digits alone: schedule date becomes Persian digits, words stay English.
      await account.click();
      await page.getByRole("menuitem", { name: /^Digits/ }).click();
      await page.getByRole("menuitemradio", { name: "Persian ۱۲۳" }).click();
      await closeMenus(page);
      await expect(page.getByRole("region", { name: "Today's schedule" }).locator("time").first()).toContainText("۱۳");
      await expect(page.locator("main h1")).toHaveText("Personal overview");
      expect(errors).toEqual([]);
    });

    test("profile menu language switches to Persian", async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, "/personal");
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: /^Language/ }).click();
      await page.getByRole("menuitemradio", { name: "فارسی" }).click();
      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", "fa");
      await expect(html).toHaveAttribute("dir", "rtl");
      // The modal menu hides the page from the accessibility tree, so query the DOM.
      await expect(page.locator("main h1")).toHaveText("نمای کلی شخصی");
      // The open menu re-renders in Persian too.
      await expect(page.getByRole("menuitem", { name: /^زبان/ })).toBeVisible();
      await closeMenus(page);
      await expect(page.getByRole("button", { name: "منوی حساب" })).toBeFocused();
      expect(errors).toEqual([]);
    });

    test("notifications popover shows the empty state; Escape returns focus", async ({ page }) => {
      await open(page, "/personal");
      const bell = page.getByRole("banner").getByRole("button", { name: "Notifications" });
      await bell.click();
      const popover = page.getByRole("dialog", { name: "Notifications" });
      await expect(popover).toBeVisible();
      await expect(popover.getByText("You’re all caught up")).toBeVisible();
      await expect(popover.getByText("Notifications arrive in a later step.")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popover).toBeHidden();
      await expect(bell).toBeFocused();
    });

    test("quick create menu items are disabled; Escape returns focus", async ({ page }) => {
      await open(page, "/personal");
      const plus = page.getByRole("button", { name: "Quick create" });
      await plus.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      const items = menu.getByRole("menuitem");
      await expect(items).toHaveCount(6);
      for (const item of await items.all()) await expect(item).toHaveAttribute("aria-disabled", "true");
      await expect(menu.getByText("Coming soon").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(plus).toBeFocused();
    });

    test("assistant launcher opens its unavailable panel and closes", async ({ page }) => {
      await open(page, "/personal");
      const fab = page.getByRole("button", { name: "Assistant" });
      await expect(fab).toBeVisible();
      await fab.click();
      const panel = page.getByRole("dialog", { name: "Assistant" });
      await expect(panel).toBeVisible();
      await expect(panel.getByText("The assistant arrives in a later step")).toBeVisible();
      await panel.getByRole("button", { name: "Close" }).click();
      await expect(panel).toBeHidden();
      await expect(fab).toBeFocused();

      await fab.click();
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(fab).toBeFocused();
    });
  });
}

/* ------------------------------------------------------------------ mobile */

for (const width of [390, 768] as const) {
  test.describe(`mobile shell @ ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await seed(page, "light");
    });

    test("bottom nav is visible and never covers the end of the content", async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, "/personal");
      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(nav).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Personal navigation" })).toBeHidden();
      await expect(page.getByRole("button", { name: "Assistant", exact: true })).toBeHidden();

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(100);
      const geometry = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        // Deepest last rendered element of the page content.
        let last: Element = main;
        while (last.lastElementChild) last = last.lastElementChild;
        const contentBottom = Math.max(
          ...[...main.querySelectorAll("*")].map((el) => el.getBoundingClientRect().bottom),
        );
        const bar = document.querySelector('nav[aria-label="Primary"] ul')!.getBoundingClientRect();
        const fab = document.querySelector('nav[aria-label="Primary"] [aria-label="Quick add"]')!.getBoundingClientRect();
        return { contentBottom, lastBottom: last.getBoundingClientRect().bottom, barTop: bar.top, fabTop: fab.top };
      });
      expect(geometry.contentBottom, "content ends above the bottom bar").toBeLessThanOrEqual(geometry.barTop);
      expect(geometry.contentBottom, "content ends above the raised FAB").toBeLessThanOrEqual(geometry.fabTop);
      expect(errors).toEqual([]);
    });

    test("context chips scroll inside their row, not the page", async ({ page }) => {
      await open(page, "/projects");
      const chips = page.getByRole("navigation", { name: "Contexts" });
      await expect(chips).toBeVisible();
      await expect(chips.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const row = chips.locator("ul");
      expect(await row.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
      const { scrollWidth, clientWidth } = await row.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      if (scrollWidth > clientWidth) {
        await row.evaluate((el) => el.scrollBy({ left: 400 }));
        await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        expect(await page.evaluate(() => window.scrollX)).toBe(0);
      }
      // Chips navigate between contexts.
      await chips.getByRole("link", { name: "Teams" }).click();
      await expect(page).toHaveURL(/\/teams$/);
      await expect(page.locator(SHELL_ROOT)).toHaveAttribute("data-scope", "team");
    });

    test("FAB opens the Quick add sheet; Escape closes it and restores focus", async ({ page }) => {
      await open(page, "/personal");
      const fab = page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Quick add" });
      await fab.click();
      const sheet = page.getByRole("dialog", { name: "Quick add" });
      await expect(sheet).toBeVisible();
      // The open sheet is modal (page aria-hidden), so read the trigger from the DOM.
      await expect(page.locator('nav[aria-label="Primary"] [aria-label="Quick add"]')).toHaveAttribute("aria-expanded", "true");
      const tiles = sheet.locator('button[aria-disabled="true"]');
      await expect(tiles).toHaveCount(6);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(fab).toBeFocused();
    });

    test("More opens the nav sheet; choosing the overview navigates and closes it", async ({ page }) => {
      await open(page, "/teams");
      const more = page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "More" });
      await more.click();
      const sheet = page.getByRole("dialog", { name: "Teams pages" });
      await expect(sheet).toBeVisible();
      await expect(page.locator('nav[aria-label="Primary"] button[aria-haspopup="dialog"]').last()).toHaveAttribute("aria-expanded", "true");
      await expect(sheet.getByRole("list", { name: "All Teams pages" })).toBeVisible();
      await expect(sheet.getByRole("button", { name: "People" })).toHaveAttribute("aria-disabled", "true");

      // Escape closes and restores focus to More.
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(more).toBeFocused();

      // Go to another context, then use More → Overview.
      await page.getByRole("navigation", { name: "Contexts" }).getByRole("link", { name: "Companies" }).click();
      await expect(page).toHaveURL(/\/companies$/);
      await more.click();
      const companies = page.getByRole("dialog", { name: "Companies pages" });
      await expect(companies).toBeVisible();
      await companies.getByRole("link", { name: "Overview" }).click();
      await expect(page).toHaveURL(/\/companies$/);
      await expect(companies).toBeHidden();
    });

    test("More → Assistant opens the assistant sheet", async ({ page }) => {
      await open(page, "/personal");
      await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "More" }).click();
      await page.getByRole("dialog", { name: "Personal pages" }).getByRole("button", { name: /Assistant/ }).click();
      const assistant = page.getByRole("dialog", { name: "Assistant" });
      await expect(assistant).toBeVisible();
      await expect(assistant.getByText("The assistant arrives in a later step")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(assistant).toBeHidden();
    });

    test("RTL: bottom nav order is mirrored and the layout stays inside the viewport", async ({ page }) => {
      const errors = collectErrors(page);
      await seed(page, "light", PERSIAN);
      await open(page, "/personal");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const nav = page.getByRole("navigation", { name: "اصلی" });
      await expect(nav).toBeVisible();
      const overview = await nav.getByRole("link", { name: "نمای کلی" }).boundingBox();
      const fab = await nav.getByRole("button", { name: "افزودن سریع" }).boundingBox();
      const more = await nav.getByRole("button", { name: "بیشتر" }).boundingBox();
      expect(overview!.x, "first item on the right").toBeGreaterThan(fab!.x);
      expect(fab!.x, "More on the left").toBeGreaterThan(more!.x);
      for (const box of [overview!, fab!, more!]) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      // Account at inline-start (right), bell at inline-end (left).
      const account = await page.getByRole("button", { name: "منوی حساب" }).boundingBox();
      const bell = await page.getByRole("banner").getByRole("button", { name: "اعلان‌ها" }).boundingBox();
      expect(account!.x).toBeGreaterThan(bell!.x);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  });
}
