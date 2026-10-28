import type { Locator, Page } from "@playwright/test";
import { horizontalOverflow } from "./support/helpers";
import {
  block,
  blockButton,
  blockLabel,
  center,
  columnX,
  dragAndDrop,
  dragStart,
  expect,
  liveRegion,
  openMyDay,
  pxPerMinute,
  test,
  toast,
  toasts,
  unscheduledRow,
  unscheduledZone,
  yAt,
  PHONE,
} from "./support/my-day";

/*
 * P02 My Day in a real browser (production build): drag and drop, resize,
 * keyboard drag, overlaps, reschedule, energy and filters, the Now card, the
 * demo states, the 3-days view and the phone tray. Real mouse, keyboard and
 * touch events; every test fails on console or page errors. Each page load
 * starts from fresh in-memory fixtures.
 */

test.describe.configure({ timeout: 60_000 });

const KATY = "Reply to Katy’s brief";
const capacity = (page: Page) => page.getByRole("group", { name: "Capacity" }).first();

test.describe("drag an Unscheduled row onto the timeline", () => {
  test("lands at the snapped 15-minute start, updates counts, toasts, Undo restores", async ({ page }) => {
    await openMyDay(page);
    await expect(capacity(page)).toContainText("6h 15m of 8h planned");
    await expect(unscheduledZone(page)).toContainText("4 tasks · 2h 05m");
    await expect(page.locator('[data-slot="free-slot"]')).toContainText("18:30");

    const row = unscheduledRow(page, KATY);
    // 18:41 is closest to the 18:45 line.
    const target = { x: await columnX(page), y: (await yAt(page, 18 * 60 + 41)) };
    await dragStart(page, await center(row), target);

    // While held: the lifted card and the hatched ghost at the snap target.
    const overlay = page.locator('[data-slot="drag-overlay-card"]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("Dragging · 20m → snaps 15m");
    const ghost = page.locator('[data-slot="drag-ghost"]');
    await expect(ghost).toBeVisible();
    const ghostBox = (await ghost.boundingBox())!;
    expect(Math.abs(ghostBox.y - (await yAt(page, 18 * 60 + 45)))).toBeLessThan(2);
    // 20 minutes is shorter than the 24px floor of a block.
    expect(Math.abs(ghostBox.height - Math.max(24, 20 * (await pxPerMinute(page)) - 4))).toBeLessThan(2);
    await page.mouse.up();

    // A block at 18:45 – 19:05; the row left Unscheduled.
    await expect(block(page, "Katy")).toHaveCount(1);
    expect(await blockLabel(page, "Katy")).toContain("18:45 – 19:05");
    await expect(unscheduledRow(page, KATY)).toHaveCount(0);
    await expect(unscheduledZone(page)).toContainText("3 tasks · 1h 45m");
    await expect(capacity(page)).toContainText("6h 35m of 8h planned");
    await expect(capacity(page)).toContainText("1h 25m free");

    // Toast with Undo.
    const done = toast(page, "Scheduled “Reply to Katy’s brief” at 18:45");
    await expect(done).toBeVisible();
    await done.getByRole("button", { name: "Undo" }).click();
    await expect(block(page, "Katy")).toHaveCount(0);
    await expect(unscheduledRow(page, KATY)).toHaveCount(1);
    await expect(unscheduledZone(page)).toContainText("4 tasks · 2h 05m");
    await expect(capacity(page)).toContainText("6h 15m of 8h planned");
  });

  test("dropping on the placeholder lands exactly at 18:30", async ({ page }) => {
    await openMyDay(page);
    const from = await center(unscheduledRow(page, KATY));
    const box = (await page.locator('[data-slot="free-slot"]').boundingBox())!;
    await dragAndDrop(page, from, { x: box.x + box.width / 2, y: box.y + 6 });
    expect(await blockLabel(page, "Katy")).toContain("18:30 – 18:50");
    // The placeholder moves on to the next free slot.
    await expect(page.locator('[data-slot="free-slot"]')).toContainText("19:00");
  });

  test("a free gap earlier in the day takes it too", async ({ page }) => {
    await openMyDay(page);
    // 12:00 – 13:00 is free.
    await dragAndDrop(page, await center(unscheduledRow(page, "Pay electricity bill")), {
      x: await columnX(page),
      y: (await yAt(page, 12 * 60 + 5)),
    });
    expect(await blockLabel(page, "Pay electricity bill")).toContain("12:00 – 12:10");
    await expect(toast(page, "Scheduled “Pay electricity bill” at 12:00")).toBeVisible();
  });
});

test.describe("scrolling while dragging", () => {
  test("the page scrolling under a held pointer does not shift the drop time", async ({ page }) => {
    // A short window, so the page has to scroll and the pointer sits over the timeline.
    await openMyDay(page, { viewport: { width: 1440, height: 760 } });
    const row = unscheduledRow(page, KATY);
    const from = await center(row);
    const x = await columnX(page);
    await dragStart(page, from, { x, y: 380 });
    const before = await page.evaluate(() => window.scrollY);
    // (The page is usually already at the bottom here: scroll the other way.)
    await page.mouse.wheel(0, before > 140 ? -140 : 140);
    await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
    // The page settles (including any auto-scroll), then the pointer is still where it was.
    await page.waitForTimeout(600);
    const perMinute = await pxPerMinute(page);
    const minuteUnderPointer = 8 * 60 + (380 - (await yAt(page, 8 * 60))) / perMinute;
    const expected = Math.round(minuteUnderPointer / 15) * 15;
    await page.mouse.move(x, 380 + 1);
    await page.mouse.move(x, 380);
    const settled = 8 * 60 + (380 - (await yAt(page, 8 * 60))) / perMinute;
    await page.mouse.up();
    const start = Math.round(settled / 15) * 15;
    const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    expect(Math.abs(settled - minuteUnderPointer)).toBeLessThan(20);
    expect(expected % 15).toBe(0);
    expect(await blockLabel(page, "Katy")).toContain(`${clock(start)} – `);
  });
});

test.describe("drag a timeline block", () => {
  test("moves with 15-minute snap; lifted card and ghost show while the mouse is down", async ({ page }) => {
    await openMyDay(page);
    // The Gym routine (17:15 – 18:15) is a movable, non-done block; move it to the free hour at 12:00.
    const gym = blockButton(page, "Gym");
    const start = await center(gym);
    const grabOffset = start.y - (await yAt(page, 17 * 60 + 15));
    const dropY = (await yAt(page, 12 * 60 + 7)) + grabOffset; // 12:07 snaps to 12:00
    await dragStart(page, start, { x: start.x, y: dropY });

    await expect(page.locator('[data-slot="drag-overlay-card"]')).toBeVisible();
    const ghost = page.locator('[data-slot="drag-ghost"]');
    await expect(ghost).toBeVisible();
    expect(Math.abs((await ghost.boundingBox())!.y - (await yAt(page, 12 * 60)))).toBeLessThan(2);
    // The original dims while it is lifted.
    await expect(block(page, "Gym")).toHaveClass(/opacity-40/);
    await page.mouse.up();

    expect(await blockLabel(page, "Gym")).toContain("12:00 – 13:00");
    const done = toast(page, "Moved “Gym” to 12:00");
    await expect(done).toBeVisible();
    await done.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => blockLabel(page, "Gym")).toContain("17:15 – 18:15");
  });

  test("reduced motion: the same drag works (no drop animation)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openMyDay(page);
    const gym = blockButton(page, "Gym");
    const start = await center(gym);
    const grabOffset = start.y - (await yAt(page, 17 * 60 + 15));
    await dragAndDrop(page, start, { x: start.x, y: (await yAt(page, 12 * 60 + 30)) + grabOffset }, async () => {
      await expect(page.locator('[data-slot="drag-ghost"]')).toBeVisible();
    });
    expect(await blockLabel(page, "Gym")).toContain("12:30 – 13:30");
    // The block itself does not animate to its place.
    expect(await block(page, "Gym").evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("none");
    await expect(page.locator('[data-slot="drag-overlay-card"]')).toHaveCount(0);
  });

  test("done blocks do not drag", async ({ page }) => {
    await openMyDay(page);
    const review = block(page, "Design review");
    await expect(review).toHaveAttribute("data-done", "true");
    const start = await center(review);
    await dragStart(page, start, { x: start.x, y: start.y + 150 });
    await expect(page.locator('[data-slot="drag-overlay-card"]')).toHaveCount(0);
    await page.mouse.up();
    expect(await blockLabel(page, "Design review")).toContain("11:00 – 11:45");
  });
});

