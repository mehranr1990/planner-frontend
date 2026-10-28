import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { hideModules, MODES, MY_DAY_DEMO_ROUTES, open, openSheetRoute, PERSONAL_ROUTES, seedMode, type ModeName } from "./support/helpers";

/*
 * axe (wcag2a, wcag2aa, wcag21aa) on the shell and styleguide routes in
 * light + LTR (English) and dark + RTL (Persian), plus with the account
 * menu and the command palette open. No rules are disabled.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];
const ROUTES = ["/personal", "/projects", "/styleguide", "/styleguide/components", "/styleguide/navigation", "/styleguide/rules"] as const;

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 90_000 });

type Finding = { id: string; impact: string | null | undefined; help: string; targets: string[]; summary: string };

async function scan(page: Page, label: string): Promise<Finding[]> {
  // Let enter animations settle so colours are final.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const findings = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
    summary: violation.nodes[0]?.failureSummary?.split("\n").slice(0, 3).join(" ") ?? "",
  }));
  await test.info().attach(`axe-${label}.json`, { body: JSON.stringify(findings, null, 2), contentType: "application/json" });
  for (const finding of findings) {
    console.log(`[axe] ${label} :: ${finding.id} (${finding.impact}) x${finding.targets.length} :: ${finding.targets.slice(0, 6).join(" | ")} :: ${finding.summary}`);
  }
  return findings;
}

const brief = (findings: Finding[]) => findings.map((finding) => `${finding.id} (${finding.impact}) x${finding.targets.length}`);

for (const mode of Object.keys(MODES) as ModeName[]) {
  test.describe(`axe · ${mode}`, () => {
    test.beforeEach(async ({ page }) => {
      await seedMode(page, mode);
    });

    for (const route of [...ROUTES, ...PERSONAL_ROUTES.filter((route) => route !== "/personal"), ...MY_DAY_DEMO_ROUTES]) {
      test(`${route}`, async ({ page }) => {
        await open(page, route);
        const findings = await scan(page, `${mode}${route.replaceAll("/", "_")}`);
        expect(brief(findings)).toEqual([]);
      });
    }

    const openAccountMenu = async (page: Page) => {
      await open(page, "/personal");
      const name = mode === "dark-rtl-fa" ? "منوی حساب" : "Account menu";
      await page.getByRole("button", { name }).click();
      await expect(page.getByRole("menu")).toBeVisible();
    };

    test("/personal with the account menu open", async ({ page }) => {
      await openAccountMenu(page);
      const findings = await scan(page, `${mode}_personal_profile-menu`);
      // Every rule except the known issue below must be clean.
      expect(brief(findings)).toEqual([]);
    });

    // Regression guard: the account menu used to be a modal Radix menu that
    // aria-hid the shell while it still held tabbable controls (now modal={false}).
    test("/personal with the account menu open: no aria-hidden-focus", async ({ page }) => {
      await openAccountMenu(page);
      const findings = await scan(page, `${mode}_personal_profile-menu_aria-hidden-focus`);
      expect(brief(findings.filter((finding) => finding.id === "aria-hidden-focus"))).toEqual([]);
    });

    test("/personal with the context switcher open", async ({ page }) => {
      await open(page, "/personal");
      await page.getByRole("banner").getByRole("button").nth(1).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const findings = await scan(page, `${mode}_personal_switcher`);
      expect(brief(findings)).toEqual([]);
    });

    test("/personal at 390 with the More sheet open", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, "/personal");
      await page.locator('nav[data-scope] button[aria-haspopup="dialog"]').last().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const findings = await scan(page, `${mode}_personal_390_more-sheet`);
      expect(brief(findings)).toEqual([]);
    });

    for (const sheet of ["quick-add", "habit", "note"] as const) {
      test(`/personal/tasks with ?sheet=${sheet} open`, async ({ page }) => {
        await openSheetRoute(page, `/personal/tasks?sheet=${sheet}`);
        await expect(page.locator(`[data-sheet="${sheet}"]`)).toBeVisible();
        const findings = await scan(page, `${mode}_personal_sheet-${sheet}`);
        expect(brief(findings)).toEqual([]);
      });
    }

    test("/personal/tasks with the task drawer open", async ({ page }) => {
      await open(page, "/personal/tasks");
      await page.locator('[data-probe="tasks"] a').first().click();
      await expect(page.locator("[data-task-drawer]")).toBeVisible();
      const findings = await scan(page, `${mode}_personal_task-drawer`);
      expect(brief(findings)).toEqual([]);
    });

    test("/personal/finance hidden (Module hidden · Turn on)", async ({ page, context }) => {
      await hideModules(context, ["finance"]);
      await open(page, "/personal/finance");
      const findings = await scan(page, `${mode}_personal_finance-hidden`);
      expect(brief(findings)).toEqual([]);
    });

    test("/personal with the command palette open", async ({ page }) => {
      await open(page, "/personal");
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("dialog").filter({ has: page.getByRole("combobox") })).toBeVisible();
      const findings = await scan(page, `${mode}_personal_command-palette`);
      expect(brief(findings)).toEqual([]);
    });
  });
}
