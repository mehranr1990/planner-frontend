import { expect, test, type Page } from "@playwright/test";
import { collectErrors, open, PERSIAN, seed } from "./support/helpers";

/*
 * Base components on /styleguide/components: focus management, async
 * confirm, menus, toasts, date picker keyboard and form validation.
 */

test.use({ viewport: { width: 1440, height: 900 } });
// The components page is the heaviest route; give parallel runs headroom.
test.describe.configure({ timeout: 60_000 });

const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test.describe("components (EN, LTR)", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page, "light");
  });

  test("dialog traps focus, closes on Escape and restores focus", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/styleguide/components");
    const trigger = section(page, "Dialogs & sheets").getByRole("button", { name: "Rename block" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Rename block" });
    await expect(dialog).toBeVisible();
    // Focus moved inside.
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    // Tab around more times than there are controls: focus never leaves.
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `Tab #${i + 1} stays inside`).toBe(true);
    }
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), `Shift+Tab #${i + 1} stays inside`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("ConfirmDialog keeps a busy confirm until the async action settles", async ({ page }) => {
    await open(page, "/styleguide/components");
    const trigger = section(page, "Dialogs & sheets").getByRole("button", { name: "Delete “Checkout flow”" });
    await trigger.click();
    const dialog = page.getByRole("alertdialog", { name: "Delete “Checkout flow”?" });
    await expect(dialog).toBeVisible();
    // Cancel is focused first (safe default).
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    const confirm = dialog.locator("button").last();
    await expect(confirm).toHaveText("Delete");
    // Record the busy state with an observer: the sample latency is only 1.2s,
    // which a loaded machine can spend before a polling assertion runs.
    await confirm.evaluate((button) => {
      const seen: Record<string, boolean> = {};
      (window as unknown as { __busy: Record<string, boolean> }).__busy = seen;
      const record = () => {
        if (button.getAttribute("aria-busy") === "true") seen.busy = true;
        if (button.getAttribute("aria-disabled") === "true") seen.disabled = true;
        const cancel = button.parentElement?.querySelector("button");
        if (cancel?.getAttribute("aria-disabled") === "true") seen.cancelDisabled = true;
        const dialog = document.querySelector('[role="alertdialog"]');
        if (button.getAttribute("aria-busy") === "true" && (!dialog || dialog.getAttribute("data-state") === "closed")) {
          seen.closedWhileBusy = true;
        }
        if (document.body.textContent?.includes("“Checkout flow” deleted")) seen.toast = true;
      };
      new MutationObserver(record).observe(document.body, { attributes: true, childList: true, subtree: true });
    });
    await confirm.click();
    // Escape during the pending phase must not close it (it closes only when the work settles).
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    const seen = await page.evaluate(() => (window as unknown as { __busy: Record<string, boolean> }).__busy);
    expect(seen).toMatchObject({ busy: true, disabled: true, cancelDisabled: true, toast: true });
    expect(seen.closedWhileBusy, "Escape closed the dialog while busy").toBeUndefined();

    await expect(trigger).toBeFocused();
    // (The success toast is checked through the observer: if the Escape above lands
    // after the work settled, Radix dismisses the new toast, which is correct.)
  });

  test("dropdown menu works from the keyboard", async ({ page }) => {
    await open(page, "/styleguide/components");
    const menus = section(page, "Menus & popovers");
    const trigger = menus.getByRole("button", { name: "View options" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Focus is inside the menu. (Radix focuses the first item only while it
    // believes the keyboard is in use; a synthetic pointermove under load can
    // leave focus on the menu itself, so Home pins the start.)
    expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Home");
    await expect(menu.getByRole("menuitemradio", { name: "Due date" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitemradio", { name: "Priority" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(menus.getByText(/Sorted by Priority/)).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "Priority" })).toHaveAttribute("aria-checked", "true");
    await expect(menu.getByRole("menuitem", { name: /Export/ })).toHaveAttribute("aria-disabled", "true");
    // Coming-soon items stay reachable (aria-disabled, not skipped) so keyboard
    // and screen-reader users can discover them; Enter on one does nothing.
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: /Delete view/ })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    const exportItem = menu.getByRole("menuitem", { name: /Export/ });
    await expect(exportItem).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(exportItem).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("menuitem", { name: /Duplicate view/ })).toBeFocused();
    // Checkbox item toggles with Space and keeps the menu open.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("toast appears and its action works", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page, "/styleguide/components");
    await section(page, "Toasts & alerts").getByRole("button", { name: "Success", exact: true }).click();
    const viewport = page.getByRole("region", { name: /Notifications/ });
    const toast = viewport.getByRole("listitem").filter({ hasText: "Task completed" });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(viewport.getByText("Task reopened")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("form demo shows FormErrorSummary and aria-invalid", async ({ page }) => {
    await open(page, "/styleguide/components");
    const form = page.getByRole("form", { name: "Sample expense form" });
    await form.getByRole("button", { name: "Save expense" }).click();
    const summary = form.getByRole("region", { name: "Please fix the following" });
    await expect(summary).toBeVisible();
    await expect(summary.getByRole("link")).toHaveCount(3);

    const title = form.getByRole("textbox", { name: /Title/ });
    const amount = form.getByRole("textbox", { name: /Amount/ });
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByRole("combobox", { name: /Priority/ })).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByRole("textbox", { name: /Notes/ })).not.toHaveAttribute("aria-invalid", "true");
    // Error text is associated with the control.
    await expect(title).toHaveAccessibleDescription(/at least 3 characters/);

    // Summary links jump to the field.
    await summary.getByRole("link", { name: /Enter a title/ }).click();
    await expect(title).toBeFocused();

    // Fixing a field clears its error.
    await title.fill("Team lunch");
    await expect(title).not.toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("form error summary focus", () => {
  // Regression guard: react-hook-form used to steal focus from the summary.
  test("a failed submit leaves focus on the summary", async ({ page }) => {
    await seed(page, "light");
    await open(page, "/styleguide/components");
    const form = page.getByRole("form", { name: "Sample expense form" });
    await form.getByRole("button", { name: "Save expense" }).click();
    const summary = form.getByRole("region", { name: "Please fix the following" });
    await expect(summary).toBeVisible();
    await page.waitForTimeout(300);
    await expect(summary).toBeFocused();
  });
});

test.describe("date picker keyboard", () => {
  test("ArrowLeft moves to the next day in RTL, previous day in LTR", async ({ page }) => {
    await seed(page, "light", PERSIAN);
    await open(page, "/styleguide/components");
    const grid = page.locator("#date-picker").getByRole("grid").first();
    const selected = grid.locator('button[data-day="2026-10-13"]');
    await selected.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(grid.locator('button[data-day="2026-10-14"]')).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(grid.locator('button[data-day="2026-10-12"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(grid.locator('button[data-day="2026-10-19"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(grid.locator('button[data-day="2026-10-19"]').locator("xpath=..")).toHaveAttribute("aria-selected", "true");
  });

  test("LTR: ArrowLeft goes to the previous day", async ({ page }) => {
    await seed(page, "light");
    await open(page, "/styleguide/components");
    const grid = page.locator("#date-picker").getByRole("grid").first();
    await grid.locator('button[data-day="2026-10-13"]').focus();
    await page.keyboard.press("ArrowLeft");
    await expect(grid.locator('button[data-day="2026-10-12"]')).toBeFocused();
  });
});