test.describe("resize", () => {
  test("pointer: drag the bottom edge, 15-minute snap, live label, min 15m", async ({ page }) => {
    await openMyDay(page);
    const gym = block(page, "Gym");
    await gym.hover();
    const handle = gym.locator('[data-slot="resize-handle"][data-edge="end"]');
    const box = (await handle.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const perMinute = await pxPerMinute(page);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 5, { steps: 3 });
    // +30 minutes.
    await page.mouse.move(from.x, from.y + 30 * perMinute, { steps: 8 });
    // Live: the label shows the new range and length while the button is down.
    const label = gym.locator('[data-slot="resize-label"]');
    await expect(label).toBeVisible();
    await expect(label).toContainText("17:15 – 18:45");
    await expect(label).toContainText("1h 30m");
    await page.mouse.up();
    expect(await blockLabel(page, "Gym")).toContain("17:15 – 18:45");
    await expect(toast(page, "Gym")).toBeVisible();

    // Squeeze it past the minimum: it stops at 15 minutes.
    await gym.hover();
    const box2 = (await gym.locator('[data-slot="resize-handle"][data-edge="end"]').boundingBox())!;
    const from2 = { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 };
    await page.mouse.move(from2.x, from2.y);
    await page.mouse.down();
    await page.mouse.move(from2.x, from2.y - 8, { steps: 3 });
    await page.mouse.move(from2.x, from2.y - 200 * perMinute, { steps: 10 });
    await page.mouse.up();
    expect(await blockLabel(page, "Gym")).toContain("17:15 – 17:30");
  });

  test("keyboard: Shift+ArrowDown grows by 15m, Shift+ArrowUp shrinks, floor at 15m", async ({ page }) => {
    await openMyDay(page);
    const gym = blockButton(page, "Gym");
    await gym.focus();
    await page.keyboard.press("Shift+ArrowDown");
    await expect(liveRegion(page)).toContainText("17:15 – 18:30");
    await page.keyboard.press("Shift+ArrowDown");
    await expect.poll(() => blockLabel(page, "Gym")).toContain("17:15 – 18:45");
    for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowUp");
    await expect.poll(() => blockLabel(page, "Gym")).toContain("17:15 – 17:30");
    await expect(liveRegion(page)).toContainText("17:15 – 17:30");
    // Alt+Shift moves the start edge.
    await page.keyboard.press("Alt+Shift+ArrowUp");
    await expect.poll(() => blockLabel(page, "Gym")).toContain("17:00 – 17:30");
  });
});


