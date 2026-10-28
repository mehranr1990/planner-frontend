import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { collectErrors, open, seedAnyMode, type AnyModeName } from "./helpers";

/*
 * Helpers for the P02 My Day interaction specs: opening the screen, mapping
 * timeline minutes to pixels, and driving real mouse / touch drags.
 */

/** Every test fails on console and page errors. */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors = collectErrors(page);
      await use(errors);
      expect(errors, "console / page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const DESKTOP = { width: 1440, height: 1400 } as const;
export const PHONE = { width: 390, height: 844 } as const;

export interface OpenOptions {
  path?: string;
  mode?: AnyModeName;
  viewport?: { width: number; height: number };
  /** Wait for at least one timeline block (false for the empty day). */
  blocks?: boolean;
}

/** The real route by default; "/styleguide/my-day?state=…" for an isolated demo state. */
export async function openMyDay(
  page: Page,
  { path = "/personal/my-day", mode = "light-ltr-en", viewport = DESKTOP, blocks = true }: OpenOptions = {},
) {
  await page.setViewportSize(viewport);
  await seedAnyMode(page, mode);
  await open(page, path);
  if (blocks) await page.locator('[data-slot="time-block"]').first().waitFor();
  // Let the data settle (counts, capacity) before the test acts.
  await page.waitForLoadState("networkidle");
}

/** The block card whose text matches. */
export function block(page: Page, title: string | RegExp): Locator {
  return page.locator('[data-slot="time-block"]').filter({ hasText: title });
}

/** The draggable role=button inside a block (carries the aria-label). */
export function blockButton(page: Page, title: string | RegExp): Locator {
  return block(page, title).locator("[aria-roledescription]").first();
}

/** An Unscheduled row (the copy that is on screen: card on desktop, tray on a phone). */
export function unscheduledRow(page: Page, title: string | RegExp): Locator {
  return unscheduledZone(page).getByRole("button", { name: title });
}

export function unscheduledZone(page: Page): Locator {
  return page.locator('[data-slot="unscheduled-zone"]:visible');
}

export function toasts(page: Page): Locator {
  return page.locator("li[data-tone]");
}

export function toast(page: Page, text: string | RegExp): Locator {
  return toasts(page).filter({ hasText: text });
}

export function liveRegion(page: Page): Locator {
  return page.locator('[data-slot="my-day-live-region"]');
}

/** y (viewport px) of a minute-of-day on the single-day grid, from the drawn hour lines. */
export async function yAt(page: Page, minutes: number): Promise<number> {
  return page.evaluate((target) => {
    const lines = [...document.querySelectorAll<HTMLElement>('[data-slot="hour-line"]')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        minutes: Number((el.textContent ?? "").trim().split(":")[0]) * 60,
        top: el.getBoundingClientRect().top,
      }));
    const first = lines[0];
    const last = lines[lines.length - 1];
    if (!first || !last || first === last) throw new Error("no hour lines");
    const scale = (last.top - first.top) / (last.minutes - first.minutes);
    return first.top + (target - first.minutes) * scale;
  }, minutes);
}

/** Pixels per minute of the visible grid. */
export async function pxPerMinute(page: Page): Promise<number> {
  return (await yAt(page, 600)) - (await yAt(page, 599));
}

/** Horizontal centre of a day column (the first one, or the one for `day`). */
export async function columnX(page: Page, day?: string): Promise<number> {
  const column = page.locator(day ? `[data-slot="day-column"][data-day="${day}"]` : '[data-slot="day-column"]').first();
  const box = await column.boundingBox();
  if (!box) throw new Error("no day column");
  return box.x + box.width / 2;
}

export async function center(locator: Locator): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press on `from`, travel past the 4px activation distance, then move to `to` in steps. The button stays down. */
export async function dragStart(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 14) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3, from.y + 6, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps });
}

/** A whole drag: down, move, (optional hook while held), up. */
export async function dragAndDrop(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  whileHeld?: () => Promise<void>,
) {
  await dragStart(page, from, to);
  if (whileHeld) await whileHeld();
  await page.mouse.up();
}

/** The block button's aria-label ("Title, 18:30 – 18:50, 20m, …"). */
export async function blockLabel(page: Page, title: string | RegExp): Promise<string> {
  return (await blockButton(page, title).getAttribute("aria-label")) ?? "";
}
