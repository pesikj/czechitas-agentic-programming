import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SEED, SIGNED_OUT } from './seed';

const PAGES = [
  '/',
  '/lekce/uvod-do-agentu/instalace',
  '/lekce/prace-s-promptem/iterace',
  '/lekce/uvod-do-agentu/cviceni-prvni-prompt',
  '/lekce/uvod-do-agentu/neexistuje',
  '/hledat?q=prompt',
  '/moje-odpovedi',
];

for (const theme of ['light', 'dark'] as const) {
  test(`no serious accessibility violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const url of PAGES) {
      await page.goto(url);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
      expect(serious.map((violation) => `${url}: ${violation.id} — ${violation.nodes.map((node) => node.target).join(', ')}`)).toEqual([]);
    }
  });
}

test('no horizontal page scroll at narrow widths', async ({ page }) => {
  for (const width of [375, 700]) {
    await page.setViewportSize({ width, height: 800 });
    for (const url of PAGES) {
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${url} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});

test('mobile navigation drawer opens and closes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/lekce/uvod-do-agentu/instalace');
  const nav = page.getByRole('navigation', { name: 'Obsah kurzu' });
  await expect(nav).toBeHidden();
  const toggle = page.getByRole('button', { name: 'Obsah', exact: true });
  await toggle.click();
  await expect(nav).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: /Instalace nástrojů/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('the command bar never covers the end of the text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto('/lekce/prace-s-promptem/iterace');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const pager = await page.locator('.pager').boundingBox();
  const bar = await page.locator('.command-bar').boundingBox();
  expect(pager!.y + pager!.height).toBeLessThanOrEqual(bar!.y + 1);
});

test.describe('account and admin pages', () => {
  test.skip(({ isMobile }) => isMobile, 'checked on desktop');

  for (const theme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${theme})`, async ({ browser }) => {
      const pages: [string, string][] = [
        [SEED.admin.state, '/admin/uzivatele'],
        [SEED.admin.state, '/admin/obsah'],
        [SEED.admin.state, '/admin/odpovedi'],
        [SEED.learner.state, '/zmena-hesla'],
        ['', '/prihlaseni'],
        ['', '/lekce/shrnuti/shrnuti-kurzu'],
        ['', '/zapomenute-heslo'],
        ['', '/obnova-hesla/neplatny-odkaz'],
      ];
      for (const [state, url] of pages) {
        const context = await browser.newContext(state ? { storageState: state } : { storageState: SIGNED_OUT });
        const page = await context.newPage();
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(url);
        const results = await new AxeBuilder({ page }).analyze();
        const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
        expect(serious.map((violation) => `${url}: ${violation.id} — ${violation.nodes.map((node) => node.target).join(', ')}`)).toEqual([]);
        await context.close();
      }
    });
  }
});