test.describe("keyboard drag", () => {
  test("Space lifts, arrows move 15m, Enter drops; announcements through the live region", async ({ page }) => {
    await openMyDay(page);
    const row = unscheduledRow(page, KATY);
    await row.focus();
    // The lifted card carries the screen-reader instructions.
    await expect(row).toHaveAttribute("aria-describedby", /DndDescribedBy/);
    await expect(page.locator('[id^="DndDescribedBy"]')).toContainText("Press Space to lift");

    await page.keyboard.press("Space");
    await expect(liveRegion(page)).toContainText("Picked up Reply to Katy’s brief.");
    await expect(page.locator('[data-slot="drag-overlay-card"]')).toBeVisible();

    await page.keyboard.press("ArrowDown");
    const first = /Reply to Katy’s brief at (\d\d):(\d\d), /;
    await expect(liveRegion(page)).toHaveText(first);
    const [, hh, mm] = (await liveRegion(page).textContent())!.match(first)!;
    const start = Number(hh) * 60 + Number(mm);
    expect(start % 15).toBe(0);
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
    const expected = `${String(Math.floor((start + 45) / 60)).padStart(2, "0")}:${String((start + 45) % 60).padStart(2, "0")}`;
    await expect(liveRegion(page)).toContainText(`at ${expected}, `);
    await expect(page.locator('[data-slot="drag-ghost"]')).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(unscheduledRow(page, KATY)).toHaveCount(0);
    expect(await blockLabel(page, "Katy")).toContain(`${expected} – `);
    await expect(toast(page, "Scheduled “Reply to Katy’s brief”")).toBeVisible();
    await expect(liveRegion(page)).toContainText("scheduled at");
  });

  test("Escape cancels: nothing changes and it says so", async ({ page }) => {
    await openMyDay(page);
    await unscheduledRow(page, KATY).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(liveRegion(page)).toContainText("Cancelled. Reply to Katy’s brief stays where it was.");
    await expect(page.locator('[data-slot="drag-overlay-card"]')).toHaveCount(0);
    await expect(block(page, "Katy")).toHaveCount(0);
    await expect(unscheduledRow(page, KATY)).toHaveCount(1);
    await expect(toasts(page)).toHaveCount(0);
  });

  test("a block lifts with Space too and moves with the arrows", async ({ page }) => {
    await openMyDay(page);
    const gym = blockButton(page, "Gym");
    await gym.focus();
    await page.keyboard.press("Space");
    await expect(liveRegion(page)).toContainText("Picked up Gym.");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(liveRegion(page)).toContainText("Gym at 16:45, ");
    await page.keyboard.press("Enter");
    await expect.poll(() => blockLabel(page, "Gym")).toContain("16:45 – 17:45");
    await expect(toast(page, "Moved “Gym” to 16:45")).toBeVisible();
  });

  test("far past the end of the day: nothing is saved", async ({ page }) => {
    await openMyDay(page);
    await unscheduledRow(page, KATY).focus();
    await page.keyboard.press("Space");
    for (let i = 0; i < 70; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(unscheduledRow(page, KATY)).toHaveCount(1);
    await expect(block(page, "Katy")).toHaveCount(0);
    await expect(toast(page, "Scheduled")).toHaveCount(0);
    await expect(liveRegion(page)).toContainText(/stays where it was|can't go there/);
  });
});

test.describe("overlaps and rejected drops", () => {
  test("an overlapping drop is allowed but flagged: text, toast, overload chip", async ({ page }) => {
    await openMyDay(page);
    const from = await center(unscheduledRow(page, KATY));
    // 15:15 – 15:35 sits inside UI design (14:00 – 16:00).
    const to = { x: await columnX(page), y: await yAt(page, 15 * 60 + 15) };
    await dragStart(page, from, to);
    // The ghost already warns while hovering.
    await expect(page.locator('[data-slot="drag-ghost"]')).toHaveAttribute("data-overlapping", "true");
    await page.mouse.up();

    const katy = block(page, "Katy");
    await expect(katy).toHaveAttribute("data-overlap", "true");
    await expect(katy).toContainText("overlaps 20m");
    await expect(block(page, "UI design")).toHaveAttribute("data-overlap", "true");
    expect(await blockLabel(page, "Katy")).toContain("overlaps 20m");

    const warning = toasts(page).filter({ hasText: "Overlaps UI design · My Day screen by 20m" });
    await expect(warning).toBeVisible();
    await expect(warning).toHaveAttribute("data-tone", "warning");
    await expect(warning.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(liveRegion(page)).toContainText("Overlaps UI design");

    // Not silent: the capacity chip and the overload strip say so.
    await expect(page.getByRole("region", { name: "Timeline" })).toContainText("1 overlap");
    await expect(capacity(page).locator('[data-state="over"]')).toHaveText("Overloaded");

    await warning.getByRole("button", { name: "Undo" }).click();
    await expect(block(page, "Katy")).toHaveCount(0);
    await expect(block(page, "UI design")).not.toHaveAttribute("data-overlap", "true");
  });

  test("dropping outside the timeline is rejected: card settles back, nothing saved, announced", async ({ page }) => {
    await openMyDay(page);
    const from = await center(unscheduledRow(page, KATY));
    // Over the page title.
    await dragAndDrop(page, from, { x: 300, y: 140 });
    await expect(liveRegion(page)).toContainText("Dropped outside the timeline. Reply to Katy’s brief stays where it was.");
    await expect(block(page, "Katy")).toHaveCount(0);
    await expect(unscheduledRow(page, KATY)).toHaveCount(1);
    await expect(toasts(page)).toHaveCount(0);
  });

  test("a block dropped outside the timeline stays where it was", async ({ page }) => {
    await openMyDay(page);
    const start = await center(blockButton(page, "Gym"));
    await dragAndDrop(page, start, { x: 300, y: 140 });
    expect(await blockLabel(page, "Gym")).toContain("17:15 – 18:15");
    await expect(liveRegion(page)).toContainText("Dropped outside the timeline. Gym stays where it was.");
  });
});

test.describe("take a block off the timeline", () => {
  test("a task block dropped on Unscheduled is unscheduled, with Undo", async ({ page }) => {
    await openMyDay(page);
    const start = await center(blockButton(page, "UI design"));
    const zone = (await unscheduledZone(page).boundingBox())!;
    await dragStart(page, start, { x: zone.x + zone.width / 2, y: zone.y + 90 });
    await expect(unscheduledZone(page)).toHaveAttribute("data-drop-over", "true");
    await page.mouse.up();

    await expect(block(page, "UI design")).toHaveCount(0);
    await expect(unscheduledRow(page, "UI design · My Day screen")).toHaveCount(1);
    await expect(unscheduledZone(page)).toContainText("5 tasks");
    const done = toast(page, "“UI design · My Day screen” is back in Unscheduled");
    await expect(done).toBeVisible();
    await expect(capacity(page)).toContainText("4h 15m of 8h planned");
    await done.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => blockLabel(page, "UI design")).toContain("14:00 – 16:00");
    await expect(unscheduledZone(page)).toContainText("4 tasks");
  });

  test("events and routines cannot be unscheduled", async ({ page }) => {
    await openMyDay(page);
    for (const title of ["Client call", "Gym"]) {
      const start = await center(blockButton(page, title));
      const zone = (await unscheduledZone(page).boundingBox())!;
      await dragStart(page, start, { x: zone.x + zone.width / 2, y: zone.y + 90 });
      // It is not offered as a target while an event is lifted.
      await expect(unscheduledZone(page)).not.toHaveAttribute("data-drop-ready", "true");
      await page.mouse.up();
      // The card settles back before it can be grabbed again.
      await expect(page.locator('[data-slot="drag-overlay-card"]')).toHaveCount(0);
      await expect(block(page, title)).toHaveCount(1);
      await expect(liveRegion(page)).toContainText(`Only tasks can go back to Unscheduled. ${title} stays where it was.`);
    }
    await expect(unscheduledZone(page)).toContainText("4 tasks");
  });
});

test.describe("reschedule", () => {
  test("⋯ button opens the popover; Tomorrow moves the block with Undo; Esc returns focus", async ({ page }) => {
    await openMyDay(page);
    const call = block(page, "Client call");
    await call.hover();
    const opener = page.getByRole("button", { name: "Reschedule Client call" });
    await opener.click();

    const dialog = page.getByRole("dialog", { name: "Reschedule “Client call”" });
    await expect(dialog).toBeVisible();
    const items = dialog.getByRole("menuitem");
    // An event: no "Back to Unscheduled"; tomorrow is the next working day, so that row folds into it.
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("Later today · 16:00");
    await expect(items.nth(1)).toContainText("Tomorrow · 10:30");
    await expect(items.nth(1)).toContainText("best fit");
    await expect(items.nth(2)).toContainText("Pick date & time…");

    // Esc closes it and focus goes back to the control that opened it.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await call.hover();
    await opener.click();
    await dialog.getByRole("menuitem", { name: /Tomorrow/ }).click();
    await expect(dialog).toBeHidden();
    await expect(block(page, "Client call")).toHaveCount(0);
    const moved = toast(page, /Moved .*Client call.* to tomorrow at 10:30/);
    await expect(moved).toBeVisible();
    await moved.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => blockLabel(page, "Client call")).toContain("16:30 – 17:00");
  });

  test("right-click opens it at the pointer", async ({ page }) => {
    await openMyDay(page);
    await block(page, "Client call").click({ button: "right" });
    const dialog = page.getByRole("dialog", { name: "Reschedule “Client call”" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("R on a focused block opens it, and Esc puts focus back on the block", async ({ page }) => {
    await openMyDay(page);
    const call = blockButton(page, "Client call");
    await call.focus();
    await page.keyboard.press("r");
    const dialog = page.getByRole("dialog", { name: "Reschedule “Client call”" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(call).toBeFocused();
  });

  test("Back to Unscheduled takes a task block off the day", async ({ page }) => {
    await openMyDay(page);
    await blockButton(page, "UI design").focus();
    await page.keyboard.press("r");
    const dialog = page.getByRole("dialog", { name: /Reschedule/ });
    await dialog.getByRole("menuitem", { name: /Back to Unscheduled/ }).click();
    await expect(block(page, "UI design")).toHaveCount(0);
    await expect(unscheduledRow(page, "UI design · My Day screen")).toHaveCount(1);
  });
});

test.describe("energy and the Unscheduled filters", () => {
  const rowTitles = (page: Page) => unscheduledZone(page).getByRole("listitem").locator("bdi").allTextContents();

  test("Low / Medium / High: aria-checked, order, muted rows", async ({ page }) => {
    await openMyDay(page);
    const group = page.getByRole("radiogroup", { name: "Energy today" });
    const radio = (name: string) => group.getByRole("radio", { name });
    await expect(radio("Medium")).toHaveAttribute("aria-checked", "true");
    expect(await rowTitles(page)).toEqual(["Pay electricity bill", "Reply to Katy’s brief", "Review October expenses", "Plan weekend trip"]);
    await expect(page.locator("[data-exceeds-energy]")).toHaveCount(0);

    await radio("Low").click();
    await expect(radio("Low")).toHaveAttribute("aria-checked", "true");
    await expect(radio("Medium")).toHaveAttribute("aria-checked", "false");
    // Work that needs more than low energy goes below, muted.
    expect(await rowTitles(page)).toEqual(["Pay electricity bill", "Plan weekend trip", "Reply to Katy’s brief", "Review October expenses"]);
    await expect(page.locator("[data-exceeds-energy]")).toHaveCount(2);
    await expect(unscheduledRow(page, KATY)).toHaveAttribute("title", "Needs medium energy");

    await radio("High").click();
    await expect(radio("High")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("[data-exceeds-energy]")).toHaveCount(0);
    expect(await rowTitles(page)).toEqual(["Pay electricity bill", "Reply to Katy’s brief", "Review October expenses", "Plan weekend trip"]);

    await radio("Medium").click();
    await expect(radio("Medium")).toHaveAttribute("aria-checked", "true");
  });

  test("Today / Overdue / This week show the right tasks and counts", async ({ page }) => {
    await openMyDay(page);
    const zone = unscheduledZone(page);
    const pills = zone.getByRole("radiogroup", { name: "Filter unscheduled tasks" });
    await expect(pills.getByRole("radio", { name: /Overdue/ })).toContainText("1");

    await pills.getByRole("radio", { name: /Overdue/ }).click();
    await expect(pills.getByRole("radio", { name: /Overdue/ })).toHaveAttribute("aria-checked", "true");
    expect(await rowTitles(page)).toEqual(["Pay electricity bill"]);
    await expect(zone).toContainText("1 task · 10m");

    await pills.getByRole("radio", { name: "This week" }).click();
    await expect(zone.getByRole("listitem").first()).toBeVisible();
    const week = await rowTitles(page);
    expect(week).toContain("Renew car insurance");
    expect(week).not.toContain("Pay electricity bill");
    expect(week).not.toContain("Reply to Katy’s brief");

    await pills.getByRole("radio", { name: "Today" }).click();
    await expect(zone).toContainText("4 tasks · 2h 05m");
    expect(await rowTitles(page)).toHaveLength(4);
  });

  test("S auto-fits the selected row into the next free gap", async ({ page }) => {
    await openMyDay(page);
    await unscheduledRow(page, KATY).focus();
    await page.keyboard.press("s");
    await expect(toast(page, /Scheduled for/)).toBeVisible();
    await expect(block(page, "Katy")).toHaveCount(1);
    await expect(unscheduledRow(page, KATY)).toHaveCount(0);
  });
});

test.describe("Now card and Focus", () => {
  test("Start focus goes to the Focus route with the task", async ({ page }) => {
    await openMyDay(page);
    await page.getByRole("link", { name: /Start focus · 25m/ }).click();
    await expect(page).toHaveURL(/\/personal\/focus\?task=t-ui-design$/);
  });

  test("the Focus card's play button goes there too", async ({ page }) => {
    await openMyDay(page);
    await page.getByRole("region", { name: "Focus" }).getByRole("button", { name: "Start focus" }).click();
    await expect(page).toHaveURL(/\/personal\/focus\?task=t-ui-design$/);
  });

  test("Mark done completes the block (hatched, struck, done) and the volt card flips", async ({ page }) => {
    await openMyDay(page);
    const now = page.getByRole("region", { name: "Now" });
    await expect(now).toContainText("UI design · My Day screen");
    await expect(now.getByRole("button", { name: "Mark done" })).toBeVisible();
    await now.getByRole("button", { name: "Mark done" }).click();

    const ui = block(page, "UI design");
    await expect(ui).toHaveAttribute("data-done", "true");
    await expect(ui).toContainText("done");
    expect(await blockLabel(page, "UI design")).toContain("done");
    await expect(ui.locator(".line-through")).toHaveCount(1);
    expect(await ui.locator("[aria-roledescription]").evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
      "repeating-linear-gradient",
    );

    // Nothing is running any more: the card is the plain "up next" one, not volt.
    await expect(now).toContainText("Up next · 16:30");
    await expect(now).toContainText("Client call");
    await expect(now.getByRole("button", { name: "Mark done" })).toHaveCount(0);
    await expect(now.getByRole("link", { name: /Start focus/ })).toHaveCount(0);

    const done = toast(page, "Marked done");
    await expect(done).toBeVisible();
    await done.getByRole("button", { name: "Undo" }).click();
    await expect(block(page, "UI design")).not.toHaveAttribute("data-done", "true");
    await expect(page.getByRole("region", { name: "Now" }).getByRole("button", { name: "Mark done" })).toBeVisible();
  });

  test("no running block: Start focus asks which task", async ({ page }) => {
    await openMyDay(page, { path: "/styleguide/my-day?state=no-current" });
    const now = page.getByRole("region", { name: "Now" });
    await expect(now).toContainText("Up next");
    await now.getByRole("button", { name: "Start focus" }).click();
    const picker = page.getByRole("dialog", { name: "Focus on which task?" });
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: /UI design/ }).click();
    await expect(page).toHaveURL(/\/personal\/focus\?task=t-ui-design/);
  });
});

test.describe("states", () => {
  test("empty: Pick top 3 fills Priorities; Add block opens Quick add", async ({ page }) => {
    await openMyDay(page, { path: "/styleguide/my-day?state=empty", blocks: false });
    await expect(page.getByRole("heading", { name: "Nothing planned yet" })).toBeVisible();
    await expect(page.getByText(/You have 8h free today and 5 tasks waiting/)).toBeVisible();
    const priorities = page.getByRole("region", { name: "Priorities" });
    await expect(priorities).toContainText("No priorities yet");
    await page.getByRole("button", { name: "Pick top 3" }).click();
    await expect(toast(page, "Top 3 set for the day")).toBeVisible();
    await expect(priorities.getByRole("listitem")).toHaveCount(3);
    await expect(priorities).toContainText("3 for today");

    await page.getByRole("button", { name: "Add block" }).first().click();
    await expect(page).toHaveURL(/sheet=quick-add/);
    await expect(page.locator("[data-sheet]").first()).toBeVisible();
  });

  test("empty: the empty card is still a drop target", async ({ page }) => {
    await openMyDay(page, { path: "/styleguide/my-day?state=empty", blocks: false });
    const from = await center(unscheduledRow(page, "Pay electricity bill"));
    const zone = (await page.locator('[data-slot="empty-drop-zone"]').boundingBox())!;
    await dragAndDrop(page, from, { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 });
    await expect(block(page, "Pay electricity bill")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Nothing planned yet" })).toHaveCount(0);
  });

  test("overloaded: chips, and Move 2 to tomorrow applies with one Undo", async ({ page }) => {
    await openMyDay(page, { path: "/styleguide/my-day?state=overloaded" });
    await expect(capacity(page)).toContainText("9h 40m of 8h planned");
    await expect(capacity(page).locator('[data-state="over"]')).toHaveText("Overloaded");
    const strip = page.getByRole("region", { name: "Timeline" }).getByRole("status").filter({ hasText: "Overloaded · 9h 40m of 8h" });
    await expect(strip).toContainText("1 overlap");
    await expect(page.locator('[data-slot="time-block"][data-overlap]')).toHaveCount(2);

    await strip.getByRole("button", { name: "Move 2 to tomorrow" }).click();
    const dialog = page.getByRole("dialog", { name: "Move 2 blocks" });
    await expect(dialog).toBeVisible();
    // Tomorrow is preselected.
    await expect(dialog.getByRole("menuitem", { name: /Tomorrow/ })).toHaveAttribute("data-active", "true");
    await dialog.getByRole("menuitem", { name: /Tomorrow/ }).click();

    await expect(dialog).toBeHidden();
    await expect(capacity(page)).toContainText("8h of 8h planned");
    // The overlap is still there: the day stays flagged until it is resolved.
    const stripNow = page.getByRole("region", { name: "Timeline" }).getByRole("status").filter({ hasText: "Overloaded" });
    await expect(stripNow).not.toContainText("9h 40m");
    await expect(stripNow).toContainText("1 overlap");
    const moved = toasts(page).filter({ hasText: /Moved 2 blocks to tomorrow/ });
    await expect(moved).toHaveCount(1);
    await moved.getByRole("button", { name: "Undo" }).click();
    await expect(capacity(page)).toContainText("9h 40m of 8h planned");
    await expect(page.locator('[data-slot="time-block"]')).toHaveCount(7);
  });

  test("partial: the gap says how many tasks fit", async ({ page }) => {
    await openMyDay(page, { path: "/styleguide/my-day?state=partial" });
    const gaps = page.locator('[data-slot="gap-hint"]');
    await expect(gaps.first()).toContainText(/free.*\d+ tasks? fit/);
    await expect(page.locator('[data-slot="free-slot"]')).toHaveCount(0);
    // And a drop into the gap still works.
    const from = await center(unscheduledRow(page, KATY));
    await dragAndDrop(page, from, { x: await columnX(page), y: await yAt(page, 14 * 60 + 2) });
    await expect(block(page, "Katy")).toHaveCount(1);
  });

  test("no-current: no 'Now' chip on the timeline, the card is not live", async ({ page }) => {
    await openMyDay(page, { path: "/styleguide/my-day?state=no-current" });
    await expect(page.locator('[data-slot="time-block"][data-current]')).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Now" })).toContainText("Up next");
    // The now line still shows where 14:35 is.
    await expect(page.locator('[data-slot="now-line"]')).toHaveCount(1);
  });
});

test.describe("3 days view", () => {
  const TODAY = "2026-10-13";
  const TOMORROW = "2026-10-14";
  const columns = (page: Page) => page.locator('[data-slot="day-column"]');

  test("the switch sets ?view=3days and renders three columns with headers", async ({ page }) => {
    await openMyDay(page);
    const group = page.getByRole("radiogroup", { name: "Timeline view" });
    await expect(group.getByRole("radio", { name: "Day", exact: true })).toHaveAttribute("aria-checked", "true");
    await group.getByRole("radio", { name: "3 days" }).click();
    await expect(page).toHaveURL(/view=3days/);
    await expect(columns(page)).toHaveCount(3);
    await expect(page.locator('[data-slot="day-header"]')).toHaveCount(3);
    await expect(page.locator('[data-slot="day-header"][data-today]')).toContainText("Today");
    // Back to one day.
    await group.getByRole("radio", { name: "Day", exact: true }).click();
    await expect(columns(page)).toHaveCount(1);
    await expect(page).not.toHaveURL(/view=3days/);
  });

  test("?view=3days opens it directly; a block drags to another day with 15-minute snap", async ({ page }) => {
    await openMyDay(page, { path: "/personal/my-day?view=3days" });
    await expect(columns(page)).toHaveCount(3);
    const start = await center(blockButton(page, "Gym"));
    const grabOffset = start.y - (await yAt(page, 17 * 60 + 15));
    const target = { x: await columnX(page, TOMORROW), y: (await yAt(page, 12 * 60 + 40)) + grabOffset };
    await dragAndDrop(page, start, target, async () => {
      await expect(page.locator('[data-slot="drag-ghost"]')).toBeVisible();
      await expect(page.locator(`[data-slot="day-column"][data-day="${TOMORROW}"] [data-slot="drag-ghost"]`)).toBeVisible();
    });
    // 12:40 snaps to 12:45.
    const moved = page.locator(`[data-slot="day-column"][data-day="${TOMORROW}"]`).locator('[data-slot="time-block"]').filter({ hasText: "Gym" });
    await expect(moved).toHaveCount(1);
    expect(await moved.locator("[aria-roledescription]").getAttribute("aria-label")).toContain("12:45 – 13:45");
    await expect(page.locator(`[data-slot="day-column"][data-day="${TODAY}"]`).locator('[data-slot="time-block"]').filter({ hasText: "Gym" })).toHaveCount(0);
    const done = toast(page, /Moved “Gym” to 12:45/);
    await expect(done).toBeVisible();
    await done.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(`[data-slot="day-column"][data-day="${TODAY}"]`).locator('[data-slot="time-block"]').filter({ hasText: "Gym" })).toHaveCount(1);
  });

  test("keyboard: ArrowRight moves the lifted block to the next day", async ({ page }) => {
    await openMyDay(page, { path: "/personal/my-day?view=3days" });
    await blockButton(page, "Gym").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await expect(liveRegion(page)).toContainText(/Gym at 17:15, Wednesday 14 Oct/);
    await page.keyboard.press("Enter");
    await expect(
      page.locator(`[data-slot="day-column"][data-day="${TOMORROW}"]`).locator('[data-slot="time-block"]').filter({ hasText: "Gym" }),
    ).toHaveCount(1);
  });

  test("Persian (RTL): the columns run right to left and ArrowLeft is the next day", async ({ page }) => {
    await openMyDay(page, { path: "/personal/my-day?view=3days", mode: "light-rtl-fa" });
    const todayBox = (await page.locator(`[data-slot="day-column"][data-day="${TODAY}"]`).boundingBox())!;
    const tomorrowBox = (await page.locator(`[data-slot="day-column"][data-day="${TOMORROW}"]`).boundingBox())!;
    expect(todayBox.x).toBeGreaterThan(tomorrowBox.x);
    await blockButton(page, "Gym").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(
      page.locator(`[data-slot="day-column"][data-day="${TOMORROW}"]`).locator('[data-slot="time-block"]').filter({ hasText: "Gym" }),
    ).toHaveCount(1);
  });
});

test.describe("phone (390px, touch)", () => {
  test.use({ hasTouch: true, isMobile: true });

  const tray = (page: Page) => page.locator('[data-slot="unscheduled-zone"]:visible');
  const trayToggle = (page: Page) => page.locator('[data-slot="unscheduled-zone"]:visible button[aria-expanded]');

  async function noOverflow(page: Page) {
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }

  for (const mode of ["light-ltr-en", "dark-ltr-en", "light-rtl-fa", "dark-rtl-fa"] as const) {
    test(`${mode}: no overflow; the tray sits just above the bottom nav in the first viewport`, async ({ page }) => {
      await openMyDay(page, { mode, viewport: PHONE });
      await noOverflow(page);
      const nav = (await page.locator('[data-slot="mobile-nav"]').boundingBox())!;
      const bar = (await tray(page).boundingBox())!;
      // Visible in the first screen, not hidden behind the nav, and close to it.
      expect(bar.y).toBeGreaterThan(0);
      expect(bar.y + bar.height).toBeLessThanOrEqual(nav.y + 1);
      expect(nav.y - (bar.y + bar.height)).toBeLessThan(48);
      await expect(trayToggle(page)).toHaveAttribute("aria-expanded", "false");
      // The timeline card scrolls inside; the page itself does not need to.
      const scroller = page.locator('[data-slot="timeline-scroller"]');
      expect(await scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
      expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      // Scrolling the page keeps everything reachable (nothing is hidden for good behind the nav).
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const after = (await tray(page).boundingBox())!;
      expect(after.y + after.height).toBeLessThanOrEqual(nav.y + 1);
      await noOverflow(page);
    });
  }

  test("the current block wraps its title and meta instead of truncating", async ({ page }) => {
    await openMyDay(page, { viewport: PHONE });
    const current = page.locator('[data-slot="time-block"][data-current]');
    await expect(current).toBeVisible();
    const clipped = await current.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>(".truncate, .line-clamp-2, .line-clamp-3")].map((node) => ({
        text: node.textContent,
        clipped: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1,
      })),
    );
    expect(clipped.filter((item) => item.clipped)).toEqual([]);
    // PM01: the Now chip stays on the first row.
    await expect(current).toContainText("Now");
    await expect(current).toContainText("14:00 – 16:00");
    await expect(current).toContainText("35m left");
    await expect(current).toContainText("UI design · My Day screen");
  });

  test("the tray expands and collapses; the timeline makes room", async ({ page }) => {
    await openMyDay(page, { viewport: PHONE });
    const scroller = page.locator('[data-slot="timeline-scroller"]');
    const before = (await scroller.boundingBox())!;
    await expect(page.getByRole("radiogroup", { name: "Filter unscheduled tasks" })).toHaveCount(0);
    await trayToggle(page).tap();
    await expect(trayToggle(page)).toHaveAttribute("aria-expanded", "true");
    await expect(tray(page).getByRole("button", { name: KATY })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Filter unscheduled tasks" })).toBeVisible();
    const open = (await scroller.boundingBox())!;
    expect(open.height).toBeLessThan(before.height);
    await noOverflow(page);
    // Still above the nav.
    const nav = (await page.locator('[data-slot="mobile-nav"]').boundingBox())!;
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bar = (await tray(page).boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(nav.y + 1);

    await trayToggle(page).tap();
    await expect(trayToggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(tray(page).getByRole("button", { name: KATY })).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    const closed = (await scroller.boundingBox())!;
    expect(Math.abs(closed.height - before.height)).toBeLessThan(2);
  });

  test("long-press a tray row and drag it up into the timeline (touch events)", async ({ page }) => {
    await openMyDay(page, { viewport: PHONE });
    await trayToggle(page).tap();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", point?: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [{ x: point.x, y: point.y }] : [] });

    // Put 12:00 – 13:00 (a free hour) in the middle of the timeline scroller.
    const scroller = page.locator('[data-slot="timeline-scroller"]');
    await scroller.evaluate(async (el) => {
      const lines = [...el.querySelectorAll<HTMLElement>('[data-slot="hour-line"]')];
      const noon = lines.find((line) => (line.textContent ?? "").trim() === "12:00");
      if (!noon) return;
      el.scrollTop += noon.getBoundingClientRect().top - (el.getBoundingClientRect().top + el.clientHeight / 2);
    });
    const from = await center(tray(page).getByRole("button", { name: KATY }));
    const x = await columnX(page);
    const to = { x, y: await yAt(page, 12 * 60 + 17) };

    await touch("touchStart", from);
    // Moving before the long-press delay cancels the drag (it is a scroll).
    await page.waitForTimeout(260);
    await touch("touchMove", { x: from.x, y: from.y - 4 });
    for (let step = 1; step <= 12; step++) {
      await touch("touchMove", { x: from.x + ((to.x - from.x) * step) / 12, y: from.y + ((to.y - from.y) * step) / 12 });
      await page.waitForTimeout(16);
    }
    // Crossing the scroller's edge auto-scrolls it; let that settle, then aim at the minute again.
    await page.waitForTimeout(600);
    await touch("touchMove", { x: to.x, y: await yAt(page, 12 * 60 + 17) });
    await page.waitForTimeout(150);
    await expect(page.locator('[data-slot="drag-overlay-card"]')).toBeVisible();
    await expect(page.locator('[data-slot="drag-ghost"]')).toBeVisible();
    await touch("touchEnd");

    // 12:17 snaps to 12:15.
    await expect(block(page, "Katy")).toHaveCount(1);
    expect(await blockLabel(page, "Katy")).toContain("12:15 – 12:35");
    await expect(toast(page, "Scheduled “Reply to Katy’s brief” at 12:15")).toBeVisible();
    await expect(tray(page).getByRole("button", { name: KATY })).toHaveCount(0);
  });

  test("a quick swipe on a tray row scrolls instead of dragging", async ({ page }) => {
    await openMyDay(page, { viewport: PHONE });
    await trayToggle(page).tap();
    const cdp = await page.context().newCDPSession(page);
    const from = await center(tray(page).getByRole("button", { name: KATY }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
    for (let step = 1; step <= 6; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: from.y - step * 12 }] });
    }
    await expect(page.locator('[data-slot="drag-overlay-card"]')).toHaveCount(0);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(block(page, "Katy")).toHaveCount(0);
  });

  test("Reschedule opens as a bottom sheet from the block's ⋯; Esc returns focus to it", async ({ page }) => {
    await openMyDay(page, { viewport: PHONE });
    const call = blockButton(page, "Client call");
    await call.tap();
    const opener = page.getByRole("button", { name: "Reschedule Client call" });
    await opener.tap();
    const sheet = page.getByRole("dialog", { name: "Reschedule “Client call”" });
    await expect(sheet).toBeVisible();
    // A sheet at the bottom of the screen, not a popover.
    const box = (await sheet.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(PHONE.height - 4);
    expect(box.width).toBeGreaterThan(PHONE.width - 40);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.tap();
    await sheet.getByRole("menuitem", { name: /Tomorrow/ }).tap();
    await expect(block(page, "Client call")).toHaveCount(0);
    await expect(toast(page, /Moved .*Client call.* to tomorrow/)).toBeVisible();
  });

  test("the Today / Plan switch and the free-time chip are the whole header", async ({ page }) => {
    await openMyDay(page, { viewport: PHONE });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("My Day");
    await expect(page.getByText("1h 45m free").locator("visible=true")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    // Desktop-only pieces are not on a phone.
    await expect(page.getByRole("radiogroup", { name: "Energy today" })).toBeHidden();
    await expect(page.getByRole("region", { name: "Now" })).toBeHidden();
  });
});

test.describe("header at desktop widths", () => {
  for (const width of [1024, 1100, 1280, 1440]) {
    for (const mode of ["light-ltr-en", "light-rtl-fa"] as const) {
      test(`${mode} · ${width}: title and kicker never wrap, controls never overlap them`, async ({ page }) => {
        await openMyDay(page, { mode, viewport: { width, height: 1000 } });
        const header = page.locator('[data-screen="my-day"] > header');
        const h1 = header.getByRole("heading", { level: 1 });
        const kicker = header.locator("p").first();
        const lineHeight = (el: Locator) => el.evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));
        const h1Box = (await h1.boundingBox())!;
        const kickerBox = (await kicker.boundingBox())!;
        expect(h1Box.height).toBeLessThan((await lineHeight(h1)) * 1.5);
        expect(kickerBox.height).toBeLessThan((await lineHeight(kicker)) * 1.5);

        // No overlap between the title block and any control, no overflow past the viewport.
        const controls = header.locator("> div").last();
        const controlBoxes = await controls.locator("> *").evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }),
        );
        const titleRect = { x: Math.min(h1Box.x, kickerBox.x), y: kickerBox.y, right: Math.max(h1Box.x + h1Box.width, kickerBox.x + kickerBox.width), bottom: h1Box.y + h1Box.height };
        for (const box of controlBoxes) {
          const overlaps = box.x < titleRect.right && box.x + box.width > titleRect.x && box.y < titleRect.bottom && box.y + box.height > titleRect.y;
          expect(overlaps, `control at ${JSON.stringify(box)} overlaps the title`).toBe(false);
        }
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  }
});
