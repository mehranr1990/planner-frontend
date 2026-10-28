import { expect, test, type Page } from "@playwright/test";
import { collectErrors, horizontalOverflow, open, openSheetRoute, PERSIAN, SAMPLE_TASK, seed } from "./support/helpers";

/*
 * P02 My Day (the real screen): desktop composition, the three Signature
 * cards, Add block and Start focus, the phone composition (PM01), Persian RTL,
 * and the demo harness at /styleguide/my-day?state=… that shows the spec
 * tab's states (empty, partial, overloaded, no current block, after hours,
 * Reschedule) on isolated data.
 */

const DEMO = "/styleguide/my-day";
const blocks = (page: Page) => page.locator('[data-slot="time-block"]');
const signature = (page: Page) => page.locator('[data-slot="signature-surface"]:visible');
const rail = (page: Page) => page.locator('[data-slot="my-day-rail"]');

test.describe("desktop @ 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => seed(page, "light"));

  test("the board: header, timeline, and the rail Now · Focus · Priorities · Unscheduled", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal/my-day");
    await expect(page.getByRole("heading", { level: 1, name: "My Day" })).toBeVisible();
    await expect(page.locator("[data-skeleton]")).toHaveCount(0);
    await expect(blocks(page)).toHaveCount(7);

    await expect(rail(page)).toBeVisible();
    const headings = await rail(page).getByRole("heading", { level: 2 }).allTextContents();
    expect(headings).toEqual(["UI design · My Day screen", "Focus · Pomodoro", "Priorities", "Unscheduled"]);
    await expect(page.getByRole("radiogroup", { name: "Energy today" })).toBeVisible();
    await expect(page.getByText("6h 15m of 8h planned").filter({ visible: true })).toBeVisible();
    // The phone-only pieces stay out of the desktop screen.
    await expect(page.getByRole("navigation", { name: "Today" })).toBeHidden();

    // Exactly three Signature cards, each with its one notch action.
    await expect(signature(page)).toHaveCount(3);
    await expect(page.locator('[data-slot="notch-action"]:visible button')).toHaveCount(3);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("the timeline sits in a 1.55 : 1 grid with the rail", async ({ page }) => {
    await open(page, "/personal/my-day");
    await expect(blocks(page)).toHaveCount(7);
    const timeline = (await page.getByRole("region", { name: "Timeline" }).boundingBox())!;
    const column = (await rail(page).boundingBox())!;
    expect(timeline.width / column.width).toBeGreaterThan(1.4);
    expect(timeline.width / column.width).toBeLessThan(1.7);
    expect(column.x).toBeGreaterThan(timeline.x);
  });

  test("Add block opens Quick add; Start focus goes to the running task", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal/my-day");
    await expect(blocks(page)).toHaveCount(7);
    await page.getByRole("button", { name: "Add block" }).click();
    await expect(page).toHaveURL(/\/personal\/my-day\?sheet=quick-add$/);
    await expect(page.locator('[data-sheet="quick-add"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-sheet]")).toHaveCount(0);

    await page.getByRole("link", { name: "Start focus · 25m" }).click();
    await expect(page).toHaveURL(new RegExp(`/personal/focus\\?task=${SAMPLE_TASK}$`));
    await expect(page.getByRole("main", { name: "Focus" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the day and view live in the URL (?date=, ?view=3days)", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal/my-day?date=1405-07-22&view=3days");
    await expect(page.getByRole("radio", { name: "3 days" })).toBeChecked();
    // Another day: the Now card (live treatment) is not drawn.
    await expect(page.getByRole("button", { name: "Mark done" })).toHaveCount(0);
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page).toHaveURL(/\/personal\/my-day\?view=3days$/);
    expect(errors).toEqual([]);
  });

  test("Quick add opens over My Day from a ?sheet= link", async ({ page }) => {
    await openSheetRoute(page, "/personal/my-day?sheet=quick-add");
    await expect(page.locator('[data-sheet="quick-add"]')).toBeVisible();
  });

  test("Persian RTL: Persian title, notch at the top-left", async ({ page }) => {
    const errors = collectErrors(page);
    await seed(page, "dark", PERSIAN);
    await open(page, "/personal/my-day");
    await expect(page.getByRole("heading", { level: 1, name: "روز من" })).toBeVisible();
    await expect(blocks(page)).toHaveCount(7);
    const card = (await page.getByRole("region", { name: "خط زمان" }).boundingBox())!;
    const notch = (await page.locator('[data-slot="notch-action"]:visible').first().boundingBox())!;
    expect(notch.x + notch.width / 2).toBeLessThan(card.x + card.width / 2);
    // The rail mirrors to the other side of the timeline.
    expect((await rail(page).boundingBox())!.x).toBeLessThan(card.x);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});

test.describe("phone @ 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.beforeEach(async ({ page }) => seed(page, "light"));

  test("PM01 Today · Plan: free chip, Overview | Plan switch, timeline card, collapsed tray", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/personal/my-day");
    await expect(blocks(page)).toHaveCount(7);

    await expect(page.getByText("1h 45m free").filter({ visible: true })).toBeVisible();
    const today = page.getByRole("navigation", { name: "Today" });
    await expect(today.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    // No desktop pieces: no rail, no notch, no Add block.
    await expect(rail(page)).toBeHidden();
    await expect(signature(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add block" })).toHaveCount(0);

    const scroller = page.locator('[data-slot="timeline-scroller"]');
    await expect(scroller).toBeVisible();
    expect((await scroller.boundingBox())!.height).toBeLessThanOrEqual(480);

    const tray = page.getByRole("button", { name: /^Unscheduled · 4/ });
    await expect(tray).toHaveAttribute("aria-expanded", "false");
    // The tray clears the floating bottom nav.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const nav = (await page.getByRole("navigation", { name: "Primary" }).boundingBox())!;
    const trayBox = (await tray.boundingBox())!;
    expect(trayBox.y + trayBox.height).toBeLessThanOrEqual(nav.y);

    await tray.click();
    await expect(tray).toHaveAttribute("aria-expanded", "true");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("Persian RTL: no overflow, Overview on the right of the switch", async ({ page }) => {
    await seed(page, "light", PERSIAN);
    await open(page, "/personal/my-day");
    await expect(blocks(page)).toHaveCount(7);
    const today = page.getByRole("navigation", { name: "امروز" });
    const links = today.getByRole("link");
    const first = (await links.nth(0).boundingBox())!;
    const second = (await links.nth(1).boundingBox())!;
    expect(first.x).toBeGreaterThan(second.x);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("demo harness · /styleguide/my-day", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => seed(page, "light"));

  test("is shell-less and not part of the production navigation", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, DEMO);
    await expect(blocks(page)).toHaveCount(7);
    await expect(page.locator("nav[data-rail]")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
    expect(errors).toEqual([]);
    await open(page, "/personal");
    await expect(page.locator(`a[href^="${DEMO}"]`)).toHaveCount(0);
  });

  test("empty: the empty day box with the day's own numbers", async ({ page }) => {
    await open(page, `${DEMO}?state=empty`);
    await expect(page.getByRole("heading", { name: "Nothing planned yet" })).toBeVisible();
    await expect(blocks(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pick top 3" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add block" }).first()).toBeVisible();
  });

  test("partial: free gaps say how many tasks fit", async ({ page }) => {
    await open(page, `${DEMO}?state=partial`);
    await expect(page.getByText(/\d+ tasks? fit/).first()).toBeVisible();
  });

  test("overloaded: rose chip, overlap chip, and Move 2 opens Reschedule on Tomorrow", async ({ page }) => {
    await open(page, `${DEMO}?state=overloaded`);
    // Desktop shows the bar in the timeline card; the phone row and compact chip are hidden from lg.
    await expect(page.getByText("Overloaded · 9h 40m of 8h").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("1 overlap").filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/overlaps 30m/).first()).toBeVisible();
    await page.getByRole("button", { name: "Move 2 to tomorrow" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Move 2 blocks" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("menuitem", { name: /Tomorrow/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("no-current and after-hours: nothing is live, so no volt Now card", async ({ page }) => {
    for (const state of ["no-current", "after-hours"]) {
      await open(page, `${DEMO}?state=${state}`);
      await expect(blocks(page).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Mark done" })).toHaveCount(0);
      await expect(page.getByText(/^Now · /)).toHaveCount(0);
      await expect(page.getByText(/^Up next · |^Free right now$/).first()).toBeVisible();
    }
  });

  test("reschedule=<block> opens the popover on mount; Escape closes it", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, `${DEMO}?state=overloaded&reschedule=blk-t-od-client-prep`);
    const dialog = page.getByRole("dialog", { name: "Reschedule “Client prep”" });
    await expect(dialog).toBeVisible();
    // Tuesday: the next working day is Wednesday = Tomorrow, so that row is folded away (it shows on Thu/Fri).
    await expect(dialog.getByRole("menuitem")).toHaveCount(4);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("every state fits 390px without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const state of ["normal", "empty", "partial", "overloaded", "no-current", "after-hours"]) {
      await open(page, `${DEMO}?state=${state}`);
      await page.getByRole("button", { name: /^Unscheduled/ }).first().waitFor();
      expect(await horizontalOverflow(page), state).toBeLessThanOrEqual(0);
    }
  });

  test("the styleguide section lists the states and links to them", async ({ page }) => {
    await page.goto("/styleguide/components");
    const section = page.locator("#my-day-states");
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole("link", { name: "Open full screen" })).toHaveCount(8);
    await expect(section.getByRole("heading", { name: "Nothing planned yet" })).toBeVisible();
    await expect(section.getByText("Dragging · 45m → snaps 15m")).toBeVisible();
  });
});
