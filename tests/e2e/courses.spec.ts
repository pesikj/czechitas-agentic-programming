// The e2e fixture's second course, "Digitální akademie: Data", lives under /data/.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SIGNED_OUT } from './seed';
import { createActiveUser, signedInContext } from './users';

const DATA_TITLE = 'Digitální akademie: Data';
const FIRST = '/data/lekce/tabulky/uvod-do-tabulek';
const SECOND = '/data/lekce/tabulky/filtry';
const PRIVATE = '/data/lekce/grafy/prvni-graf';

async function runCommand(page: Page, command: string) {
  const input = page.getByRole('combobox', { name: 'Příkaz pro navigaci webu' });
  await input.fill(command);
  await input.press('Enter');
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
  expect(serious.map((violation) => `${page.url()}: ${violation.id}`)).toEqual([]);
}

test('the title page links to the other course and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: DATA_TITLE }).click();
  await expect(page).toHaveURL('/data/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(DATA_TITLE);
  await expect(page.getByRole('region', { name: 'Lekce' }).getByRole('link')).toHaveText(['Tabulky', 'Grafy']);
  await expect(page.locator('.brand')).toHaveAttribute('href', '/data/');
  await expectAccessible(page);

  await page.getByRole('main').getByRole('link', { name: 'Agentní programování s Codex CLI a Claude Code' }).click();
  await expect(page).toHaveURL('/');
});

test('commands work within the current course', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, '/course data');
  await expect(page).toHaveURL('/data/');
  await runCommand(page, '/open 1');
  await expect(page).toHaveURL(FIRST);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Úvod do tabulek');
  await expectAccessible(page);
  await runCommand(page, '/next');
  await expect(page).toHaveURL(SECOND);
  await runCommand(page, '/home');
  await expect(page).toHaveURL('/data/');

  // The word appears only in the data course.
  await runCommand(page, '/search kontingenční');
  await expect(page).toHaveURL(/\/data\/hledat\?q=/);
  await expect(page.getByRole('status')).toHaveText('1 nalezená část pro „kontingenční“.');
  await expect(page.locator('.search-results').getByRole('link')).toHaveAttribute('href', FIRST);
  await expectAccessible(page);

  await runCommand(page, '/course 1');
  await expect(page).toHaveURL('/');
});

test('answers in the data course are saved', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'the editor flows are covered on desktop');
  const learner = await createActiveUser('data-answers');
  const page = await (await signedInContext(browser, learner)).newPage();
  await page.goto(PRIVATE);
  await expectAccessible(page);
  const panel = page.getByRole('region', { name: 'Moje odpověď' });
  await panel.getByLabel('Postup').fill('Vložila jsem data a zvolila sloupcový graf.');
  await panel.getByRole('button', { name: 'Uložit odpověď' }).click();
  await expect(panel.getByRole('status')).toContainText('Uloženo');
});

test('a course serves only its own lectures', async ({ page }) => {
  for (const path of ['/lekce/tabulky/uvod-do-tabulek', '/data/lekce/uvod-do-agentu/co-je-agent', '/agent/', '/neexistuje/']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('visitors see the public lectures of the data course', async ({ page }) => {
    const response = await page.goto('/data/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('region', { name: 'Lekce' }).getByRole('link')).toHaveText(['Tabulky']);

    expect((await page.goto(FIRST))?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Úvod do tabulek');

    await page.goto(PRIVATE);
    await expect(page).toHaveURL(`/prihlaseni?next=${encodeURIComponent(PRIVATE)}`);
  });
});

test('the data title page fits a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'checked in the mobile project');
  await page.goto('/data/');
  await expectAccessible(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
