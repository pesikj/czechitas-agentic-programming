import { expect, test } from '@playwright/test';

test('images enlarge in a dialog and return focus', async ({ page }) => {
  await page.goto('/lekce/uvod-do-agentu/co-je-agent');
  const trigger = page.getByRole('link', { name: /Zvětšit obrázek: Schéma/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Zvětšený obrázek' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img')).toHaveAttribute('alt', /Schéma/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('missing images show a fallback while the part still loads', async ({ page }) => {
  await page.goto('/lekce/prace-s-promptem/iterace');
  await expect(page.locator('.image-missing')).toContainText('Obrázek není k dispozici');
  await expect(page.getByRole('heading', { name: 'Oddíl 8' })).toBeAttached();
});

test('code blocks are labelled; output has no copy button', async ({ page, context, browserName }) => {
  await page.goto('/lekce/uvod-do-agentu/instalace');
  const terminal = page.locator('.code-block[data-kind="terminal"]').first();
  await expect(terminal.locator('.code-label')).toHaveText('Terminál');
  await expect(page.locator('.code-block[data-kind="output"] .copy-button')).toHaveCount(0);

  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await terminal.getByRole('button', { name: /Kopírovat/ }).click();
  await expect(terminal.getByRole('button')).toHaveText('Zkopírováno');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('node --version');
});

test('alternatives become tabs and remember the choice', async ({ page }) => {
  await page.goto('/lekce/uvod-do-agentu/instalace');
  const windows = page.getByRole('tab', { name: 'Windows' });
  await windows.click();
  await expect(windows).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('PowerShell');
  await windows.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Linux' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Linux' })).toHaveAttribute('aria-selected', 'true');
});

test('exercise panel shows fields without blocking navigation', async ({ page }) => {
  await page.goto('/lekce/uvod-do-agentu/cviceni-prvni-prompt');
  const panel = page.getByRole('region', { name: 'Moje odpověď' });
  await expect(panel).toContainText('Použitý prompt');
  await expect(panel).toContainText('Odpověď je nepovinná');
  await page.getByRole('link', { name: /Předchozí část/ }).click();
  await expect(page).toHaveURL('/lekce/uvod-do-agentu/prvni-prompt');
});

test('only referenced assets are served', async ({ request }) => {
  expect((await request.get('/obsah/lectures/01-uvod/images/pracovni-postup.png')).status()).toBe(200);
  expect((await request.get('/obsah/course.yaml')).status()).toBe(404);
  expect((await request.get('/obsah/lectures/01-uvod/lecture.yaml')).status()).toBe(404);
  expect((await request.get('/obsah/..%2F..%2Fpackage.json')).status()).toBe(404);
});

test('theme toggle persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Tmavý režim' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-webtui-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-webtui-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Tmavý režim' })).toHaveAttribute('aria-pressed', 'true');
});
